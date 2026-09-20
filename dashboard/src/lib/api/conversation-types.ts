export type ActivityPhase = "thinking" | "searching" | "reading" | "tool" | "agent" | "waiting" | "streaming"
export type ActivityStep = {
  id: string
  kind: "phase" | "tool" | "agent" | "commentary" | "summary" | "plan" | "receipt" | "handoff"
  label: string
  status: "running" | "complete" | "stopped" | "failed" | "waiting"
  startedAt?: string
  endedAt?: string
  detail?: string
  toolName?: string
  sequence?: number
  parentId?: string
  agentId?: string
  agentName?: string
  handoffTo?: { id: string; name: string }
  source?: { id: string; label: string; href?: string }
  approvalId?: string
  summaryAvailability?: "available" | "unavailable"
  plan?: { id: string; label: string; status: "pending" | "running" | "complete" | "stopped" | "failed" }[]
  receipt?: { id: string; label: string; href?: string; kind: "file" | "diff"; added?: number; removed?: number }
  failure?: { message: string; recovery?: string }
  /** Public, sanitized evidence supplied by the transport; never raw credentials. */
  record?: Record<string, unknown>
}
export type ConversationRun = {
  id: string
  status: "running" | "complete" | "stopped" | "failed"
  phase: ActivityPhase
  label: string
  provenance: "preview" | "recorded" | "live"
  startedAt?: string
  endedAt?: string
  steps: ActivityStep[]
  sequence?: number
}

export type ConversationCitation = { id: string; label: string; href?: string; excerpt?: string }

export type ConversationMessage = {
  researchMode?: import("../conversation-research").ResearchMode
  attachments?: import("../conversation-attachments").ConversationAttachment[]
  id: string
  role: "user" | "assistant"
  agentId?: string
  agentName?: string
  text: string
  createdAt: string
  source?: { id: string; label: string; href?: string }
  citations?: ConversationCitation[]
  pinned?: boolean
  rating?: "up" | "down" | null
  edited?: boolean
  redacted?: boolean
  /** Existing scenario cards belong to this one assistant message. */
  scenario?: boolean
  modelId?: string
  presentationMode?: import("./character").CharacterMode
  status?: "complete" | "stopped" | "failed"
  responseFamilyId?: string
  contextMessageId?: string
  contextMessageIds?: string[]
  /** Configuration used for this response; later edits never rewrite its context. */
  contextPolicySnapshot?: import("./context-policy").ContextPolicy
  agentInstructionsSnapshot?: string
  replyTo?: string
  retryOf?: string
  activity?: ConversationRun
}

export type ConversationPrivacy = { memoryDisabled: boolean; harnessDisabled: boolean }
export type ConversationHandoff = { id: string; afterMessageId: string; fromAgentId: string; toAgentId: string; fromName: string; toName: string; createdAt: string }

export type ConversationState = {
  contextPolicy?: import("./context-policy").ContextPolicy
  messages: ConversationMessage[]
  /** Derived: true when either privacy exclusion is enabled. */
  incognito: boolean
  privacy: ConversationPrivacy
  initialAgentId: string
  handoffs: ConversationHandoff[]
  /** null follows the default route in Settings. */
  presentationMode?: import("./character").CharacterMode
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
  contextPolicy?: import("./context-policy").ContextPolicy
  presentationMode?: import("./character").CharacterMode
  title?: string
  pinned?: boolean
  archived?: boolean
  incognito?: boolean
  privacy?: Partial<ConversationPrivacy>
  modelId?: string | null
}

export type MessageUpdate = { text?: string; pinned?: boolean; redacted?: boolean; rating?: "up" | "down" | null }
export type ReplyOptions = { modelId?: string; retryMessageId?: string; signal?: AbortSignal; onActivity?: (run: ConversationRun) => void; /** Explicit developer fixture selection; absent for ordinary turns. */ previewScenario?: string }
