import { Bookmark, Brain, Clock, Lightbulb, PencilLine, Phone, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { composerItem } from '@/components/chat/composer-items'

/** Starters fill the composer with the start of a request; nothing is sent until the owner does. */
const starters = [
  { label: 'Plan my day', text: 'Help me plan my day: ', icon: Clock },
  { label: 'Draft a message', text: 'Draft a message to ', icon: PencilLine },
  { label: 'Explain simply', text: 'Explain simply: ', icon: Lightbulb },
  { label: 'Brainstorm', text: 'Give me ideas for ', icon: Brain },
  { label: 'Remember something', text: 'Remember that ', icon: Bookmark },
]

export function ConversationStarters({ disabled, onPick }: { disabled: boolean; onPick: (text: string) => void }) {
  return <div className="mt-5 flex flex-wrap justify-center gap-2 pointer-coarse:gap-3" role="group" aria-label="Conversation starters">
    {starters.map(item => <Button key={item.label} type="button" variant="outline" size="sm" className="rounded-full font-normal" disabled={disabled} onClick={() => onPick(item.text)}><item.icon className="text-muted-foreground" />{item.label}</Button>)}
  </div>
}

const callButton = 'shrink-0 cursor-not-allowed text-muted-foreground opacity-60'

/**
 * Voice and video call, as their own toolbar buttons. A call starts from a saved chat, and video is not
 * connected yet, so on a new chat both stand disabled with the reason as their tooltip. They are the
 * last items to fold into the overflow menu.
 */
export function NewChatCallButtons() {
  const voice = 'Send a message first, then call from the chat header'
  const video = 'Video calls are not connected yet'
  return <span className="flex shrink-0 items-center gap-1">
    <Button type="button" size="icon-sm" variant="ghost" aria-disabled="true" aria-label={`Voice call. ${voice}`} title={voice} className={callButton} onClick={event => event.preventDefault()}><Phone className="size-4" /><span data-label className="sr-only">Voice call</span></Button>
    <Button type="button" size="icon-sm" variant="ghost" aria-disabled="true" aria-label={`Video call. ${video}`} title={video} className={callButton} onClick={event => event.preventDefault()}><Video className="size-4" /><span data-label className="sr-only">Video call</span></Button>
  </span>
}
composerItem(NewChatCallButtons, 'media')
