import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FormActions, OverlayBody, TaskDialogContent } from '@/components/design-system/overlays'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import type { GatewayActivityClient } from '@/lib/gateway/activity'
import { createTurnRequestId, type GatewayRuntimeClient } from '@/lib/gateway/runtime'
import { gatewayError } from '@/lib/gateway/transport'
import { prepareTaskDispatch, readTaskDispatchSources, type PreparedTaskDispatch, type TaskDispatchIntent } from './task-dispatch-state'

export function TaskDispatchReview({ intent, activity, runtime, visible, busy, error, onPrepared, onClose, onSend, onForgotten }: {
  intent: TaskDispatchIntent; activity: GatewayActivityClient; runtime: GatewayRuntimeClient; visible: boolean; busy: boolean; error: string | null
  onForgotten: (sessionId: string) => void; onPrepared: (prepared: PreparedTaskDispatch) => void; onClose: () => void; onSend: (prepared: PreparedTaskDispatch) => void
}) {
  const [loading, setLoading] = useState(false), [loadError, setLoadError] = useState<string | null>(null), [reload, setReload] = useState(0)
  useEffect(() => {
    if (intent.prepared && !reload) return
    const controller = new AbortController()
    let current = true
    async function load() {
      setLoading(true); setLoadError(null)
      try {
        const { task, session } = await readTaskDispatchSources(intent.taskId, activity, runtime, id => { if (current) onForgotten(id) }, controller.signal)
        const prepared = prepareTaskDispatch(task, session, createTurnRequestId())
        if (current) onPrepared(prepared)
      } catch (failure) { if (current) setLoadError(failure instanceof Error && failure.name !== 'GatewayError' ? failure.message : gatewayError(failure).message) }
      finally { if (current) setLoading(false) }
    }
    void load()
    return () => { current = false; controller.abort() }
    // The prepared snapshot is intentionally frozen until an explicit reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity, runtime, intent.taskId, reload])
  const prepared = intent.prepared
  return <Dialog open={visible && intent.open} onOpenChange={open => { if (!open && !busy) onClose() }}><TaskDialogContent title="Work on this task" description="Review the saved objective before sending it to Companion." size="wide" showCloseButton={!busy} onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (busy) event.preventDefault() }}>
    <OverlayBody>
      {loading && <p role="status" className="text-sm text-muted-foreground">Loading the current task and conversation…</p>}
      {(loadError || error) && <p role="alert" className="text-sm text-destructive">{loadError || error}</p>}
      {prepared && !loading && !loadError && <><div className="space-y-2"><h3 className="text-sm font-semibold">Desired outcome</h3><p className="whitespace-pre-wrap break-words text-sm">{prepared.outcome}</p></div><div className="space-y-2"><h3 className="text-sm font-semibold">Completion criteria</h3><ol className="list-decimal space-y-2 pl-5 text-sm">{prepared.criteria.map((criterion, index) => <li key={index} className="break-words">{criterion}</li>)}</ol></div><p className="break-all text-xs text-muted-foreground">Saved revision {prepared.taskExpectedRevision} · Conversation {prepared.sessionId}</p><details><summary className="cursor-pointer text-xs font-medium">Exact message to send</summary><p className="mt-2 whitespace-pre-wrap break-words text-sm">{prepared.text}</p></details><p className="text-xs leading-5 text-muted-foreground">This starts a real conversation turn using the configured model and tools. Its run will be linked to this task. Completion remains yours to review; your existing chat draft stays separate.</p><Button asChild variant="link" className="h-auto justify-start p-0"><Link to={`/chats?session=${encodeURIComponent(prepared.sessionId)}`} onClick={onClose}>Review the source conversation</Link></Button></>}
    </OverlayBody>
    <FormActions inset><Button variant="outline" disabled={busy} onClick={onClose}>Close</Button><Button variant="outline" disabled={busy || loading} onClick={() => setReload(value => value + 1)}>Reload task</Button><Button disabled={busy || loading || !!loadError || !prepared} onClick={() => { if (prepared) onSend(prepared) }}>{busy ? 'Sending…' : 'Verify and send'}</Button></FormActions>
  </TaskDialogContent></Dialog>
}
