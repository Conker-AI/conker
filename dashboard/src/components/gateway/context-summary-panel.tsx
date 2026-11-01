import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { AlertDialog, AlertDialogClose, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { chatFeatureMessage } from '@/lib/gateway/chat-feature-errors'
import { GatewayError } from '@/lib/gateway/transport'
import type { ChatSummary, ChatSummaryClient, Compaction, SummaryDraft } from '@/lib/gateway/chat-summary'

type Slot = 'edit' | 'fold' | 'restore' | 'fork'

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const needsSettings = 'Save the context settings above first.'

/** The chat's summary: edit, draft, restore an older version, fold old messages into it, or continue in a new chat from it. */
export function ContextSummaryPanel(props: { client: ChatSummaryClient; sessionId: string; lastMessageId: string | null; disabled: boolean; onChanged: () => void }) {
  return <SummaryPanel key={props.sessionId} {...props} />
}

function SummaryPanel({ client, sessionId, lastMessageId, disabled, onChanged }: { client: ChatSummaryClient; sessionId: string; lastMessageId: string | null; disabled: boolean; onChanged: () => void }) {
  const navigate = useNavigate()
  const [summary, setSummary] = useState<ChatSummary | null>(null)
  const [compaction, setCompaction] = useState<Compaction | null>(null)
  const [policyRevision, setPolicyRevision] = useState(0)
  const [draft, setDraft] = useState<SummaryDraft | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(true)
  const [errors, setErrors] = useState<Partial<Record<Slot, string>>>({})
  const [forkOpen, setForkOpen] = useState(false)

  const load = useCallback(async (signal?: AbortSignal) => {
    const [nextSummary, nextCompaction, nextPolicy] = await Promise.all([
      client.summary(sessionId, signal), client.compaction(sessionId, signal), client.policyRevision(sessionId, signal),
    ])
    if (signal?.aborted) return
    setSummary(nextSummary)
    setCompaction(nextCompaction)
    setPolicyRevision(nextPolicy)
    setText(nextSummary.summary ?? '')
    setDraft(null)
  }, [client, sessionId])

  useEffect(() => {
    const controller = new AbortController()
    queueMicrotask(() => {
      if (controller.signal.aborted) return
      load(controller.signal)
        .catch(error => { if (!controller.signal.aborted) setErrors({ edit: chatFeatureMessage(error) }) })
        .finally(() => { if (!controller.signal.aborted) setBusy(false) })
    })
    return () => controller.abort()
  }, [load])

  /** Runs one write. A stale revision reloads the panel and still shows the message under the control that failed. */
  const act = async (slot: Slot, work: () => Promise<void>) => {
    setBusy(true)
    setErrors({})
    try {
      await work()
    } catch (error) {
      const message = chatFeatureMessage(error)
      if (error instanceof GatewayError && error.code === 'revision_conflict') await load().catch(() => undefined)
      setErrors({ [slot]: message })
    } finally {
      setBusy(false)
    }
  }

  const save = () => act('edit', async () => {
    if (!summary) return
    await client.save(sessionId, text, summary.revision)
    await load()
    onChanged()
  })
  const makeDraft = () => act('edit', async () => {
    const next = await client.draft(sessionId)
    setDraft(next)
    setText(next.summary)
  })
  const fold = () => act('fold', async () => {
    if (!draft) return
    await client.compact(sessionId, { policyRevision, summaryRevision: draft.summaryRevision, summary: text, covers: draft.messageIds })
    await load()
    onChanged()
  })
  const restore = (revision: number) => act('restore', async () => {
    if (!summary) return
    await client.restore(sessionId, revision, summary.revision)
    await load()
    onChanged()
  })
  const fork = () => act('fork', async () => {
    const result = await client.fork(sessionId, { policyRevision, lastMessageId, summary: summary?.summary ?? '' })
    setForkOpen(false)
    onChanged()
    navigate(`/chat/${result.sessionId}`)
  })

  const locked = disabled || busy
  const hasSettings = policyRevision > 0
  const earlier = summary?.versions.filter(version => version.revision !== summary.revision) ?? []
  const folded = compaction?.folded.length ?? 0

  return <section className="space-y-3" aria-label="Summary">
    <h3 className="text-sm font-medium">Summary</h3>

    <div className="space-y-2">
      <Textarea aria-label="Summary" rows={6} placeholder="No summary yet." value={text} disabled={locked || !summary} onChange={event => setText(event.target.value)} />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={locked || !summary || text === (summary.summary ?? '')} onClick={save}>Save</Button>
        <Button size="sm" variant="outline" disabled={locked || !summary} onClick={makeDraft}><Sparkles aria-hidden="true" />Draft with AI</Button>
      </div>
      {errors.edit && <p role="alert" className="text-xs text-destructive">{errors.edit}</p>}
    </div>

    {draft && <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Read {count(draft.messageIds.length, 'message', 'messages')}{draft.truncated && ' · shortened'}</p>
      <Button size="sm" variant="outline" disabled={locked || !hasSettings || text.trim() === ''} onClick={fold}>Fold these messages</Button>
      {!hasSettings && <p className="text-xs text-muted-foreground">{needsSettings}</p>}
    </div>}
    {errors.fold && <p role="alert" className="text-xs text-destructive">{errors.fold}</p>}

    {folded > 0 && <p className="text-xs text-muted-foreground">{folded === 1 ? '1 message folded' : `${folded} messages folded`} into the summary.</p>}

    {earlier.length > 0 && <Collapsible>
      <CollapsibleTrigger render={<Button size="sm" variant="ghost" className="-ml-2.5 text-xs" />}>Earlier versions ({earlier.length})</CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-2 space-y-2">
          {earlier.map(version => <li key={version.revision} className="space-y-1 rounded-md border p-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-muted-foreground">Version {version.revision} · {new Date(version.createdAt * 1000).toLocaleString()}{version.restoredFrom !== null && ` · restored from ${version.restoredFrom}`}</span>
              <Button size="sm" variant="ghost" disabled={locked} onClick={() => restore(version.revision)}>Restore</Button>
            </div>
            {version.summary && <p className="line-clamp-2 whitespace-pre-line break-words">{version.summary}</p>}
          </li>)}
        </ul>
        {errors.restore && <p role="alert" className="mt-2 text-xs text-destructive">{errors.restore}</p>}
      </CollapsibleContent>
    </Collapsible>}

    <div className="space-y-2">
      <Button size="sm" variant="outline" disabled={locked || !summary || !hasSettings} onClick={() => { setErrors({}); setForkOpen(true) }}>Continue in a new chat</Button>
      {summary && !hasSettings && <p className="text-xs text-muted-foreground">{needsSettings}</p>}
    </div>

    <AlertDialog open={forkOpen} onOpenChange={open => { if (!busy) setForkOpen(open) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Continue in a new chat?</AlertDialogTitle>
          <AlertDialogDescription>This chat closes and a new one starts from the summary and the pinned messages.</AlertDialogDescription>
          {errors.fork && <p role="alert" className="text-xs text-destructive">{errors.fork}</p>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" disabled={busy} />}>Cancel</AlertDialogClose>
          <Button disabled={busy || disabled} onClick={fork}>Continue</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>
}
