import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BookmarkPlus, CalendarClock, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { toolDraftStatus, type ChangeRequest, type ToolDraftRequest } from '@/lib/gateway/change-requests'
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
  if (request.payload.status === 'drafting' || request.payload.status === 'failed') return null
  const document = request.payload.document as { nodes?: Node[]; effect?: keyof typeof effects; credentialRefs?: string[]; inputs?: { name?: string }[] }
  const calls = (document.nodes ?? []).filter(node => node.type === 'tool_call' || node.type === 'workflow_call')
  return <dl className="grid gap-3 text-sm">
    <div><dt className="text-xs text-muted-foreground">What it does</dt><dd>{effects[document.effect ?? 'write'] ?? 'Unknown'}</dd></div>
    <div><dt className="text-xs text-muted-foreground">Tools it calls</dt><dd>{calls.length ? calls.map(node => String(node.config?.tool ?? node.config?.toolId ?? node.label)).join(', ') : 'None'}</dd></div>
    <div><dt className="text-xs text-muted-foreground">Connections it uses</dt><dd>{document.credentialRefs?.length ? document.credentialRefs.join(', ') : 'None'}</dd></div>
    <div><dt className="text-xs text-muted-foreground">Inputs</dt><dd>{document.inputs?.length ? document.inputs.map(input => input.name).join(', ') : 'None'}</dd></div>
    {request.payload.issues.length > 0 && <div><dt className="text-xs text-muted-foreground">To check in the editor</dt><dd>{request.payload.issues.join(' ')}</dd></div>}
    <p className="text-xs text-muted-foreground">Review saves it as a draft and opens it in Tools, where you can change and publish it. It can only use tools you already have.</p>
  </dl>
}

/** The tool's steps in plain words, as Conker drafted them: what Review would open. */
function Steps({ request }: { request: ToolDraftRequest }) {
  const steps = request.payload.status === 'drafting' || request.payload.status === 'failed' ? [] : request.payload.steps
  if (!steps.length) return null
  return <div className="flex flex-col gap-1">
    <p className="text-xs text-muted-foreground">What it does, step by step</p>
    <ol className="list-decimal space-y-0.5 pl-5 text-sm leading-6 marker:text-muted-foreground">{steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
  </div>
}

function chatLink(sessionId: string) {
  return <Button type="button" size="sm" variant="ghost" render={<Link to={`/chat?session=${encodeURIComponent(sessionId)}`} />}>Open the chat</Button>
}

/**
 * One thing Conker asked to create. Approving makes it real; Don't creates nothing; Change creates
 * nothing and sends his words to that chat. A tool request fills in while Conker drafts it: a calm
 * progress line, then Review (ready) or the reason with Try again and Change (failed).
 */
export function ChangeRequestCard({ request, now, busy, error, onApprove, onDecline, onRetry, onLater }: {
  request: ChangeRequest; now: number; busy: boolean; error: string | null
  onApprove: () => void; onDecline: (reply?: string) => void; onRetry?: (description?: string) => void; onLater?: () => void
}) {
  const [changing, setChanging] = useState(false), [words, setWords] = useState('')
  const status = request.kind === 'tool_draft' ? toolDraftStatus(request) : null
  const icon = request.kind === 'ai_job' ? <CalendarClock /> : request.kind === 'tool_draft' ? <Wrench /> : <BookmarkPlus />
  const action = request.kind === 'ai_job' ? 'Create job' : request.kind === 'tool_draft' ? 'Review' : 'Remember'
  const meta = <><span>{request.kind === 'tool_draft' && !request.sessionId ? 'Your tool request' : 'Conker’s request'}</span><span>{age(request.createdAt, now)}</span></>
  const footer = error ? <p role="alert" className="text-sm text-destructive-foreground">{error}</p> : undefined
  const text = request.kind === 'memory' ? request.payload.text : request.summary || (request.kind === 'tool_draft' ? request.payload.description : '')
  // A title that already says it all is not repeated underneath.
  const summary = text && !request.title.includes(text.trim()) ? text : undefined
  if (request.kind === 'tool_draft' && status === 'drafting') {
    // Working: nothing to decide yet, so no answers and no Later; only the chat it came from.
    return <InboxCard icon={icon} title={request.title} summary={summary} meta={meta} footer={footer} actions={<>
      <p role="status" className="flex items-center gap-2 text-sm"><Spinner aria-hidden="true" className="size-4 text-muted-foreground motion-reduce:animate-none" />Conker is drafting this tool…</p>
      <p className="text-xs text-muted-foreground">You can leave this page. The draft shows up here when it’s ready.</p>
      {request.sessionId && <div className="flex flex-wrap gap-2">{chatLink(request.sessionId)}</div>}
    </>} />
  }
  if (request.kind === 'tool_draft' && status === 'failed') {
    const reason = request.payload.status === 'failed' && request.payload.error ? request.payload.error : 'Conker couldn’t draft this tool.'
    const answers = changing
      ? <ReplyBox label="What should the tool do?" placeholder="Describe it again in your own words. Nothing is created." value={words} busy={busy} maxLength={4000} sendLabel="Draft again"
        onChange={setWords} onSend={() => { onRetry?.(words.trim()); setChanging(false) }} onCancel={() => setChanging(false)} />
      : <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy || !onRetry} onClick={() => onRetry?.()}>{busy ? 'Working…' : 'Try again'}</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onDecline()}>Don’t</Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy || !onRetry} onClick={() => { setWords(request.payload.description); setChanging(true) }}>Change</Button>
        {request.sessionId && chatLink(request.sessionId)}
      </div>
    return <InboxCard icon={icon} title={request.title} summary={summary} meta={meta} onLater={onLater} footer={footer} actions={<>
      <p className="text-sm text-destructive-foreground"><span className="font-medium">Couldn’t draft it:</span> {reason}</p>
      {answers}
    </>} />
  }
  const answers = changing && request.sessionId
    ? <ReplyBox label="What should Conker do instead?" placeholder="Your words go to Conker in that chat. Nothing is created." value={words} busy={busy}
      onChange={setWords} onSend={() => onDecline(words.trim())} onCancel={() => setChanging(false)} />
    : <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" disabled={busy} onClick={onApprove}>{busy ? 'Working…' : action}</Button>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onDecline()}>Don’t</Button>
      {request.sessionId && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setChanging(true)}>Change</Button>}
    </div>
  return <InboxCard icon={icon} title={request.title} summary={summary}
    meta={meta} actions={<>{request.kind === 'tool_draft' && <Steps request={request} />}{answers}</>} onLater={onLater} footer={footer}>
    <Details request={request} />
    {request.sessionId && <div className="flex flex-wrap gap-2">{chatLink(request.sessionId)}</div>}
  </InboxCard>
}
