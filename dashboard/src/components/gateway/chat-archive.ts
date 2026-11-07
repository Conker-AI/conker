import type { GatewayControlClient } from '@/lib/gateway/control'
import { notifyFailure } from '@/components/resilience/notify'
import { toastManager } from '@/components/ui/toast'
import { chatFeatureMessage } from '@/lib/gateway/chat-feature-errors'

const count = (n: number) => n === 1 ? 'chat' : `${n} chats`

/**
 * Archive or restore chats, then offer Undo. Archiving only hides a chat from the list: nothing is
 * deleted, so it needs no password and Undo is a plain restore of the same chats.
 */
export async function archiveChats(chatNames: GatewayControlClient['chatNames'], ids: string[], archived: boolean, onChanged: () => void, undo = true): Promise<boolean> {
  if (!ids.length) return false
  try {
    await chatNames.archive(ids, archived)
  } catch (error) {
    notifyFailure(archived ? 'Could not archive' : 'Could not restore', chatFeatureMessage(error))
    return false
  }
  onChanged()
  const title = `${count(ids.length)[0].toUpperCase()}${count(ids.length).slice(1)} ${archived ? 'archived' : 'restored'}`
  toastManager.add({ type: 'success', title, timeout: 6000,
    actionProps: undo ? { children: 'Undo', onClick: () => void archiveChats(chatNames, ids, !archived, onChanged, false) } : undefined })
  return true
}

/**
 * Move chats to the Trash or restore them, then offer Undo. Trash only hides a chat; nothing is
 * deleted until Delete forever, so it needs no password and Undo is the opposite move, once.
 */
export async function trashChats(chatNames: GatewayControlClient['chatNames'], ids: string[], trashed: boolean, onChanged: () => void, undo = true): Promise<boolean> {
  if (!ids.length) return false
  try {
    await chatNames.trash(ids, trashed)
  } catch (error) {
    notifyFailure(trashed ? 'Could not move to Trash' : 'Could not restore', chatFeatureMessage(error))
    return false
  }
  onChanged()
  const title = `${count(ids.length)[0].toUpperCase()}${count(ids.length).slice(1)} ${trashed ? 'moved to Trash' : 'restored'}`
  toastManager.add({ type: 'success', title, timeout: 6000,
    actionProps: undo ? { children: 'Undo', onClick: () => void trashChats(chatNames, ids, !trashed, onChanged, false) } : undefined })
  return true
}
