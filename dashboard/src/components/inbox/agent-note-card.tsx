import { useNavigate } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { GatewayAgentNote } from '@/lib/gateway/jobs'
import { factTime } from '@/lib/shown-time'
import { useTimeStyle } from '@/components/use-time-style'
import { InboxCard } from './inbox-card'


/**
 * One finding from an AI job: what needs the owner, in one line. Open chat goes to the full reply;
 * Got it clears the line (the chat keeps the reply either way).
 */
export function AgentNoteCard({ note, now, onOpen, onLater }: { note: GatewayAgentNote; now: number; onOpen: () => void; onLater?: () => void }) {
  const navigate = useNavigate()
  const style = useTimeStyle()
  const open = () => {
    onOpen()
    navigate(`/chat?session=${encodeURIComponent(note.sessionId)}`)
  }
  return (
    <InboxCard
      icon={<Sparkles />}
      title={note.title}
      source="AI job"
      came={{ at: note.createdAt * 1000, now }}
      summary={note.detail || undefined}
      primary={
        <Button type="button" size="sm" onClick={open}>
          Open chat
        </Button>
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={open}>
            Open chat
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onOpen}>
            Got it
          </Button>
        </div>
      }
      facts={[
        ['From', 'An AI job'],
        ['Came', factTime(note.createdAt * 1000, now, style)],
      ]}
      onLater={onLater}
    />
  )
}
