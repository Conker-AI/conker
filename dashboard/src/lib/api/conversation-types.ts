export type ConversationMessage = {
  id: string
  role: "user" | "assistant"
  text: string
  createdAt: string
  source?: { id: string; label: string; href?: string }
  pinned?: boolean
  edited?: boolean
  redacted?: boolean
  /** Existing scenario cards belong to this one assistant message. */
  scenario?: boolean
  modelId?: string
  status?: "complete" | "stopped"
  replyTo?: string
  retryOf?: string
}

export type ConversationPrivacy = { memoryDisabled: boolean; harnessDisabled: boolean }

export type ConversationState = {
  messages: ConversationMessage[]
  /** Derived: true when either privacy exclusion is enabled. */
  incognito: boolean
  privacy: ConversationPrivacy
  /** null follows the default route in Settings. */
  modelId: string | null
  parentSessionId?: string
  forkMessageId?: string
  usage: { inputTokens: number; outputTokens: number; costUsd: number | null; mode: "sample" }
  memory: {
    scope: "conversation" | "selected" | "none"
    sources: { id: string; label: string }[]
    writeEnabled: false
  }
  grants: { id: string; label: string; scope: string; status: "sample" | "revoked" }[]
  autonomy: { level: "ask" | "observe"; detail: string }
  files: { id: string; name: string; kind: "reference"; source?: string }[]
}

export type ConversationUpdate = {
  title?: string
  pinned?: boolean
  archived?: boolean
  incognito?: boolean
  privacy?: Partial<ConversationPrivacy>
  modelId?: string | null
}

export type MessageUpdate = { text?: string; pinned?: boolean; redacted?: boolean }
export type ReplyOptions = { modelId?: string; retryMessageId?: string; signal?: AbortSignal }
