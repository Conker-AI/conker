import type { ConversationMessage, ConversationPrivacy } from "./conversation-types"

export const MESSAGE_CONTEXT_POLICIES = ["keep-exact", "allow-summary", "retrieve", "exclude"] as const
export type MessageContextPolicy = typeof MESSAGE_CONTEXT_POLICIES[number]
export type ContextInstructionScope = "global" | "agent" | "project" | "session"
export type ContextPolicy = {
  /** Owner-authored instructions, never part of compressible conversation history. */
  sessionInstructions: string
  messagePolicies: Record<string, MessageContextPolicy>
  budget: {
    contextWindowTokens: number
    outputReserveTokens: number
    /** Caller-supplied estimate for system/tool schemas and other input not listed here. */
    otherInputTokens: number
  }
}
export type ContextInstruction = { scope: ContextInstructionScope; text: string; sourceId?: string }
export type ContextConflict = {
  code: "missing-message" | "pinned-policy" | "unavailable-pin" | "retrieval-disabled" | "retrieval-pending" | "budget-overflow"
  messageId?: string
  detail: string
}
export type ContextPlanMessage = {
  messageId: string
  role: ConversationMessage["role"]
  requestedPolicy: MessageContextPolicy
  effectivePolicy: MessageContextPolicy
  disposition: "included-exact" | "excluded" | "unavailable" | "retrieval-pending" | "retrieval-disabled"
  estimatedTokens: number
  /** Included content only. Never copies activity, internal reasoning or redacted text. */
  text?: string
}
export type ContextPlan = {
  mode: "preview"
  estimateLabel: string
  /** Stable precedence, from broader to more specific owner-authored instructions. */
  instructions: (ContextInstruction & { estimatedTokens: number })[]
  messages: ContextPlanMessage[]
  summaryEligibleMessageIds: string[]
  retrievalCandidateMessageIds: string[]
  conflicts: ContextConflict[]
  nextAction: "review-conflicts" | "fork-required" | "resolve-retrieval" | "within-estimated-budget"
  helpers: {
    memoryReadsAllowed: boolean
    memoryWritesAllowed: boolean
    harnessAllowed: boolean
    summaryEligible: boolean
    sessionRetrievalEligible: boolean
    /** Eligibility never means a provider is connected or allowed to receive data. */
    providerAuthorization: "not-evaluated"
  }
  budget: ContextPolicy["budget"] & {
    instructionTokens: number
    historyTokens: number
    exactPinTokens: number
    estimatedInputTokens: number
    estimatedTotalTokens: number
    remainingInputTokens: number
    overflowTokens: number
  }
}

export function createContextPolicy(contextWindowTokens: number, outputReserveTokens: number): ContextPolicy {
  return normalizeContextPolicy({ sessionInstructions: "", messagePolicies: {}, budget: { contextWindowTokens, outputReserveTokens, otherInputTokens: 0 } })
}

/** Keep instructions/budget, pruning selectors outside a fork/retry or redacted boundary. */
export function contextPolicyForMessages(policy: ContextPolicy, messages: readonly ConversationMessage[]): ContextPolicy {
  const valid = new Set(messages.filter(message => !message.redacted).map(message => message.id))
  return { ...normalizeContextPolicy(policy), messagePolicies: Object.fromEntries(Object.entries(policy.messagePolicies).filter(([id]) => valid.has(id))) }
}

