import type { ChatAccess, ToolAccessLevel } from '@/lib/gateway/access'

/** The chat's access switch, in plain words. */
export const CHAT_ACCESS: { value: ChatAccess; label: string; hint: string }[] = [
  { value: 'default', label: 'Agent’s settings', hint: 'Each tool follows this agent’s setting, or its own.' },
  { value: 'ask', label: 'Ask me', hint: 'Nothing is left to the AI: anything that isn’t free asks you.' },
  { value: 'ai', label: 'AI decides', hint: 'What would ask you goes to the AI check first. If it isn’t sure, it asks you.' },
  { value: 'full', label: 'Full access', hint: 'What would ask you just runs, and shows in Inbox, Handled.' },
]

/** A tool's own setting (ToolGate authorization), in plain words. */
export const DEFAULT_ACCESS: Record<string, string> = { auto: 'Free', ai_review: 'AI decides', owner_confirmation: 'Asks you', blocked: 'Blocked' }

/** An agent's setting for one tool. */
export const TOOL_ACCESS: { value: ToolAccessLevel; label: string }[] = [
  { value: 'allow', label: 'Free' },
  { value: 'ai', label: 'AI decides' },
  { value: 'ask', label: 'Ask me' },
]
