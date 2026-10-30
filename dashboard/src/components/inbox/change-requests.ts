import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { isDrafting, type ChangeRequest, type ChangeRequestsClient, type ToolDraftRequest } from '@/lib/gateway/change-requests'
import type { GatewayEditorDrafts } from '@/lib/gateway/editor-drafts'
import { parseToolDraft } from '@/lib/tool-workspace'
import { rememberDraftOrigin } from '@/lib/tool-draft-origin'
import { GatewayError, gatewayError } from '@/lib/gateway/transport'

/**
 * Conker's open requests and the owner's decisions on them. Reviewing a tool draft saves it in
 * Tools first, through the owner's own editor route, then opens it there; Pi only records which
 * draft it became.
 */
export type RequestNotice = { text: string; link?: { to: string; label: string } }

// While Conker drafts a tool in the background, the card fills in by itself: the list is read
// again every few seconds, only while something is drafting and the page is in view (ledger:
// work over 10 s runs in the background with a status line; reads may repeat, writes never do).
const DRAFTING_POLL_MS = 5000
const submissionId = () => `tooldraft_${crypto.randomUUID().replaceAll('-', '')}`
const message = (cause: unknown) => cause instanceof Error && !(cause as { kind?: string }).kind ? cause.message : gatewayError(cause).message