/** Validate drafts without contacting a tokenizer, provider, memory service or harness. */
export function normalizeContextPolicy(value: ContextPolicy): ContextPolicy {
  if (!value || typeof value.sessionInstructions !== "string" || value.sessionInstructions.length > 16000) throw new Error("Session instructions must be text of up to 16,000 characters.")
  if (!value.messagePolicies || typeof value.messagePolicies !== "object" || Array.isArray(value.messagePolicies)) throw new Error("Use message IDs with explicit context policies.")
  const entries = Object.entries(value.messagePolicies)
  if (entries.length > 10000 || entries.some(([id, policy]) => !id.trim() || id.length > 200 || ["__proto__", "constructor", "prototype"].includes(id) || !MESSAGE_CONTEXT_POLICIES.includes(policy))) throw new Error("Choose a supported policy for each valid message ID.")
  const budget = value.budget
  if (!budget || !Number.isSafeInteger(budget.contextWindowTokens) || budget.contextWindowTokens < 2 || !Number.isSafeInteger(budget.outputReserveTokens) || budget.outputReserveTokens < 1 || budget.outputReserveTokens >= budget.contextWindowTokens || !Number.isSafeInteger(budget.otherInputTokens) || budget.otherInputTokens < 0) throw new Error("Provide a context window, a positive output reserve smaller than that window, and a nonnegative estimate for other input.")
  return {
    sessionInstructions: value.sessionInstructions,
    messagePolicies: Object.fromEntries(entries),
    budget: { contextWindowTokens: budget.contextWindowTokens, outputReserveTokens: budget.outputReserveTokens, otherInputTokens: budget.otherInputTokens },
  }
}

/** Rough UTF-8 heuristic with message framing. Not a provider tokenizer or a safe upper bound. */
export function estimateContextTokens(text: string): number {
  return text ? Math.ceil(new TextEncoder().encode(text).length / 4) + 4 : 0
}

/**
 * Pass only the active branch or the retry/fork's original context boundary.
 * Filter messagePolicies to that same boundary; this planner never adds other response versions.
 * It never mutates history, summarizes text, retrieves evidence, or authorizes model dispatch.
 */
