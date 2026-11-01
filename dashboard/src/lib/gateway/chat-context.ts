import type { GatewayAuthClient } from './auth'

/** One chat's context settings (instructions, budget, message rules) and its items (decisions, threads). */
export function createChatContextClient(auth: Pick<GatewayAuthClient, 'request'>) {
  void auth
  return {}
}

export type ChatContextClient = ReturnType<typeof createChatContextClient>
