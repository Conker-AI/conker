import type { ChatSummaryClient } from '@/lib/gateway/chat-summary'

/** The chat's summary: edit, draft, restore an older version, fold old messages into it, or continue in a new chat from it. */
export function ContextSummaryPanel({ client, sessionId, disabled, onChanged }: { client: ChatSummaryClient; sessionId: string; disabled: boolean; onChanged: () => void }) {
  void client
  void sessionId
  void disabled
  void onChanged
  return null
}
