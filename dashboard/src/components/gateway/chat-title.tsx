import { useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import type { GatewayControlClient } from '@/lib/gateway/control'
import { notifyFailure } from '@/components/resilience/notify'
import { chatFeatureMessage } from '@/lib/gateway/chat-feature-errors'

/** The open chat's name in the header. `onChanged` reloads the chat after a rename. */
export function ChatTitle({ control, sessionId, title, disabled, onChanged }: { control?: GatewayControlClient; sessionId: string | null; title: string; disabled: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(title)
  const [renaming, setRenaming] = useState(false)
  const [naming, setNaming] = useState(false)
  // Enter and blur both save; these keep a second save from starting and keep Esc from saving.
  const busy = useRef(false)
  const cancelled = useRef(false)

  if (!control || !sessionId) return <h2 className="min-w-0 truncate text-sm font-medium">{title}</h2>

  // The server's revision is read right before each write, so a write only fails if the name changed in between.
  const run = async (write: (revision: number) => Promise<unknown>) => {
    try {
      await write((await control.chatNames.title(sessionId)).revision)
      onChanged()
    } catch (error) {
      notifyFailure('Could not rename the chat', chatFeatureMessage(error))
    }
  }

  const save = async () => {
    if (busy.current || cancelled.current) return
    const trimmed = value.trim()
    if (!trimmed || trimmed === title) { setEditing(false); return }
    busy.current = true
    setRenaming(true)
    await run(revision => control.chatNames.rename(sessionId, trimmed, revision))
    busy.current = false
    setRenaming(false)
    setEditing(false)
  }

  const autoName = async () => {
    setNaming(true)
    await run(revision => control.chatNames.autoName(sessionId, revision))
    setNaming(false)
  }

  if (editing) {
    // On a phone the header cell is too narrow to type in, so the field spans the bar while editing.
    return <h2 className="min-w-0 flex-1 text-sm font-medium max-sm:fixed max-sm:inset-x-3 max-sm:top-3 max-sm:z-30 max-sm:bg-background">
      <Input
        size="sm"
        value={value}
        onChange={event => setValue(event.target.value)}
        onFocus={event => event.currentTarget.select()}
        onBlur={() => void save()}
        onKeyDown={event => {
          if (event.key === 'Enter') { event.preventDefault(); void save() }
          else if (event.key === 'Escape') { cancelled.current = true; setEditing(false) }
        }}
        maxLength={60}
        autoFocus
        disabled={renaming}
        aria-label="Chat name"
        className="max-w-sm text-sm font-medium max-sm:max-w-none"
      />
    </h2>
  }

  return <div className="flex min-w-0 items-center gap-1">
    <h2 className="min-w-0 truncate text-sm font-medium">
      <Button
        variant="ghost"
        size="xs"
        className="max-w-full font-medium"
        aria-label="Rename chat"
        title="Rename chat"
        disabled={disabled || naming}
        onClick={() => { cancelled.current = false; setValue(title); setEditing(true) }}
      >
        <span className="truncate">{title}</span>
      </Button>
    </h2>
    <Button variant="ghost" size="icon-xs" className="shrink-0" aria-label="Name this chat" title="Name this chat" disabled={disabled || naming} onClick={() => void autoName()}>
      {naming ? <Spinner /> : <Sparkles />}
    </Button>
  </div>
}
