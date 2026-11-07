import { useRef, useState } from 'react'
import { ConfirmationDialog } from '@/components/design-system/overlays'
import { notifyDone, notifyFailure } from '@/components/resilience/notify'
import { chatForgetMessage, type ChatForgetClient, type ChatForgetPlan } from '@/lib/gateway/chat-forget'

const plural = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString()} ${count === 1 ? one : many}`

/**
 * Delete Conker chats forever. Reads what each deletion reaches first (branches, messages), so the
 * owner confirms the exact scope Pi checks again; Pi answers at once and deletes in the background
 * once no reply is in progress. The server asks for the password; there is no Undo.
 */
export function useChatDeleteForever(client: ChatForgetClient | undefined, onDeleted: (ids: string[]) => void) {
  const [plans, setPlans] = useState<ChatForgetPlan[] | null>(null)
  const [reading, setReading] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null)
  const running = useRef(false)

  async function ask(ids: string[]) {
    if (!client || running.current || !ids.length) return
    running.current = true; setReading(true); setError(null)
    try { setPlans(await client.preview(ids.slice(0, 50))) }
    catch (failure) { notifyFailure('Couldn’t check these chats', chatForgetMessage(failure)) }
    finally { running.current = false; setReading(false) }
  }

  async function confirm() {
    if (!client || !plans || running.current) return
    running.current = true; setPending(true); setError(null)
    try {
      const outcome = await client.remove(plans)
      setPlans(null)
      if (outcome.done.length) notifyDone(`Deleted ${plural(outcome.done.length, 'chat')} forever`)
      if (outcome.refused.length) notifyFailure(`${plural(outcome.refused.length, 'chat')} not deleted`, outcome.refused.map(item => item.detail).filter(Boolean).join(' ') || 'Conker kept them.')
      if (outcome.waiting.length) notifyDone(`Deleting ${plural(outcome.waiting.length, 'chat')} forever`, 'Conker finishes in the background, after any reply in progress.')
      onDeleted([...outcome.done, ...outcome.waiting])
    } catch (failure) { setError(chatForgetMessage(failure)) }
    finally { running.current = false; setPending(false) }
  }

  const messages = plans?.reduce((sum, item) => sum + item.messages, 0) ?? 0
  const branches = plans?.reduce((sum, item) => sum + item.sessionIds.length - 1, 0) ?? 0
  const dialog = <ConfirmationDialog open={!!plans} onOpenChange={open => { if (!open && !pending) { setPlans(null); setError(null) } }}
    title={`Delete ${plural(plans?.length ?? 0, 'chat')} forever?`} actionLabel="Delete forever" pending={pending} error={error} onConfirm={confirm}
    description={`${plural(messages, 'message')}${branches ? ` and ${plural(branches, 'branch', 'branches')}` : ''} are removed from Conker, with the memories Conker kept from them on its own. This can’t be undone.`}>
    <p className="text-sm text-muted-foreground">Memories you asked Conker to keep stay until you forget them in Memory.</p>
  </ConfirmationDialog>
  return { ask, dialog, reading }
}
