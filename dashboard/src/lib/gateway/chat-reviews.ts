import type { GatewayAuthClient } from './auth'

/** Reviews of one answer: blind judge, owner votes and fact checks. */
export function createChatReviewsClient(auth: Pick<GatewayAuthClient, 'request'>) {
  void auth
  return {}
}

export type ChatReviewsClient = ReturnType<typeof createChatReviewsClient>
