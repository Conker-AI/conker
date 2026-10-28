import { useState } from 'react'
import { ShieldCheck, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cardLabels } from '@/lib/inbox-buttons'
import type { OwnerDecision, OwnerRequest } from '@/lib/gateway/owner'
import { canReleaseExpiredOwnerDecision, ownerDecisionEligibility, ownerUnavailableText, type RetainedOwnerDecision } from '@/components/gateway/owner-state'
import { InboxCard } from './inbox-card'
import { ReplyBox } from './reply-box'

const humanize = (value: string) => {
  const words = value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
const timestamp = (value: string) => new Date(value).toLocaleString()
function relativeTime(value: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(value)) / 60000))
  return minutes < 1 ? 'Just now' : minutes < 60 ? `${minutes} min ago` : minutes < 1440 ? `${Math.floor(minutes / 60)} hr ago` : `${Math.floor(minutes / 1440)} days ago`
}
function friendlyValue(value: unknown): string {
  if (value === null) return 'Not set'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.length ? value.map(friendlyValue).join('; ') : 'None'
  if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${humanize(key)}: ${friendlyValue(item)}`).join('; ') || 'None'
  return String(value)
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
  const eligibility = ownerDecisionEligibility(request, now)
  const expired = request.status === 'pending' && (eligibility.expired || request.unavailableReason === 'expired')
  const title = request.title || 'Review this action'
  const open = request.status === 'pending' && !expired
  const labels = cardLabels[request.card]
  const minutesLeft = request.approval.expiresAt ? Math.max(1, Math.ceil((Date.parse(request.approval.expiresAt) - now) / 60000)) : null
  const state = attempt ? 'Outcome not confirmed' : expired ? 'Expired, nothing was done' : request.status !== 'pending' ? humanize(request.status) : minutesLeft !== null ? `Expires in ${minutesLeft} min` : 'Waiting for you'
  const answers = attempt ? <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={busy} onClick={onCheck}>Check</Button></div>
    : open && changing ? <ReplyBox label="What should Conker do instead?" placeholder="Your words go to Conker in that chat. Nothing here runs." value={note} busy={busy}
      onChange={onNote} onSend={() => onDecide('rejected', false, note.trim())} onCancel={() => setChanging(false)} />
    : open ? <div className="flex flex-wrap gap-2">
      {eligibility.approve && <Button type="button" size="sm" variant={request.card === 'delete' || request.card === 'pay' ? 'destructive' : 'default'} disabled={busy} onClick={() => onDecide('approved', false, '')}>{labels.yes}</Button>}
      <Button type="button" size="sm" variant="outline" disabled={busy || !eligibility.reject} onClick={() => onDecide('rejected', false, '')}>{labels.no}</Button>
      <Button type="button" size="sm" variant="ghost" disabled={busy || !eligibility.reject} onClick={() => setChanging(true)}>Change</Button>
    </div> : null
  return <InboxCard icon={attempt ? <TriangleAlert className="text-warning-foreground" /> : <ShieldCheck />} title={title} summary={request.details || undefined}
    meta={<><span>Permission</span><span>{request.actor || 'Conker'}</span><span>{relativeTime(request.createdAt, now)}</span>{state && <span className={attempt ? 'text-warning-foreground' : undefined}>{state}</span>}</>}
    actions={answers} onLater={!detail && open && !attempt ? onLater : undefined} defaultExpanded={detail || !!attempt}
    footer={processing && <p role="status" className="text-xs text-muted-foreground">Waiting for verification or the recorded decision…</p>}>
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
    </div> : open && <p className="text-muted-foreground">{labels.yes} runs exactly this, once, now; the chat shows how it went. {labels.no} and Change run nothing. Your password confirms the decision.</p>}
    <Accordion><AccordionItem value="technical"><AccordionTrigger>Technical details</AccordionTrigger><AccordionContent><div className="flex flex-col gap-3 text-sm">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 break-words"><dt>Request ID</dt><dd className="break-all">{request.id}</dd><dt>Type</dt><dd>{request.action.subjectType ?? 'Unavailable'}</dd><dt>Subject ID</dt><dd className="break-all">{request.action.subjectId ?? 'Unavailable'}</dd><dt>Version</dt><dd>{request.action.version ?? 'Unavailable'}</dd><dt>Origin verified</dt><dd>{request.approval.originValid ? 'Yes' : 'No'}</dd><dt>Status</dt><dd>{humanize(request.status)}</dd></dl>
      <p>Created {timestamp(request.createdAt)} · Updated {timestamp(request.updatedAt)}</p>
      {request.approval.expiresAt && <p>Expires {timestamp(request.approval.expiresAt)}</p>}
      {request.approval.consumedAt && <p>Consumed {timestamp(request.approval.consumedAt)}</p>}
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs leading-6" tabIndex={0} aria-label="Exact action arguments">{JSON.stringify(request.action.args, null, 2)}</pre>
      {!attempt && request.status === 'pending' && eligibility.reject && <div className="flex flex-col gap-3">
        {expired && <>
          <p className="text-muted-foreground">You can still close this saved request. This cannot authorize or run the expired action.</p>
          <Label htmlFor={`expired-note-${request.id}`}>Note (optional)</Label>
          <Textarea id={`expired-note-${request.id}`} value={note} maxLength={2000} disabled={busy} onChange={event => onNote(event.target.value)} />
        </>}
        <div className="flex flex-col gap-2 sm:flex-row">
          {expired && <Button type="button" variant="outline" disabled={busy} onClick={() => onDecide('rejected')}>Deny expired request</Button>}
          <Button type="button" variant="ghost" disabled={busy} onClick={() => onDecide('dismissed')}>Dismiss request</Button>
        </div>
      </div>}
    </div></AccordionContent></AccordionItem></Accordion>
  </InboxCard>
}
