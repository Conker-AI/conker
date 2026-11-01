import type { GatewayAuthClient } from './auth'

/** One chat's summary: read, edit, draft, restore, compaction, and a new chat from the summary. */
export function createChatSummaryClient(auth: Pick<GatewayAuthClient, 'request'>) {
  void auth
  return {}
}

export type ChatSummaryClient = ReturnType<typeof createChatSummaryClient>
