import { useState } from 'react'
import { ShieldCheck, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cardLabels } from '@/lib/inbox-buttons'
import type { OwnerDecision, OwnerRequest } from '@/lib/gateway/owner'
import { canReleaseExpiredOwnerDecision, ownerDecisionEligibility, ownerUnavailableText, type RetainedOwnerDecision } from '@/components/gateway/owner-state'
import { InboxCard, type InboxFact } from './inbox-card'
import { ReplyBox } from './reply-box'
import { ApprovalConfirm } from './approval-confirm'
import { deleteConfirmName, friendlyValue, humanize } from './approval-words'

const timestamp = (value: string) => new Date(value).toLocaleString()
function relativeTime(value: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(value)) / 60000))
  return minutes < 1 ? 'Just now' : minutes < 60 ? `${minutes} min ago` : minutes < 1440 ? `${Math.floor(minutes / 60)} hr ago` : `${Math.floor(minutes / 1440)} days ago`
}
function ArgumentValue({ value }: { value: unknown }) {
  const [expanded, setExpanded] = useState(false)
  const text = friendlyValue(value)
  return <><span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{expanded || text.length <= 180 ? text : `${text.slice(0, 180)}…`}</span>{text.length > 180 && <Button type="button" size="sm" variant="ghost" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>{expanded ? 'Show less' : 'Show more'}</Button>}</>
}

/**
 * A permission request as one Inbox card: the tool's own yes and no (its button template) and
 * Change, all one tap away. Yes runs this exact action once, now; Change sends his words to Conker
 * instead and runs nothing here.
 */
