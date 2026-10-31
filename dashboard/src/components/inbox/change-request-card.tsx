import { useId, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { BookmarkPlus, CalendarClock, Wrench } from 'lucide-react'
import { IdentityMark } from '@/components/brand/identity-mark'
import { serviceIn } from '@/components/brand/service'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { gatewayConversationLink } from '@/components/gateway/navigation'
import { toolDraftStatus, type ChangeRequest, type ToolDraftRequest } from '@/lib/gateway/change-requests'
import { InboxCard, type InboxFact } from './inbox-card'
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
  if (request.payload.status === 'drafting' || request.payload.status === 'failed' || request.payload.status === 'needs_detail') return null
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
  const steps = request.payload.status === 'drafting' || request.payload.status === 'failed' || request.payload.status === 'needs_detail' ? [] : request.payload.steps
  if (!steps.length) return null
  return <div className="flex flex-col gap-1">
    <p className="text-xs text-muted-foreground">What it does, step by step</p>
    <ol className="list-decimal space-y-0.5 pl-5 text-sm leading-6 marker:text-muted-foreground">{steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
  </div>
}

function chatLink(sessionId: string) {
  return <Button type="button" size="sm" variant="ghost" render={<Link to={gatewayConversationLink(sessionId)} />}>Open the chat</Button>
}

/** What Conker asked and what he said, once a question was answered: the same list on any status. */
function conversationOf(request: ChangeRequest) {
  return request.kind === 'tool_draft' ? request.payload.conversation ?? [] : []
}

function Conversation({ turns }: { turns: ReturnType<typeof conversationOf> }) {
  return <div className="flex flex-col gap-2">
    <p className="text-xs text-muted-foreground">Questions and answers so far</p>
    <ul className="flex flex-col gap-2">{turns.map((turn, index) => <li key={index}>
      <p className="text-xs text-muted-foreground">{turn.role === 'builder' ? 'Conker asked' : 'You said'}</p>
      <p className="whitespace-pre-wrap">{turn.content}</p>
    </li>)}</ul>
  </div>
}

/**
 * The drafter asked a question: it is shown plainly with a box and Answer. Nothing is cleared
 * until Pi took the answer, so a failed send keeps what he typed.
 */
function AnswerForm({ question, askedIn, busy, onAnswer }: { question: string | null | undefined; askedIn: string | null | undefined; busy: boolean; onAnswer: (text: string) => Promise<boolean> }) {
  const id = useId(), [text, setText] = useState('')
  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    if (busy || !text.trim()) return
    if (await onAnswer(text.trim())) setText('')
  }
  return <form className="flex flex-col gap-3" onSubmit={event => void submit(event)}>
    <div className="flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">Conker needs one detail to draft this tool</p>
      <p id={`${id}-question`} className="whitespace-pre-wrap text-sm font-medium leading-6">{question?.trim() || 'It didn’t say what it needs. Tell it more about the tool.'}</p>
    </div>
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Your answer</Label>
      <Textarea id={id} aria-describedby={`${id}-question`} value={text} maxLength={4000} disabled={busy} placeholder="Type your answer. Nothing is created yet."
        onChange={event => setText(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void submit() } }} />
    </div>
    <div className="flex flex-wrap gap-2">
      <Button type="submit" size="sm" disabled={busy || !text.trim()}>{busy ? 'Sending…' : 'Answer'}</Button>
      {askedIn && chatLink(askedIn)}
    </div>
  </form>
}

/**
 * One thing Conker asked to create. Approving makes it real; Don't creates nothing; Change creates
 * nothing and sends his words to that chat. A tool request fills in while Conker drafts it: a calm
 * progress line, then Review (ready) or the reason with Try again and Change (failed). When the
 * drafter asked a question (needs_detail) the card shows it with a box and Answer.
 */
