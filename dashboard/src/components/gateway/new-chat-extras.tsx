import { Bookmark, Brain, Clock, Lightbulb, PencilLine, Phone, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { belongsBehindMore } from '@/components/chat/composer-more'

/** Starters fill the composer with the start of a request; nothing is sent until the owner does. */
const starters = [
  { label: 'Plan my day', text: 'Help me plan my day: ', icon: Clock },
  { label: 'Draft a message', text: 'Draft a message to ', icon: PencilLine },
  { label: 'Explain simply', text: 'Explain simply: ', icon: Lightbulb },
  { label: 'Brainstorm', text: 'Give me ideas for ', icon: Brain },
  { label: 'Remember something', text: 'Remember that ', icon: Bookmark },
]

export function ConversationStarters({ disabled, onPick }: { disabled: boolean; onPick: (text: string) => void }) {
  return <div className="mt-5 flex flex-wrap justify-center gap-2" role="group" aria-label="Conversation starters">
    {starters.map(item => <Button key={item.label} type="button" variant="outline" size="sm" className="rounded-full font-normal" disabled={disabled} onClick={() => onPick(item.text)}><item.icon className="text-muted-foreground" />{item.label}</Button>)}
  </div>
}

/** Calls start from a saved chat's header and video is not connected; behind More, both say so instead of hiding. */
export function NewChatMediaPlaceholders() {
  return <div className="w-full space-y-1.5 px-2 py-1 text-sm text-muted-foreground">
    <p className="flex items-start gap-2"><Phone className="mt-0.5 size-4 shrink-0" />Voice call: send a message first, then call from the chat header.</p>
    <p className="flex items-start gap-2"><Video className="mt-0.5 size-4 shrink-0" />Video calls are not connected yet.</p>
  </div>
}
belongsBehindMore(NewChatMediaPlaceholders)
