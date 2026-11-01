import type { GatewayControlClient } from '@/lib/gateway/control'
import { notifyFailure } from '@/components/resilience/notify'
import { chatFeatureMessage } from '@/lib/gateway/chat-feature-errors'

// The server's revision is read right before each write, so a write only fails if the name changed in between.
export async function writeTitle(control: GatewayControlClient, sessionId: string, onChanged: () => void, write: (revision: number) => Promise<unknown>) {
  try {
    await write((await control.chatNames.title(sessionId)).revision)
    onChanged()
  } catch (error) {
    notifyFailure('Could not rename the chat', chatFeatureMessage(error))
  }
}

/** Lets Conker name the chat. Phones call it from the chat's "..." menu, where the header has no room for the button. */
export function nameChat(control: GatewayControlClient, sessionId: string, onChanged: () => void) {
  return writeTitle(control, sessionId, onChanged, revision => control.chatNames.autoName(sessionId, revision))
}
