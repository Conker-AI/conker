import type { ChatGPTOperation, ChatGPTStatus } from '@/lib/gateway/chatgpt'
import type { NativeClaudeOperation, NativeClaudeStatus } from '@/lib/gateway/native-claude'

export const chatGPTConnectionRules = {
  allowed(value: ChatGPTStatus, operation: ChatGPTOperation) {
    if (!value.available) return false
    if (operation.operation === 'cancel') return value.loginState === 'pending' && value.loginId === operation.loginId
    if (operation.operation === 'logout') return value.connected && value.connectionId === operation.connectionId
    if (operation.operation === 'models') return value.connected
    return !value.connected && value.loginState !== 'pending'
  },
  accept(previous: ChatGPTStatus | null, next: ChatGPTStatus, operation?: ChatGPTOperation): ChatGPTStatus {
    const pending = next.available && !next.connected && next.loginState === 'pending' && !!next.loginId
    const issued = operation?.operation === 'login' ? next.deviceCode : null
    const retained = !operation && previous?.loginId === next.loginId ? previous?.deviceCode : null
    return { ...next, deviceCode: pending ? issued ?? retained ?? null : null }
  },
}

export const nativeClaudeConnectionRules = {
  allowed(value: NativeClaudeStatus, operation: NativeClaudeOperation) {
    if (!value.available) return false
    if (operation.operation === 'cancel') return value.loginState === 'pending' && value.loginId === operation.loginId
    if (operation.operation === 'logout') return value.connected
    return !value.connected && value.loginState !== 'pending'
  },
  accept(_previous: NativeClaudeStatus | null, next: NativeClaudeStatus): NativeClaudeStatus {
    return { ...next, authorizationUrl: next.available && !next.connected && next.loginState === 'pending' && next.loginId ? next.authorizationUrl : null }
  },
}

