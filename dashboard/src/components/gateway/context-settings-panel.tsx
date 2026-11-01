import type { ChatContextClient } from '@/lib/gateway/chat-context'

/** Instructions, token budget, message rules and the decisions and threads Conker keeps for this chat. */
export function ContextSettingsPanel({ client, sessionId, disabled, onChanged }: { client: ChatContextClient; sessionId: string; disabled: boolean; onChanged: () => void }) {
  void client
  void sessionId
  void disabled
  void onChanged
  return null
}
