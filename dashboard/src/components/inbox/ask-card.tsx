import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageCircleQuestion } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ConkerAsk } from '@/lib/gateway/asks'
import { factTime } from '@/lib/shown-time'
import { useTimeStyle } from '@/components/use-time-style'
import { InboxCard } from './inbox-card'
import { ReplyBox } from './reply-box'


/**
 * One of Conker's questions: its options (Conker wrote them) and Reply for his own words. Either
 * goes to that chat as his next message; nothing runs from here.
 */
export function AskCard({
  ask,
  now,
  busy,
  error,
  onAnswer,
  onDismiss,
  onLater,
}: {
  ask: ConkerAsk
  now: number
  busy: boolean
  error: string | null
  onAnswer: (text: string, chosen: boolean) => void
  onDismiss: () => void
  onLater?: () => void
}) {
  const [replying, setReplying] = useState(false),
    [words, setWords] = useState('')
  const style = useTimeStyle()
  const answers = replying ? (
    <ReplyBox label="Your answer" placeholder="Goes to Conker in that chat." value={words} busy={busy} onChange={setWords} onSend={() => onAnswer(words.trim(), false)} onCancel={() => setReplying(false)} />
  ) : (
    <div className="flex flex-wrap gap-2">
      {ask.options.map(option => (
        <Button key={option} type="button" size="sm" variant="outline" disabled={busy} onClick={() => onAnswer(option, true)}>
          {option}
        </Button>
      ))}
      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setReplying(true)}>
        Reply
      </Button>
    </div>
  )
  return (
    <InboxCard
      icon={<MessageCircleQuestion />}
      title={ask.question}
      source={<>Conker asks · {ask.chatTitle || 'a chat'}</>}
      came={{ at: ask.createdAt * 1000, now }}
      openLabel="Answer"
      actions={answers}
      onLater={onLater}
      footer={
        error ? (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        ) : undefined
      }
      facts={[
        ['Chat', ask.chatTitle || 'Untitled chat'],
        ['Asked', factTime(ask.createdAt * 1000, now, style)],
        ['Your answer', 'Goes to that chat as if you typed it there; anything Conker then does follows your access settings'],
      ]}
      advanced={
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="ghost" render={<Link to={`/chat?session=${encodeURIComponent(ask.sessionId)}`} />}>
            Open the chat
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onDismiss}>
            Don’t answer
          </Button>
        </div>
      }
    />
  )
}
