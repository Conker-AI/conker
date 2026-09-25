import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { OwnerDecision, OwnerRequest } from '@/lib/gateway/owner'
import { canReleaseExpiredOwnerDecision, ownerDecisionEligibility, ownerUnavailableText, type RetainedOwnerDecision } from '@/components/gateway/owner-state'

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
  return <><span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{expanded || text.length <= 180 ? text : `${text.slice(0, 180)}…`}</span>{text.length > 180 && <Button size="sm" variant="ghost" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>{expanded ? 'Show less' : 'Show more'}</Button>}</>
}

export function ApprovalCard({ request, now, detail, note, attempt, busy, processing, onNote, onDecide, onCheck, onRelease }: {
  request: OwnerRequest; now: number; detail: boolean; note: string; attempt?: RetainedOwnerDecision; busy: boolean; processing: boolean
  onNote: (note: string) => void; onDecide: (status: OwnerDecision, retry?: boolean) => void; onCheck: () => void; onRelease: () => void
}) {
  const [noteOpen, setNoteOpen] = useState(false)
  const eligibility = ownerDecisionEligibility(request, now)
  const expired = request.status === 'pending' && (eligibility.expired || request.unavailableReason === 'expired')
  const title = request.title || 'Review this action'
  return <Card className={detail ? 'min-w-0 py-6' : 'min-w-0'} aria-label={title}>
    <CardHeader>
      <CardTitle><h3 className="break-words [overflow-wrap:anywhere]">{detail ? title : <Link className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring" to={`/inbox?request=${encodeURIComponent(request.id)}`}>{title}</Link>}</h3></CardTitle>
      <CardDescription>{request.actor || 'Conker'} · {relativeTime(request.createdAt, now)}</CardDescription>
    </CardHeader>
    <CardContent className="flex min-w-0 flex-col gap-4">
      {request.details && <p className="whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{request.details}</p>}
      {request.action.args === null ? <p className="text-sm text-muted-foreground">Complete arguments are unavailable. Approval is disabled.</p> : <dl className="flex flex-col gap-3 text-sm leading-6">{Object.entries(request.action.args).map(([key, value]) => <div key={key} className="grid min-w-0 gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,3fr)] sm:gap-4"><dt className="break-words text-muted-foreground">{humanize(key)}</dt><dd className="min-w-0"><ArgumentValue value={value} /></dd></div>)}</dl>}
      {expired && !attempt && <p className="text-sm text-muted-foreground">This request expired. Nothing was done.</p>}
      {request.unavailableReason && <p className="text-sm leading-6 text-muted-foreground">{ownerUnavailableText[request.unavailableReason]}</p>}
      {!expired && request.status === 'pending' && request.approval.expiresAt && <p className="text-sm text-muted-foreground">Expires in {Math.max(1, Math.ceil((Date.parse(request.approval.expiresAt) - now) / 60000))} min</p>}
      {request.decision && <div className="flex flex-col gap-1 text-sm"><p>{humanize(request.decision.status)} · {request.decision.actor}</p><p className="text-muted-foreground">{timestamp(request.decision.at)}</p>{request.decision.note && <p className="whitespace-pre-wrap break-words">{request.decision.note}</p>}</div>}
      {attempt ? <div className="flex flex-col items-start gap-3"><p className="text-sm leading-6">A {attempt.status} decision may already have been saved. Check the request before trying again.</p><Button variant="outline" disabled={busy} onClick={onCheck}>Check saved request</Button>{canReleaseExpiredOwnerDecision(request, attempt) ? <Button variant="outline" disabled={busy} onClick={onRelease}>Review expired request</Button> : attempt.checked && request.status === 'pending' && <Button disabled={busy} onClick={() => onDecide(attempt.status, true)}>Retry identical decision</Button>}</div> : request.status === 'pending' && !expired && <>
        {noteOpen || note ? <div className="flex flex-col gap-2"><Label htmlFor={`note-${request.id}`}>Note (optional)</Label><Textarea id={`note-${request.id}`} value={note} maxLength={2000} disabled={busy} onChange={event => onNote(event.target.value)} placeholder="Add context for your decision…" /></div> : <Button variant="ghost" size="sm" className="self-start" onClick={() => setNoteOpen(true)}>Add a note</Button>}
        <p className="text-xs leading-5 text-muted-foreground">Approval allows this exact action once before expiry; it does not run it. Your owner password is required to record a decision.</p>
      </>}
      <Accordion type="single" collapsible><AccordionItem value="technical"><AccordionTrigger>Technical details</AccordionTrigger><AccordionContent><div className="flex flex-col gap-3 text-sm">
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
            {expired && <Button variant="outline" disabled={busy} onClick={() => onDecide('rejected')}>Deny expired request</Button>}
            <Button variant="ghost" disabled={busy} onClick={() => onDecide('dismissed')}>Dismiss request</Button>
          </div>
        </div>}
      </div></AccordionContent></AccordionItem></Accordion>
    </CardContent>
    {!attempt && request.status === 'pending' && !expired && <CardFooter className="flex-col items-stretch gap-2 sm:flex-row"><Button disabled={busy || !eligibility.approve} onClick={() => onDecide('approved')}>Approve</Button><Button variant="outline" disabled={busy || !eligibility.reject} onClick={() => onDecide('rejected')}>Deny</Button></CardFooter>}
    {processing && <CardFooter><p role="status" className="text-xs text-muted-foreground">Waiting for verification or the recorded decision…</p></CardFooter>}
  </Card>
}