export function planContext(input: {
  policy: ContextPolicy
  messages: readonly ConversationMessage[]
  privacy: ConversationPrivacy
  inheritedInstructions?: readonly (ContextInstruction & { scope: "global" | "agent" | "project" })[]
}): ContextPlan {
  const policy = normalizeContextPolicy(input.policy)
  if (!input.privacy || typeof input.privacy.memoryDisabled !== "boolean" || typeof input.privacy.harnessDisabled !== "boolean") throw new Error("Provide both independent privacy settings.")
  const ids = new Set(input.messages.map(message => message.id))
  if (ids.size !== input.messages.length || input.messages.some(message => !message.id || !["user", "assistant"].includes(message.role) || typeof message.text !== "string")) throw new Error("Provide unique valid messages from one conversation boundary.")
  const scopes = ["global", "agent", "project"] as const
  const inherited = input.inheritedInstructions || []
  if (inherited.some(layer => !scopes.includes(layer.scope) || typeof layer.text !== "string" || layer.text.length > 16000) || new Set(inherited.map(layer => layer.scope)).size !== inherited.length) throw new Error("Provide at most one text instruction layer per global, agent or project scope.")
  const instructions = [
    ...scopes.flatMap(scope => inherited.filter(layer => layer.scope === scope)),
    { scope: "session" as const, text: policy.sessionInstructions },
  ].filter(layer => layer.text.trim()).map(layer => ({ ...layer, estimatedTokens: estimateContextTokens(layer.text) }))
  const conflicts: ContextConflict[] = []
  for (const id of Object.keys(policy.messagePolicies)) if (!ids.has(id)) conflicts.push({ code: "missing-message", messageId: id, detail: "This policy points outside the supplied context boundary. Review it; no message was fetched." })
  const summaryEligibleMessageIds: string[] = []
  const retrievalCandidateMessageIds: string[] = []
  const messages: ContextPlanMessage[] = input.messages.map(message => {
    const requestedPolicy = Object.hasOwn(policy.messagePolicies, message.id) ? policy.messagePolicies[message.id] : message.pinned ? "keep-exact" : "allow-summary"
    // A presentation pin is conservatively protected until the owner explicitly unpins it.
    const effectivePolicy = message.pinned ? "keep-exact" : requestedPolicy
    const row: ContextPlanMessage = { messageId: message.id, role: message.role, requestedPolicy, effectivePolicy, disposition: "included-exact", estimatedTokens: 0 }
    if (message.pinned && requestedPolicy !== "keep-exact") conflicts.push({ code: "pinned-policy", messageId: message.id, detail: "This message is pinned. Unpin it before choosing a policy that can omit or summarize it. Its exact text remains included." })
    if (message.redacted) {
      if (effectivePolicy === "keep-exact") conflicts.push({ code: "unavailable-pin", messageId: message.id, detail: "An exact pin refers to a redacted message. It cannot be restored from context policy." })
      return { ...row, disposition: "unavailable" }
    }
    if (effectivePolicy === "exclude") return { ...row, disposition: "excluded" }
    if (effectivePolicy === "retrieve") {
      if (input.privacy.harnessDisabled) {
        conflicts.push({ code: "retrieval-disabled", messageId: message.id, detail: "No harness disables helper selection from session history. Include this message exactly or change its policy." })
        return { ...row, disposition: "retrieval-disabled" }
      }
      retrievalCandidateMessageIds.push(message.id)
      conflicts.push({ code: "retrieval-pending", messageId: message.id, detail: "Retrieval is not connected. This candidate is not counted as included context until an explicit selection is available." })
      return { ...row, disposition: "retrieval-pending" }
    }
    if (effectivePolicy === "allow-summary" && !input.privacy.harnessDisabled) summaryEligibleMessageIds.push(message.id)
    // Allow-summary is permission for a future reviewed helper, never a fabricated summary.
    return { ...row, text: message.text, estimatedTokens: estimateContextTokens(message.text) }
  })
  const instructionTokens = instructions.reduce((sum, layer) => sum + layer.estimatedTokens, 0)
  const historyTokens = messages.reduce((sum, row) => sum + row.estimatedTokens, 0)
  const exactPinTokens = messages.filter(row => row.effectivePolicy === "keep-exact").reduce((sum, row) => sum + row.estimatedTokens, 0)
  const estimatedInputTokens = instructionTokens + historyTokens + policy.budget.otherInputTokens
  const estimatedTotalTokens = estimatedInputTokens + policy.budget.outputReserveTokens
  const overflowTokens = Math.max(0, estimatedTotalTokens - policy.budget.contextWindowTokens)
  if (overflowTokens) conflicts.push({ code: "budget-overflow", detail: "Estimated input plus the required output reserve exceeds the context window. Exact pins and instructions remain intact. Review the budget or explicitly fork; this preview never compacts history in place." })
  const nextAction = conflicts.some(conflict => !["retrieval-pending", "budget-overflow"].includes(conflict.code)) ? "review-conflicts" : overflowTokens ? "fork-required" : retrievalCandidateMessageIds.length ? "resolve-retrieval" : "within-estimated-budget"
  return {
    mode: "preview",
    estimateLabel: "Preview estimate · UTF-8 bytes ÷ 4 plus framing; not provider-tokenized. Excludes media, hidden reasoning and any unaccounted provider overhead.",
    instructions, messages, summaryEligibleMessageIds, retrievalCandidateMessageIds, conflicts, nextAction,
    helpers: { memoryReadsAllowed: !input.privacy.memoryDisabled, memoryWritesAllowed: !input.privacy.memoryDisabled, harnessAllowed: !input.privacy.harnessDisabled, summaryEligible: !input.privacy.harnessDisabled, sessionRetrievalEligible: !input.privacy.harnessDisabled, providerAuthorization: "not-evaluated" },
    budget: { ...policy.budget, instructionTokens, historyTokens, exactPinTokens, estimatedInputTokens, estimatedTotalTokens, remainingInputTokens: Math.max(0, policy.budget.contextWindowTokens - estimatedTotalTokens), overflowTokens },
  }
}
