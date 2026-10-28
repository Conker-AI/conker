import { useNavigate } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { GatewayAgentNote } from '@/lib/gateway/jobs'
import { InboxCard } from './inbox-card'

function age(seconds: number, now: number) {
  const minutes = Math.max(1, Math.floor((now - seconds * 1000) / 60_000))
  return minutes < 60 ? `${minutes} min ago` : minutes < 1440 ? `${Math.floor(minutes / 60)} hr ago` : `${Math.floor(minutes / 1440)} days ago`
}

/**
 * One finding from an AI job: what needs the owner, in one line. Open chat goes to the full reply;
 * Got it clears the line (the chat keeps the reply either way).
 */
export function AgentNoteCard({ note, now, onOpen, onLater }: { note: GatewayAgentNote; now: number; onOpen: () => void; onLater?: () => void }) {
  const navigate = useNavigate()
  return <InboxCard icon={<Sparkles />} title={note.title} summary={note.detail || undefined}
    meta={<><span>AI job</span><span>{age(note.createdAt, now)}</span></>}
    actions={<div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" onClick={() => { onOpen(); navigate(`/chat?session=${encodeURIComponent(note.sessionId)}`) }}>Open chat</Button>
      <Button type="button" size="sm" variant="outline" onClick={onOpen}>Got it</Button>
    </div>}
    onLater={onLater} />
}
