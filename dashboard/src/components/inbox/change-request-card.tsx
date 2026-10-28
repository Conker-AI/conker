import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BookmarkPlus, CalendarClock, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ChangeRequest } from '@/lib/gateway/change-requests'
import { InboxCard } from './inbox-card'
import { ReplyBox } from './reply-box'

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const effects = { read: 'Only reads', prepare: 'Prepares things, sends nothing', write: 'Changes or sends things' } as const

function age(seconds: number, now: number) {
  const minutes = Math.max(1, Math.floor((now - seconds * 1000) / 60_000))
  return minutes < 60 ? `${minutes} min ago` : minutes < 1440 ? `${Math.floor(minutes / 60)} hr ago` : `${Math.floor(minutes / 1440)} days ago`
}

function when(request: Extract<ChangeRequest, { kind: 'ai_job' }>) {
  const { timing, clock } = request.payload
  if (clock === false) return 'When its webhook is called'
  if (timing.kind === 'interval') return `Every ${timing.hours} ${timing.hours === 1 ? 'hour' : 'hours'}`
  if (timing.kind === 'weekly') return `Every ${days[timing.day]} at ${timing.time}`
  return `Every day at ${timing.time}`
}

type Node = { id?: unknown; type?: unknown; label?: unknown; config?: { tool?: unknown; toolId?: unknown } }

/** Exactly what approving would create, in plain words; nothing is hidden behind the summary. */
function Details({ request }: { request: ChangeRequest }) {
  if (request.kind === 'ai_job') return <dl className="grid gap-3 text-sm">
    <div><dt className="text-xs text-muted-foreground">When</dt><dd>{when(request)} · {request.payload.timeZone}</dd></div>
    <div><dt className="text-xs text-muted-foreground">Who runs it</dt><dd>{request.payload.agentId === 'companion' ? 'Conker' : request.payload.agentId}</dd></div>
    <div><dt className="text-xs text-muted-foreground">What it does each run</dt><dd className="whitespace-pre-wrap">{request.payload.instructions}</dd></div>
    <p className="text-xs text-muted-foreground">It reads with tools that need no confirmation; anything that would change something still asks you.</p>
  </dl>
  if (request.kind === 'memory') return <p className="text-xs text-muted-foreground">Saved word for word. You can change or forget it any time in Memory.</p>
  const document = request.payload.document as { nodes?: Node[]; effect?: keyof typeof effects; credentialRefs?: string[]; inputs?: { name?: string }[] }
  const calls = (document.nodes ?? []).filter(node => node.type === 'tool_call' || node.type === 'workflow_call')
  return <dl className="grid gap-3 text-sm">
    <div><dt className="text-xs text-muted-foreground">What it does</dt><dd>{effects[document.effect ?? 'write'] ?? 'Unknown'}</dd></div>
    <div><dt className="text-xs text-muted-foreground">Tools it calls</dt><dd>{calls.length ? calls.map(node => String(node.config?.tool ?? node.config?.toolId ?? node.label)).join(', ') : 'None'}</dd></div>
    <div><dt className="text-xs text-muted-foreground">Connections it uses</dt><dd>{document.credentialRefs?.length ? document.credentialRefs.join(', ') : 'None'}</dd></div>
    <div><dt className="text-xs text-muted-foreground">Inputs</dt><dd>{document.inputs?.length ? document.inputs.map(input => input.name).join(', ') : 'None'}</dd></div>
    {request.payload.issues.length > 0 && <div><dt className="text-xs text-muted-foreground">To check in the editor</dt><dd>{request.payload.issues.join(' ')}</dd></div>}
    <p className="text-xs text-muted-foreground">Saving it makes a draft you can open, change and publish in Tools. It can only use tools you already have.</p>
  </dl>
}

/**
 * One thing Conker asked to create. Approving makes it real; Don't creates nothing; Change creates
 * nothing and sends his words to that chat.
 */
export function ChangeRequestCard({ request, now, busy, error, onApprove, onDecline, onLater }: {
  request: ChangeRequest; now: number; busy: boolean; error: string | null
  onApprove: () => void; onDecline: (reply?: string) => void; onLater?: () => void
}) {
  const [changing, setChanging] = useState(false), [words, setWords] = useState('')
  const icon = request.kind === 'ai_job' ? <CalendarClock /> : request.kind === 'tool_draft' ? <Wrench /> : <BookmarkPlus />
  const action = request.kind === 'ai_job' ? 'Create job' : request.kind === 'tool_draft' ? 'Save as draft' : 'Remember'
  const answers = changing && request.sessionId
    ? <ReplyBox label="What should Conker do instead?" placeholder="Your words go to Conker in that chat. Nothing is created." value={words} busy={busy}
      onChange={setWords} onSend={() => onDecline(words.trim())} onCancel={() => setChanging(false)} />
    : <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" disabled={busy} onClick={onApprove}>{busy ? 'Working…' : action}</Button>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onDecline()}>Don’t</Button>
      {request.sessionId && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setChanging(true)}>Change</Button>}
    </div>
  return <InboxCard icon={icon} title={request.title} summary={request.kind === 'memory' ? request.payload.text : request.summary || undefined}
    meta={<><span>Conker’s request</span><span>{age(request.createdAt, now)}</span></>}
    actions={answers} onLater={onLater} footer={error ? <p role="alert" className="text-sm text-destructive-foreground">{error}</p> : undefined}>
    <Details request={request} />
    {request.sessionId && <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="ghost" render={<Link to={`/chat?session=${encodeURIComponent(request.sessionId)}`} />}>Open the chat</Button>
    </div>}
  </InboxCard>
}
