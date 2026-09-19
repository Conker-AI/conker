import type { ConversationMessage, ConversationPrivacy, ConversationState } from "./api/conversation-types"
import type { Snapshot } from "./api/client"
import { getAvailableModels } from "./api/model-catalogue"

export const MAX_QUEUED_TURNS = 5

/** A queued turn is an immutable request snapshot, never a grant of authority. */
export type QueuedTurn = {
  id: string
  sessionId: string
  text: string
  replyTo?: string
  agentId: string
  privacy: ConversationPrivacy
  modelId: string
  modelLabel: string
  presentationMode: "focus" | "character"
  authorityFingerprint: string
  routeFingerprint: string
  createdAt: string
  previewScenario?: string
  /** Retained after a successful save when only response generation failed. */
  sentMessageId?: string
}

export type TurnQueue = { entries: QueuedTurn[]; paused: boolean; reason?: string }

function authorityFingerprint(conversation: ConversationState) {
  return JSON.stringify({ grants: conversation.grants, autonomy: conversation.autonomy, memory: conversation.memory })
}

function routeFingerprint(data: Snapshot, modelId: string) {
  const model = data.modelsConfiguration.models.find(item => item.id === modelId)
  const provider = data.modelsConfiguration.providers.find(item => item.id === model?.providerId)
  // Never retain a provider key in the queue or its UI.
  return JSON.stringify([model?.providerId, model?.route, provider?.endpoint])
}

export function captureQueuedTurn(data: Snapshot, sessionId: string, text: string, modelId: string, replyTo?: string): QueuedTurn {
  const session = data.sessions.find(item => item.id === sessionId)
  const conversation = data.conversations[sessionId]
  const model = getAvailableModels(data.modelsConfiguration).find(item => item.id === modelId)
  if (!session || !conversation) throw new Error("This conversation is no longer available.")
  if (session.archived) throw new Error("Restore this conversation before queuing a message.")
  if (!model) throw new Error("Choose an enabled model before queuing a message.")
  if (!text.trim() || text.length > 4000) throw new Error("Use 1–4,000 characters for a queued message.")
  if (replyTo && !conversation.messages.some(item => item.id === replyTo && !item.redacted)) throw new Error("The reply target is no longer available.")
  return {
    id: crypto.randomUUID(), sessionId, text: text.trim(), replyTo,
    agentId: session.agentId || conversation.initialAgentId,
    privacy: { ...conversation.privacy }, modelId, modelLabel: model.name,
    presentationMode: conversation.presentationMode || "focus",
    authorityFingerprint: authorityFingerprint(conversation), routeFingerprint: routeFingerprint(data, modelId),
    createdAt: new Date().toISOString(),
  }
}

/** A mismatch must pause the queue. Resume alone must not silently replace its snapshot. */
export function validateQueuedTurn(entry: QueuedTurn, data: Snapshot): string | null {
  const session = data.sessions.find(item => item.id === entry.sessionId)
  const conversation = data.conversations[entry.sessionId]
  if (!session || !conversation) return "This conversation was removed. Unsent text is retained here."
  if (session.archived) return "This conversation is archived. Restore it before resuming."
  if ((session.agentId || conversation.initialAgentId) !== entry.agentId) return "The conversation's agent changed. Review this queued message before sending."
  if (conversation.privacy.memoryDisabled !== entry.privacy.memoryDisabled || conversation.privacy.harnessDisabled !== entry.privacy.harnessDisabled) return "Incognito settings changed. Review this queued message before sending."
  if ((conversation.presentationMode || "focus") !== entry.presentationMode) return "The conversation mode changed. Review this queued message before sending."
  if (!getAvailableModels(data.modelsConfiguration).some(model => model.id === entry.modelId)) return "The queued model is disabled. Review this message and choose an available model."
  if (routeFingerprint(data, entry.modelId) !== entry.routeFingerprint) return "The queued model route changed. Review this message before sending."
  if (authorityFingerprint(conversation) !== entry.authorityFingerprint) return "Conversation access changed. Review this queued message before sending."
  if (entry.replyTo && !conversation.messages.some(item => item.id === entry.replyTo && !item.redacted)) return "The queued reply target was removed. Review this message before sending."
  if (entry.sentMessageId) {
    const saved = conversation.messages.find(item => item.id === entry.sentMessageId && !item.redacted)
    if (!saved) return "The saved queued message is no longer available. Remove this queue entry and retry its message explicitly."
    if (saved.role !== "user" || saved.text !== entry.text || saved.replyTo !== entry.replyTo) return "The saved queued message changed. Remove this queue entry and retry the edited message explicitly."
  }
  return null
}

