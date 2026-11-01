import type { GatewayAuthClient } from './auth'

/** A chat's name (rename, name automatically) and its output settings. */
export function createChatNamesClient(auth: Pick<GatewayAuthClient, 'request'>) {
  void auth
  return {}
}

export type ChatNamesClient = ReturnType<typeof createChatNamesClient>
