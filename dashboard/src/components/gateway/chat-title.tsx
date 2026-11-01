import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sparkles } from 'lucide-react'
import type { GatewayControlClient } from '@/lib/gateway/control'
import { notifyFailure } from '@/components/resilience/notify'
import { chatFeatureMessage } from '@/lib/gateway/chat-feature-errors'

/** The open chat's name in the header. `onChanged` reloads the chat after a rename. */
export function ChatTitle({ control, sessionId, title, disabled, onChanged }: { control?: GatewayControlClient; sessionId: string | null; title: string; disabled: boolean; onChanged: () => void }) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(title)
  const [isRenaming, setIsRenaming] = useState(false)
  const [isAutoNaming, setIsAutoNaming] = useState(false)

  if (!control || !sessionId) {
    return <h2 className="min-w-0 truncate text-sm font-medium">{title}</h2>
  }

  const handleRename = async () => {
    if (!control || !sessionId) return

    const trimmed = editValue.trim()
    if (!trimmed || trimmed === title) {
      setIsEditing(false)
      setEditValue(title)
      return
    }

    setIsRenaming(true)
    try {
      // Get current revision
      const current = await control.chatNames.title(sessionId)
      await control.chatNames.rename(sessionId, trimmed, current.revision)
      setIsEditing(false)
      setEditValue(trimmed)
      onChanged()
    } catch (error) {
      notifyFailure('Could not rename the chat', chatFeatureMessage(error))
    } finally {
      setIsRenaming(false)
    }
  }

  const handleAutoName = async () => {
    if (!control || !sessionId) return

    setIsAutoNaming(true)
    try {
      // Get current revision
      const current = await control.chatNames.title(sessionId)
      await control.chatNames.autoName(sessionId, current.revision)
      onChanged()
    } catch (error) {
      notifyFailure('Could not rename the chat', chatFeatureMessage(error))
    } finally {
      setIsAutoNaming(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRename()
    } else if (e.key === 'Escape') {
      setIsEditing(false)
      setEditValue(title)
    }
  }

  if (isEditing) {
    return (
      <h2 className="min-w-0 truncate text-sm font-medium">
        <Input
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleRename}
          onKeyDown={handleKeyDown}
          maxLength={60}
          autoFocus
          className="h-6 text-sm font-medium px-2 py-1 border-border bg-background"
          aria-label="Chat name"
          disabled={isRenaming}
        />
      </h2>
    )
  }

  return (
    <div className="flex items-center gap-1 min-w-0">
      <h2 className="min-w-0 truncate text-sm font-medium">
        <Button
          variant="ghost"
          className="h-6 px-2 py-1 text-sm font-medium hover:bg-muted"
          onClick={() => {
            setIsEditing(true)
            setEditValue(title)
          }}
          aria-label="Rename chat"
          disabled={disabled || isRenaming || isAutoNaming}
        >
          <span className="truncate">{title}</span>
        </Button>
      </h2>
      {!isEditing && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleAutoName}
          aria-label="Name this chat"
          disabled={disabled || isRenaming || isAutoNaming}
          className="shrink-0"
        >
          <Sparkles className="h-3 w-3" />
        </Button>
      )}
    </div>
  )
}
