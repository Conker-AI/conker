import { useState } from 'react'
import { ConfirmationDialog } from '@/components/design-system/overlays'
import { notifyDone } from '@/components/resilience/notify'
import { importRefusalMessage, type GatewayImportsClient, type ImportedChat } from '@/lib/gateway/imports'

type Target = Pick<ImportedChat, 'id' | 'title' | 'messageCount'>
const messages = (count: number) => `${count.toLocaleString()} ${count === 1 ? 'message' : 'messages'}`

/**
 * Delete one imported ChatGPT or Claude chat forever. Pi removes the copy and its messages; memories
 * already made from the owner's words stay until the owner forgets them in Memory, and the receipt says so.
 * The server asks for the password (a deletion cannot be undone), so there is no Undo.
 */
export function useImportedChatDelete(client: GatewayImportsClient, onDeleted: (id: string) => void) {
  const [target, setTarget] = useState<Target | null>(null)
  const [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null)
  async function confirm() {
    if (!target || pending) return
    setPending(true); setError(null)
    try {
      const receipt = await client.deleteChat(target.id)
      setTarget(null)
      notifyDone(`Deleted ${messages(receipt.messagesDeleted)}`, receipt.memoryNote ?? undefined)
      onDeleted(target.id)
    } catch (cause) { setError(importRefusalMessage(cause)) }
    finally { setPending(false) }
  }
  const dialog = <ConfirmationDialog open={!!target} onOpenChange={open => { if (!open) { setTarget(null); setError(null) } }}
    title="Delete this imported chat forever?" actionLabel="Delete forever" pending={pending} error={error} onConfirm={confirm}
    description={target ? `“${target.title || 'Untitled chat'}” and its ${messages(target.messageCount)} are removed from Conker. This can’t be undone.` : ''}>
    <p className="text-sm text-muted-foreground">Memories made from your words in this chat stay until you forget them in Memory.</p>
  </ConfirmationDialog>
  return { ask: (chat: Target) => { setError(null); setTarget(chat) }, dialog }
}
