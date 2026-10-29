import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { InlineError } from '@/components/resilience/inline-error'
import { ChangeRequestCard } from '@/components/inbox/change-request-card'
import type { ChangeRequestsState } from '@/components/inbox/change-requests'
import type { ToolDraftRequest } from '@/lib/gateway/change-requests'

/**
 * Tools, "Describe a new tool": his words go to the same drafter Conker uses in a chat. The request
 * shows below as the same card as in the Inbox, and fills in while Conker drafts it in the
 * background; nothing runs or is published until he reviews and publishes it.
 */
export function DescribeTool({ requests }: { requests: ChangeRequestsState }) {
  const [text, setText] = useState(''), id = useId()
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer) }, [])
  const tools = requests.items.filter((item): item is ToolDraftRequest => item.kind === 'tool_draft')
  const busy = requests.pending === 'new'
  async function send() {
    if (!text.trim() || busy) return
    if (await requests.draft(text)) setText('')
  }
  return <section aria-labelledby={`${id}-title`} className="flex flex-col gap-3">
    <Card render={<form onSubmit={event => { event.preventDefault(); void send() }} />} className="gap-3 p-4">
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="font-medium leading-6">Describe a new tool</h2>
        <p id={`${id}-help`} className="text-sm text-muted-foreground">Say what it should do. Conker drafts it in the background; you review it before it can run.</p>
      </div>
      <Textarea aria-labelledby={`${id}-title`} aria-describedby={`${id}-help`} value={text} rows={3} maxLength={4000} disabled={busy} placeholder="Every morning, read my study group chat and list the deadlines."
        onChange={event => setText(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void send() } }} />
      {requests.failure?.id === 'new' && <p role="alert" className="text-sm text-destructive-foreground">{requests.failure.message} Your words are kept, and trying again won’t file it twice.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={busy || !text.trim()}>{busy ? 'Sending…' : requests.failure?.id === 'new' ? 'Try again' : 'Draft'}</Button>
        <span className="text-xs text-muted-foreground">It also shows in your <Link className="underline underline-offset-4 hover:text-foreground" to="/inbox">Inbox</Link>.</span>
      </div>
    </Card>
    {requests.error !== null && <InlineError error={requests.error} title="Tool requests didn’t load" onRetry={() => requests.load()} />}
    {tools.length > 0 && <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">Tool requests <span className="tabular-nums">{tools.length}</span></h2>
      {tools.map(request => <ChangeRequestCard key={request.id} request={request} now={now} busy={requests.pending === request.id}
        error={requests.failure?.id === request.id ? requests.failure.message : null}
        onApprove={() => void requests.approve(request)} onDecline={reply => void requests.decline(request, reply)} onRetry={description => void requests.retry(request, description)} />)}
    </div>}
    {requests.notice && <p role="status" className="text-sm leading-6 text-muted-foreground">{requests.notice.text}{requests.notice.link && <> <Link className="font-medium text-foreground underline underline-offset-4" to={requests.notice.link.to}>{requests.notice.link.label}</Link></>}</p>}
  </section>
}
