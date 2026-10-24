import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AnimatedIconButton, AnimatedIconGlyph } from '@/components/icons/animated/animated-icon'
import { BookmarkIcon, BrainIcon, CameraIcon, ClockIcon, LightbulbIcon, PencilIcon, PhoneIcon } from '@/components/icons/animated/icons'

/** Starters fill the composer with the start of a request; nothing is sent until the owner does. */
const starters = [
  { label: 'Plan my day', text: 'Help me plan my day: ', icon: ClockIcon },
  { label: 'Draft a message', text: 'Draft a message to ', icon: PencilIcon },
  { label: 'Explain simply', text: 'Explain simply: ', icon: LightbulbIcon },
  { label: 'Brainstorm', text: 'Give me ideas for ', icon: BrainIcon },
  { label: 'Ask Conker to remember', text: 'Remember that ', icon: BookmarkIcon },
]

export function ConversationStarters({ disabled, onPick }: { disabled: boolean; onPick: (text: string) => void }) {
  return <div className="mt-5 flex justify-center gap-1.5" aria-label="Conversation starters">
    {starters.map(item => <Tooltip key={item.label}><TooltipTrigger render={<AnimatedIconButton icon={item.icon} type="button" variant="ghost" size="icon" className="size-10 rounded-full border bg-background text-muted-foreground hover:text-foreground" aria-label={item.label} disabled={disabled} onClick={() => onPick(item.text)} />} /><TooltipContent side="bottom">{item.label}</TooltipContent></Tooltip>)}
  </div>
}

/** Calls start from a saved chat's header and video is not connected; both say so instead of hiding. */
export function NewChatMediaPlaceholders() {
  return <>
    <Tooltip><TooltipTrigger render={<span className="hidden sm:inline-flex" />}><Button type="button" variant="ghost" size="icon" className="size-8 rounded-full" aria-label="Voice call unavailable before the first message" disabled><AnimatedIconGlyph icon={PhoneIcon} /></Button></TooltipTrigger><TooltipContent side="top">Send a message first, then call from the chat header.</TooltipContent></Tooltip>
    <Tooltip><TooltipTrigger render={<span className="hidden sm:inline-flex" />}><Button type="button" variant="ghost" size="icon" className="size-8 rounded-full" aria-label="Video calls unavailable" disabled><AnimatedIconGlyph icon={CameraIcon} /></Button></TooltipTrigger><TooltipContent side="top">Video calls are not connected yet.</TooltipContent></Tooltip>
  </>
}
