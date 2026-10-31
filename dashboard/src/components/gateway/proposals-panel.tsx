import { Link } from 'react-router-dom'
import { Lightbulb } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InboxCard } from '@/components/inbox/inbox-card'
import type { Proposal, ProposalDecision } from '@/lib/gateway/proposals'
import { gatewayConversationLink } from './navigation'

const age = (seconds: number) => {
  const minutes = Math.max(0, Math.floor((Date.now() - seconds * 1000) / 60000))
  return minutes < 60 ? `${Math.max(1, minutes)} min ago` : minutes < 1440 ? `${Math.floor(minutes / 60)} hr ago` : `${Math.floor(minutes / 1440)} days ago`
}

/** An idea from the nightly pass as one Inbox card: what Conker noticed, why, and what accepting means. */
export function IdeaCard({ item, pending, failure, onDecide, onLater }: {
  item: Proposal; pending: boolean; failure: string | null; onDecide: (decision: ProposalDecision) => void; onLater?: () => void
}) {
  const accept = <Button type="button" size="sm" disabled={pending} onClick={() => onDecide('accept')}>Accept</Button>
  return <InboxCard icon={<Lightbulb />} title={item.title} source="Idea from Conker" summary={item.suggestion}
    primary={accept}
    actions={<div className="flex flex-wrap gap-2">
      {accept}
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => onDecide('decline')}>Not now</Button>
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => onDecide('never')}>Never suggest this</Button>
    </div>}
    onLater={onLater}
    facts={[['From', 'Conker’s nightly pass'], ['Came', `${age(item.createdAt)} · ${new Date(item.createdAt * 1000).toLocaleString()}`], ['Not now', 'Hides this idea for 30 days']]}
    advanced={<div className="flex flex-col gap-2">
      <p>Why</p>
      {item.evidence.length ? <ul className="flex flex-col gap-2">{item.evidence.map(source => <li key={source.messageId} className="min-w-0 break-words">{source.available
        ? <Link className="rounded-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring" to={gatewayConversationLink(source.sessionId, source.messageId)}>&ldquo;{source.excerpt}&rdquo;</Link>
        : <span>This message was forgotten.</span>}</li>)}</ul>
        : <p>No cited messages are available.</p>}
    </div>}
    footer={failure && <p role="alert" className="text-sm text-destructive-foreground">{failure}</p>}>
    <p><span className="text-muted-foreground">Noticed: </span>{item.noticed}</p>
    <p><span className="text-muted-foreground">If you accept: </span>{item.ifApproved}</p>
  </InboxCard>
}
