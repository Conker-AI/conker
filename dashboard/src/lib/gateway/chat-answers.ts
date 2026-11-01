import type { GatewayAuthClient } from './auth'

/** Answer versions for one chat: retry with another model, compare, switch versions, branch from a message. */
export function createChatAnswersClient(auth: Pick<GatewayAuthClient, 'request'>) {
  void auth
  return {}
}

export type ChatAnswersClient = ReturnType<typeof createChatAnswersClient>
