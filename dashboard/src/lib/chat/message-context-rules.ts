import type { ContextPolicy } from '@/lib/gateway/chat-context'

/** How one message is treated when Conker builds a chat's context (Pi's `messagePolicies`). */
export type MessageRule = 'keep-exact' | 'allow-summary' | 'retrieve' | 'exclude'

/** The rules in the order the menu lists them. */
export const messageRules: readonly MessageRule[] = ['keep-exact', 'exclude', 'allow-summary', 'retrieve']

/** The same words the Context sheet uses. */
export const ruleWords: Record<MessageRule, string> = {
  'keep-exact': 'kept word for word',
  exclude: 'left out',
  'allow-summary': 'may be summarised',
  retrieve: 'brought back when relevant',
}

const messageIdPattern = /^msg_[0-9a-f]{16}$/

/** The budget Conker shows in the Context sheet when a chat has no policy yet. */
const defaultBudget = { contextWindowTokens: 128000, outputReserveTokens: 4096, otherInputTokens: 0 }

/** The rule as a label: "Left out". */
export function ruleLabel(rule: MessageRule): string {
  const words = ruleWords[rule]
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** True when Pi accepts a rule for this message id. */
export function canRuleMessage(messageId: string): boolean {
  return messageIdPattern.test(messageId)
}

/** The rule set on one message, or null when it follows the default. */
export function messageRuleOf(policy: ContextPolicy | null, messageId: string): MessageRule | null {
  if (!policy || !Object.hasOwn(policy.messagePolicies, messageId)) return null
  return policy.messagePolicies[messageId] ?? null
}

/** The policy with one message's rule set, or cleared when `rule` is null. Every other message keeps its rule. */
export function withMessageRule(policy: ContextPolicy | null, messageId: string, rule: MessageRule | null): ContextPolicy {
  if (!canRuleMessage(messageId)) throw new Error('Not a message id')
  if (rule !== null && !messageRules.includes(rule)) throw new Error('Not a message rule')
  const base: ContextPolicy = policy ?? { sessionInstructions: '', messagePolicies: {}, budget: { ...defaultBudget } }
  const rest: Record<string, MessageRule> = {}
  for (const [id, existing] of Object.entries(base.messagePolicies)) if (id !== messageId) rest[id] = existing
  if (rule !== null) rest[messageId] = rule
  return { ...base, messagePolicies: rest }
}
