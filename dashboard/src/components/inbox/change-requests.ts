import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeRequest, ChangeRequestsClient } from '@/lib/gateway/change-requests'
import type { GatewayEditorDrafts } from '@/lib/gateway/editor-drafts'
import { parseToolDraft } from '@/lib/tool-workspace'
import { GatewayError, gatewayError } from '@/lib/gateway/transport'

/**
 * Conker's open requests and the owner's decisions on them. Approving a tool draft saves it in
 * Tools first, through the owner's own editor route; Pi only records which draft it became.
 */
export type RequestNotice = { text: string; link?: { to: string; label: string } }

export function useChangeRequests(client: ChangeRequestsClient | undefined, drafts: GatewayEditorDrafts | undefined, active: boolean) {
  const [items, setItems] = useState<ChangeRequest[] | null>(null), [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState<string | null>(null), [failure, setFailure] = useState<{ id: string; message: string } | null>(null)
  const [notice, setNotice] = useState<RequestNotice | null>(null)
  const generation = useRef(0), savedAs = useRef(new Map<string, string>())
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
  const settle = (decided: ChangeRequest) => setItems(current => current?.filter(item => item.id !== decided.id) ?? current)
  const approve = useCallback(async (request: ChangeRequest) => {
    if (!client) return
    setPending(request.id); setFailure(null); setNotice(null)
    try {
      let decided: ChangeRequest
      if (request.kind === 'tool_draft') {
        if (!drafts) throw new Error('Tools are not available here.')
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
      setNotice(decided.state === 'failed' ? { text: `“${request.title}” wasn’t made: ${String(decided.result?.reason ?? 'unknown reason')}` }
        : request.kind === 'ai_job' ? { text: 'Cron job created. It runs on its schedule.', link: made ? { to: `/jobs/${made}`, label: 'Open the job' } : undefined }
          : request.kind === 'tool_draft' ? { text: 'Saved as a draft. Check it, then publish it.', link: made ? { to: `/tools?draft=${encodeURIComponent(made)}`, label: 'Open the draft' } : undefined }
            : { text: 'Remembered.', link: { to: '/memory', label: 'Open memory' } })
    } catch (cause) { setFailure({ id: request.id, message: cause instanceof Error && !(cause as { kind?: string }).kind ? cause.message : gatewayError(cause).message }) }
    finally { setPending(null) }
  }, [client, drafts])
  const decline = useCallback(async (request: ChangeRequest) => {
    if (!client) return
    setPending(request.id); setFailure(null); setNotice(null)
    try { settle(await client.decline(request.id)); setNotice({ text: 'Declined. Nothing was created.' }) }
    catch (cause) { setFailure({ id: request.id, message: gatewayError(cause).message }) }
    finally { setPending(null) }
  }, [client])
  return { items: client ? items ?? [] : [], error, pending, failure, notice, load, approve, decline }
}
