import { Inbox, Lightbulb } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/date-format'
import { useOwnerProfile } from '@/lib/owner-profile'
import { useInboxAttention } from '@/lib/workspace-chrome'
import { useServerSetting } from '@/settings/server-setting'
import { greeting } from './home-model'

/** One suggested request for this time of day; it only fills the message box, nothing is sent. */
function suggestion(now = new Date()) {
  const hour = now.getHours()
  if (hour >= 5 && hour < 12) return { label: 'Plan my day', text: 'Help me plan my day: ' }
  if (hour >= 12 && hour < 18) return { label: 'Decide what to do next', text: 'Help me decide what to do next. Here is what is on my plate: ' }
  return { label: 'Wrap up my day', text: 'Help me wrap up today: what I finished, and what is left for tomorrow: ' }
}

/**
 * What an empty new chat shows above the message box (Settings > Chats > A new chat starts with):
 * nothing (the default), a greeting, today's date and what waits in the Inbox, or one suggested
 * request. The Inbox count is the shell's own; while it is unknown the line says so.
 */
export function NewChatStart({ disabled, typed, onPick }: { disabled: boolean; typed: boolean; onPick: (text: string) => void }) {
  const start = useServerSetting<'empty' | 'greeting' | 'summary' | 'suggestion'>('chats.start', 'empty')
  const profile = useOwnerProfile()
  const waiting = useInboxAttention()
  if (start === 'empty') return null
  if (start === 'greeting') {
    const name = profile.name && profile.name !== 'You' ? `, ${profile.name}` : ''
    return <p className="-mt-3 mb-6 text-center text-base text-muted-foreground">{`${greeting()}${name}. What shall we do?`}</p>
  }
  if (start === 'summary') {
    const line = waiting === null ? 'Checking what waits for you…' : waiting === 0 ? 'Nothing waits for you in the Inbox.' : `${waiting} ${waiting === 1 ? 'thing waits' : 'things wait'} for you in the Inbox.`
    return (
      <section aria-label="Today" className="-mt-3 mb-6 flex flex-col items-center gap-1 text-center">
        <p className="text-sm font-medium">{formatDateTime(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <p role="status" className="text-sm text-muted-foreground">
          {line}
        </p>
        {!!waiting && (
          <Button size="sm" variant="ghost" render={<Link to="/inbox" />}>
            <Inbox aria-hidden="true" />
            Open the Inbox
          </Button>
        )}
      </section>
    )
  }
  // Like the starters, the suggestion steps aside once he types.
  if (typed) return null
  const pick = suggestion()
  return (
    <div className="-mt-3 mb-6 flex justify-center">
      <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal rounded-full px-4 font-normal" disabled={disabled} onClick={() => onPick(pick.text)}>
        <Lightbulb className="text-muted-foreground" aria-hidden="true" />
        <span>
          <span className="text-muted-foreground">Try: </span>
          {pick.label}
        </span>
      </Button>
    </div>
  )
}