export function ApprovalCard({ request, now, detail, note, attempt, busy, processing, onNote, onDecide, onCheck, onRelease, onLater }: {
  request: OwnerRequest; now: number; detail: boolean; note: string; attempt?: RetainedOwnerDecision; busy: boolean; processing: boolean
  onNote: (note: string) => void; onDecide: (status: OwnerDecision, retry?: boolean, note?: string) => void; onCheck: () => void; onRelease: () => void
  onLater?: () => void
}) {
  const [changing, setChanging] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmName, setConfirmName] = useState('')
  const eligibility = ownerDecisionEligibility(request, now)
  const expired = request.status === 'pending' && (eligibility.expired || request.unavailableReason === 'expired')
  const title = request.title || 'Review this action'
  const open = request.status === 'pending' && !expired
  const labels = cardLabels[request.card]
  const minutesLeft = request.approval.expiresAt ? Math.max(1, Math.ceil((Date.parse(request.approval.expiresAt) - now) / 60000)) : null
  const state = attempt ? 'Outcome not confirmed' : expired ? 'Expired, nothing was done' : request.status !== 'pending' ? humanize(request.status) : minutesLeft !== null ? `Expires in ${minutesLeft} min` : 'Waiting for you'
  const level = request.level
  // Level 3 is serious (delete, pay): its yes is destructive, and a delete keeps a typed name
  // between him and the password sheet. Level 2 first asks where it goes in its own dialog.
  const serious = level === 3
  const deleteName = request.card === 'delete' && serious ? deleteConfirmName(request) : null
  const confirmTyped = deleteName === null || confirmName === deleteName
  const answers = attempt ? <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={busy} onClick={onCheck}>Check</Button></div>
    : open && changing ? <ReplyBox label="What should Conker do instead?" placeholder="Your words go to Conker in that chat. Nothing here runs." value={note} busy={busy}
      onChange={onNote} onSend={() => onDecide('rejected', false, note.trim())} onCancel={() => setChanging(false)} />
    : open ? <div className="flex flex-col gap-2">
      {deleteName !== null && <>
        <Label htmlFor={`delete-confirm-${request.id}`} className="block [overflow-wrap:anywhere]">Type <strong className="font-semibold">{deleteName}</strong> to confirm</Label>
        <Input id={`delete-confirm-${request.id}`} value={confirmName} disabled={busy} autoComplete="off" onChange={event => setConfirmName(event.target.value)} />
      </>}
      <div className="flex flex-wrap gap-2">
        {eligibility.approve && <Button type="button" size="sm" variant={serious ? 'destructive' : 'default'} disabled={busy || !confirmTyped} onClick={() => level === 2 ? setConfirming(true) : onDecide('approved', false, '')}>{labels.yes}</Button>}
        <Button type="button" size="sm" variant="outline" disabled={busy || !eligibility.reject} onClick={() => onDecide('rejected', false, '')}>{labels.no}</Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy || !eligibility.reject} onClick={() => setChanging(true)}>Change</Button>
      </div>
    </div> : null
  // Folded: the tool's own yes, one tap away (it runs exactly what opening the card shows). Level 2
  // first asks where it goes in the "Are you sure?" dialog; level 3 never goes from a folded card:
  // Review opens it so the exact action is in view first.
  const risky = serious
  const primary = open && !changing && eligibility.approve && !attempt && !risky
    ? <Button type="button" size="sm" disabled={busy}
      onClick={() => level === 2 ? setConfirming(true) : onDecide('approved', false, '')}>{labels.yes}</Button> : undefined
  const source = <>{request.actor || 'Conker'} · <span className={attempt ? 'text-warning-foreground' : undefined}>{state}</span></>
  const facts: InboxFact[] = [
    ['Asked by', request.actor || 'Conker'], ['Came', `${relativeTime(request.createdAt, now)} · ${timestamp(request.createdAt)}`],
    ...(request.approval.expiresAt ? [['Expires', timestamp(request.approval.expiresAt)] as InboxFact] : []),
    ['Status', humanize(request.status)], ['Type', request.action.subjectType ?? 'Unavailable'], ['Origin verified', request.approval.originValid ? 'Yes' : 'No'],
    ['Request ID', <span className="break-all">{request.id}</span>], ['Subject ID', <span className="break-all">{request.action.subjectId ?? 'Unavailable'}</span>],
    ['Version', request.action.version ?? 'Unavailable'], ['Updated', timestamp(request.updatedAt)],
    ...(request.approval.consumedAt ? [['Consumed', timestamp(request.approval.consumedAt)] as InboxFact] : []),
  ]
  // What the footer promises about the proof, decided by the server's level, never by the page.
  const proofLine = level === 2 ? 'You confirm where it goes.' : level === 3 ? 'Your password confirms it.' : null
  const card = <InboxCard icon={attempt ? <TriangleAlert className="text-warning-foreground" /> : <ShieldCheck />} title={title} source={source} summary={request.details || undefined}
    primary={primary} openLabel={open && risky && !attempt ? 'Review' : undefined} actions={answers} facts={facts} onLater={!detail && open && !attempt ? onLater : undefined} defaultExpanded={detail || !!attempt}
    footer={processing && <p role="status" className="text-xs text-muted-foreground">Waiting for verification or the recorded decision…</p>}
    advanced={<>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs leading-6 text-foreground" tabIndex={0} aria-label="Exact action arguments">{JSON.stringify(request.action.args, null, 2)}</pre>
      {!attempt && request.status === 'pending' && eligibility.reject && <div className="flex flex-col gap-3">
        {expired && <>
          <p>You can still close this saved request. This cannot authorize or run the expired action.</p>
          <Label htmlFor={`expired-note-${request.id}`}>Note (optional)</Label>
          <Textarea id={`expired-note-${request.id}`} value={note} maxLength={2000} disabled={busy} onChange={event => onNote(event.target.value)} />
        </>}
        <div className="flex flex-col gap-2 sm:flex-row">
          {expired && <Button type="button" variant="outline" disabled={busy} onClick={() => onDecide('rejected')}>Deny expired request</Button>}
          <Button type="button" variant="ghost" disabled={busy} onClick={() => onDecide('dismissed')}>Dismiss request</Button>
        </div>
      </div>}
    </>}>
    {request.action.args === null ? <p className="text-muted-foreground">Complete arguments are unavailable. Approval is disabled.</p>
      : <dl className="flex flex-col gap-3">{Object.entries(request.action.args).map(([key, value]) => <div key={key} className="grid min-w-0 gap-1 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-4"><dt className="break-words text-muted-foreground">{humanize(key)}</dt><dd className="min-w-0"><ArgumentValue value={value} /></dd></div>)}</dl>}
    {expired && !attempt && <p className="text-muted-foreground">This request expired. Nothing was done.</p>}
    {request.unavailableReason && <p className="text-muted-foreground">{ownerUnavailableText[request.unavailableReason]}</p>}
    {request.decision && <div className="flex flex-col gap-1"><p>{humanize(request.decision.status)} · {request.decision.actor}</p><p className="text-muted-foreground">{timestamp(request.decision.at)}</p>{request.decision.note && <p className="whitespace-pre-wrap break-words">{request.decision.note}</p>}</div>}
    {attempt ? <div className="flex flex-col items-start gap-3">
      <p>A {attempt.status} decision may already have been saved. Check the request before trying again.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={onCheck}>Check saved request</Button>
        {canReleaseExpiredOwnerDecision(request, attempt) ? <Button type="button" variant="outline" disabled={busy} onClick={onRelease}>Review expired request</Button>
          : attempt.checked && request.status === 'pending' && <Button type="button" disabled={busy} onClick={() => onDecide(attempt.status, true)}>Retry identical decision</Button>}
      </div>
    </div> : open && <p className="text-muted-foreground">{labels.yes} runs exactly this, once, now; the chat shows how it went.{proofLine ? ` ${proofLine}` : ''} {labels.no} and Change run nothing.</p>}
  </InboxCard>
  if (confirming) return <>
    <ApprovalConfirm request={request} busy={busy} onConfirm={() => { setConfirming(false); onDecide('approved', false, '') }} onCancel={() => { setConfirming(false); setConfirmName('') }} />
    {card}
  </>
  return card
}
