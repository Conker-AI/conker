import type { GatewayControlClient } from '@/lib/gateway/control'
import type { ChatEffort } from '@/lib/gateway/chat-names'
import { chatFeatureMessage } from '@/lib/gateway/chat-feature-errors'

/** Saves the effort chosen before a chat existed with the new chat's output settings; returns a sentence when it could not. */
export async function saveNewChatEffort(control: GatewayControlClient | undefined, sessionId: string, effort: ChatEffort): Promise<string | null> {
  if (!control || effort === 'auto') return null
  try {
    const saved = await control.chatNames.output(sessionId)
    await control.chatNames.saveOutput(sessionId, { ...saved.output, effort }, saved.revision)
    return null
  } catch (failure) {
    return `The chat was created, but its effort was not saved: ${chatFeatureMessage(failure)} Set it from the model button.`
  }
}
