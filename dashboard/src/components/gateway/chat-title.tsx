import type { GatewayControlClient } from '@/lib/gateway/control'

/** The open chat's name in the header. `onChanged` reloads the chat after a rename. */
export function ChatTitle({ control, sessionId, title, disabled, onChanged }: { control?: GatewayControlClient; sessionId: string | null; title: string; disabled: boolean; onChanged: () => void }) {
  void control
  void sessionId
  void disabled
  void onChanged
  return <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{title}</h2>
}
