import { Link } from 'react-router-dom'
import { History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { gatewayConversationLink } from '@/components/gateway/navigation'
import type { RecallNotice } from '@/lib/gateway/recall-notices'
import { InboxCard } from './inbox-card'

const WHAT: Record<RecallNotice['change'], string> = {
  corrected: 'You corrected a memory. Those answers were written before that, so they may still say the old thing.',
  forgotten: 'You told Conker to forget a memory. Those answers were written before that, so they may still repeat it.',
  changed: 'You changed a memory. Those answers were written before that, so they may be out of date.',
}
const WHEN: Record<RecallNotice['change'], string> = { corrected: 'Memory corrected', forgotten: 'Memory forgotten', changed: 'Memory changed' }

/**
 * "A memory you corrected was used" (R-U3): earlier answers leaned on a memory he has since changed.
 * The chats are listed so he can look; nothing in them is rewritten. Dismiss hides this card only.
 */
export function RecallNoticeCard({ notice, now, busy, error, onDismiss }: { notice: RecallNotice; now: number; busy: boolean; error: string | null; onDismiss: () => void }) {
  const more = notice.chats - notice.sessions.length
  return (
    <InboxCard
      icon={<History />}
      title={notice.title}
      source={WHEN[notice.change]}
      came={{ at: notice.since * 1000, now }}
      openLabel="See the chats"
      onLater={busy ? undefined : onDismiss}
      laterLabel="Dismiss"
      summary={`${WHAT[notice.change]} The chats below are unchanged.`}
      actions={
        <>
          {notice.sessions.length > 0 && (
            <ul aria-label="Chats with these answers" className="flex min-w-0 flex-col divide-y rounded-md border">
              {notice.sessions.map(chat => (
                <li key={chat.id} className="flex min-w-0 items-center gap-3 px-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate">{chat.title || 'Untitled chat'}</span>
                  <Button type="button" size="xs" variant="ghost" render={<Link to={gatewayConversationLink(chat.id)} aria-label={`Open the chat ${chat.title || 'Untitled chat'}`} />}>
                    Open chat
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {more > 0 && (
            <p className="text-muted-foreground">
              and {more} more {more === 1 ? 'chat' : 'chats'}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onDismiss}>
              Dismiss
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive-foreground">
              {error}
            </p>
          )}
        </>
      }
      facts={[
        ['What changed', WHEN[notice.change]],
        ['Answers', String(notice.answers)],
        ['Chats', String(notice.chats)],
      ]}
    />
  )
}