export function useChangeRequests(client: ChangeRequestsClient | undefined, drafts: GatewayEditorDrafts | undefined, active: boolean) {
  const navigate = useNavigate()
  const [items, setItems] = useState<ChangeRequest[] | null>(null), [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState<string | null>(null), [failure, setFailure] = useState<{ id: string; message: string } | null>(null)
  const [notice, setNotice] = useState<RequestNotice | null>(null)
  const generation = useRef(0), savedAs = useRef(new Map<string, string>()), submission = useRef<{ text: string; id: string } | null>(null)
  const load = useCallback(async () => {
    if (!client) return
    const current = ++generation.current
    try { const found = await client.list(); if (current === generation.current) { setItems(found); setError(null) } }
    catch (cause) { if (current === generation.current) setError(cause) }
  }, [client])
  useEffect(() => {
    let live = true
    if (active) queueMicrotask(() => { if (live) void load() })
    return () => { live = false }
  }, [active, load])
  const drafting = active && (items ?? []).some(isDrafting)
  useEffect(() => {
    if (!drafting) return
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, DRAFTING_POLL_MS)
    return () => window.clearInterval(timer)
  }, [drafting, load])
  const settle = (decided: ChangeRequest) => setItems(current => current?.filter(item => item.id !== decided.id) ?? current)
  const replace = (changed: ChangeRequest) => setItems(current => current ? [changed, ...current.filter(item => item.id !== changed.id)] : [changed])
  const approve = useCallback(async (request: ChangeRequest) => {
    if (!client) return
    setPending(request.id); setFailure(null); setNotice(null)
    try {
      let decided: ChangeRequest
      if (request.kind === 'tool_draft') {
        if (!drafts) throw new Error('Tools are not available here.')
        if (request.payload.status === 'drafting' || request.payload.status === 'failed' || request.payload.status === 'needs_detail') throw new Error('This draft isn’t ready yet.')
        let saved = savedAs.current.get(request.id)
        if (!saved) {
          let document
          try { document = parseToolDraft(JSON.stringify(request.payload.document)) }
          catch { throw new Error('This draft doesn’t fit the editor. Open the chat and ask Conker to fix it.') }
          // A draft with this name already exists: save this one beside it instead of over it.
          try { saved = (await drafts.save(document, 0)).id }
          catch (cause) {
            if (!(cause instanceof GatewayError && cause.status === 409)) throw cause
            saved = (await drafts.save({ ...document, id: `${document.id.slice(0, 56)}-${crypto.randomUUID().slice(0, 6)}` }, 0)).id
          }
          savedAs.current.set(request.id, saved)
        }
        decided = await client.saved(request.id, saved)
      } else decided = await client.approve(request.id)
      settle(decided)
      const made = typeof decided.result?.jobId === 'string' ? decided.result.jobId : typeof decided.result?.draftId === 'string' ? decided.result.draftId : null
      if (decided.state !== 'failed' && request.kind === 'tool_draft' && made) {
        // Review: the saved draft opens in Tools; publishing it there tells this request (and its chat).
        rememberDraftOrigin(made, request.id)
        navigate(`/tools?draft=${encodeURIComponent(made)}&request=${encodeURIComponent(request.id)}`)
        return
      }
      setNotice(decided.state === 'failed' ? { text: `“${request.title}” wasn’t made: ${String(decided.result?.reason ?? 'unknown reason')}` }
        : request.kind === 'ai_job' ? { text: 'Cron job created. It runs on its schedule.', link: made ? { to: `/jobs/${made}`, label: 'Open the job' } : undefined }
          : request.kind === 'tool_draft' ? { text: 'Saved as a draft. Check it, then publish it.', link: { to: '/tools?view=drafts', label: 'Open your drafts' } }
            : { text: 'Remembered.', link: { to: '/memory', label: 'Open memory' } })
    } catch (cause) { setFailure({ id: request.id, message: message(cause) }) }
    finally { setPending(null) }
  }, [client, drafts, navigate])
  const decline = useCallback(async (request: ChangeRequest, reply = '') => {
    if (!client) return
    setPending(request.id); setFailure(null); setNotice(null)
    try {
      settle(await client.decline(request.id, reply))
      setNotice(reply && request.sessionId ? { text: 'Nothing was created. Your words went to the chat.', link: { to: `/chat?session=${encodeURIComponent(request.sessionId)}`, label: 'Open the chat' } } : { text: 'Declined. Nothing was created.' })
    }
    catch (cause) { setFailure({ id: request.id, message: gatewayError(cause).message }) }
    finally { setPending(null) }
  }, [client])
  /** Try again (same words) or Change (his new words): Conker drafts it again; the card shows it. */
  const retry = useCallback(async (request: ToolDraftRequest, description?: string) => {
    if (!client) return
    setPending(request.id); setFailure(null); setNotice(null)
    try { replace(await client.retry(request.id, description)) }
    catch (cause) { setFailure({ id: request.id, message: gatewayError(cause).message }) }
    finally { setPending(null) }
  }, [client])
  /**
   * His answer to the drafter's question: the card shows whatever Pi answers (drafting again). If
   * Pi says it is no longer asking (409), the list is read again and he is told it was answered.
   * Returns whether Pi took it, so the card keeps his text when it did not.
   */
  const answer = useCallback(async (request: ToolDraftRequest, text: string): Promise<boolean> => {
    if (!client) return false
    setPending(request.id); setFailure(null); setNotice(null)
    try { replace(await client.answer(request.id, text)); return true }
    catch (cause) {
      if (cause instanceof GatewayError && cause.status === 409) {
        await load()
        setNotice({ text: 'That question was already answered.', link: request.sessionId ? { to: `/chat?session=${encodeURIComponent(request.sessionId)}`, label: 'Open the chat' } : undefined })
      } else setFailure({ id: request.id, message: gatewayError(cause).message })
      return false
    }
    finally { setPending(null) }
  }, [client, load])
  /**
   * A new tool from his own words. The same words keep the same submission id until Pi answers,
   * so trying again after a lost answer never files the request twice.
   */
  const draft = useCallback(async (description: string): Promise<boolean> => {
    if (!client) return false
    const text = description.trim()
    if (submission.current?.text !== text) submission.current = { text, id: submissionId() }
    setPending('new'); setFailure(null); setNotice(null)
    try { replace(await client.draft(text, submission.current.id)); submission.current = null; return true }
    catch (cause) { setFailure({ id: 'new', message: gatewayError(cause).message }); return false }
    finally { setPending(null) }
  }, [client])
  // Answered once the first read came back (or failed); no client means nothing to wait for.
  return { items: client ? items ?? [] : [], answered: !client || items !== null || error !== null, error, pending, failure, notice, load, approve, decline, retry, answer, draft }
}

export type ChangeRequestsState = ReturnType<typeof useChangeRequests>