export function ChangeRequestCard({ request, now, busy, error, onApprove, onDecline, onRetry, onAnswer, onLater }: {
  request: ChangeRequest; now: number; busy: boolean; error: string | null
  onApprove: () => void; onDecline: (reply?: string) => void; onRetry?: (description?: string) => void; onAnswer?: (text: string) => Promise<boolean>; onLater?: () => void
}) {
  const [changing, setChanging] = useState(false), [words, setWords] = useState('')
  const status = request.kind === 'tool_draft' ? toolDraftStatus(request) : null
  const action = request.kind === 'ai_job' ? 'Create job' : request.kind === 'tool_draft' ? 'Review' : 'Remember'
  const kind = request.kind === 'ai_job' ? 'AI job' : request.kind === 'tool_draft' ? 'Tool' : 'Memory'
  // Who asked, when and in which chat: the record, one "Advanced" tap away.
  const facts: InboxFact[] = [['From', request.kind === 'tool_draft' && !request.sessionId ? 'Your tool request' : 'Conker’s request'],
    ['Came', `${age(request.createdAt, now)} · ${new Date(request.createdAt * 1000).toLocaleString()}`], ...(request.sessionId ? [['Chat', chatLink(request.sessionId)] as InboxFact] : [])]
  const footer = error ? <p role="alert" className="text-sm text-destructive-foreground">{error}</p> : undefined
  const text = request.kind === 'memory' ? request.payload.text : request.summary || (request.kind === 'tool_draft' ? request.payload.description : '')
  // A tool or job request that names a service shows its logo (a Telegram tool reads as Telegram at a glance).
  const brand = request.kind === 'memory' ? null : serviceIn(request.title, text)
  const icon = brand ? <IdentityMark brand={brand} className="size-full border-0 bg-transparent" /> : request.kind === 'ai_job' ? <CalendarClock /> : request.kind === 'tool_draft' ? <Wrench /> : <BookmarkPlus />
  // A title that already says it all is not repeated underneath.
  const summary = text && !request.title.includes(text.trim()) ? text : undefined
  const turns = conversationOf(request), talk = turns.length ? <Conversation turns={turns} /> : undefined
  if (request.kind === 'tool_draft' && status === 'drafting') {
    // Working: nothing to decide yet, so no answers and no Later; only the chat it came from.
    return <InboxCard icon={icon} title={request.title} source={`${kind} · Drafting…`} summary={summary} facts={facts} advanced={talk} footer={footer} actions={<>
      <p role="status" className="flex items-center gap-2 text-sm"><Spinner aria-hidden="true" className="size-4 text-muted-foreground motion-reduce:animate-none" />Conker is drafting this tool…</p>
      <p className="text-xs text-muted-foreground">You can leave this page. The draft shows up here when it’s ready.</p>
      {request.sessionId && <div className="flex flex-wrap gap-2">{chatLink(request.sessionId)}</div>}
    </>} />
  }
  if (request.kind === 'tool_draft' && request.payload.status === 'needs_detail') {
    // Waiting for him: the question, a box and Answer. The chat it was asked in is one tap away.
    const { question, askedIn } = request.payload
    return <InboxCard icon={icon} title={request.title} source={`${kind} · Needs one detail`} openLabel="Answer" summary={summary} facts={facts} advanced={talk} onLater={onLater}
      footer={error ? <p role="alert" className="text-sm text-destructive-foreground">{error} Your answer is kept.</p> : undefined}
      actions={<AnswerForm question={question} askedIn={askedIn} busy={busy || !onAnswer} onAnswer={text => onAnswer?.(text) ?? Promise.resolve(false)} />} />
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
    return <InboxCard icon={icon} title={request.title} source={`${kind} · Couldn’t draft it`} summary={summary} facts={facts} advanced={talk} onLater={onLater} footer={footer}
      primary={<Button type="button" size="sm" disabled={busy || !onRetry} onClick={() => onRetry?.()}>{busy ? 'Working…' : 'Try again'}</Button>} actions={<>
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
  return <InboxCard icon={icon} title={request.title} source={request.kind === 'memory' ? 'Memory · To remember' : `${kind} · ${request.sessionId ? 'Conker’s request' : 'Your request'}`} summary={summary}
    primary={!changing && <Button type="button" size="sm" disabled={busy} onClick={onApprove}>{busy ? 'Working…' : action}</Button>}
    actions={<>{request.kind === 'tool_draft' && <Steps request={request} />}{answers}</>} facts={facts} advanced={talk} onLater={onLater} footer={footer}>
    <Details request={request} />
  </InboxCard>
}