export function responseFamilyId(messages: ConversationMessage[], message: ConversationMessage): string {
  if (message.responseFamilyId) return message.responseFamilyId
  const seen = new Set<string>([message.id])
  let current = message
  while (current.retryOf && !seen.has(current.retryOf)) {
    seen.add(current.retryOf)
    const parent = messages.find(item => item.id === current.retryOf && item.role === "assistant")
    if (!parent) return current.retryOf
    if (parent.responseFamilyId) return parent.responseFamilyId
    current = parent
  }
  return current.id
}

export type ConversationRow = {
  message: ConversationMessage
  versions: ConversationMessage[]
  familyId: string
  activeId: string
  hasLaterTurns: boolean
}

/** Presentation selection never rewrites the branch used by downstream turns. */
export function conversationRows(messages: ConversationMessage[], selected: Record<string, string> = {}): ConversationRow[] {
  const rows: ConversationRow[] = []
  const seen = new Set<string>()
  for (const [index, message] of messages.entries()) {
    if (message.role === "user") {
      rows.push({ message, versions: [message], familyId: message.id, activeId: message.id, hasLaterTurns: messages.slice(index + 1).some(item => item.role === "user") })
      continue
    }
    const familyId = responseFamilyId(messages, message)
    if (seen.has(familyId)) continue
    seen.add(familyId)
    const versions = messages.filter(item => item.role === "assistant" && responseFamilyId(messages, item) === familyId)
    const nextUser = messages.slice(index + 1).find(item => item.role === "user")
    const preserved = nextUser?.contextMessageIds?.find(id => versions.some(item => item.id === id))
    const active = versions.find(item => item.id === preserved) || (nextUser ? versions[0] : versions.at(-1)!)
    const visible = versions.find(item => item.id === selected[familyId]) || active
    rows.push({ message: visible, versions, familyId, activeId: active.id, hasLaterTurns: !!nextUser })
  }
  return rows
}

export function activeConversationMessages(messages: ConversationMessage[]): ConversationMessage[] {
  return conversationRows(messages).map(row => row.message)
}

/** Resolve IDs against current records so edited/redacted text is never a stale embedded copy. */
export function contextBeforeMessage(messages: ConversationMessage[], messageId: string): ConversationMessage[] {
  const message = messages.find(item => item.id === messageId)
  if (!message) return []
  if (message.contextMessageIds) {
    const ids = new Set(message.contextMessageIds)
    return message.contextMessageIds.flatMap(id => {
      const found = messages.find(item => item.id === id)
      if (!found || found.id === messageId || !ids.delete(id)) return []
      return [found]
    })
  }
  const familyId = responseFamilyId(messages, message)
  const boundary = message.role === "assistant" ? messages.findIndex(item => item.role === "assistant" && responseFamilyId(messages, item) === familyId) : messages.indexOf(message)
  return activeConversationMessages(messages.slice(0, boundary))
}

export function messagesForFork(messages: ConversationMessage[], messageId: string): ConversationMessage[] {
  const message = messages.find(item => item.id === messageId)
  if (!message || message.redacted) throw new Error("Choose an available message to fork from.")
  return [...contextBeforeMessage(messages, messageId), message]
}

export function hasDownstreamMessages(messages: ConversationMessage[], messageId: string): boolean {
  const message = messages.find(item => item.id === messageId)
  if (!message) return false
  const index = messages.indexOf(message)
  if (message.role === "user") return messages.slice(index + 1).some(item => item.role === "user" || contextBeforeMessage(messages, item.id).some(parent => parent.id === messageId))
  const familyId = responseFamilyId(messages, message)
  const row = conversationRows(messages).find(item => item.familyId === familyId)
  return !!row?.hasLaterTurns
}
