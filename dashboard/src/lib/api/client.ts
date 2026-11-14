import type { Agent, Session, Ticket, Job, JournalEntry, Memory, Service, Tool, TerminalSnapshot, FilesSnapshot } from "./models"
import type { Connections } from "./config"
import type { ConversationState } from "./conversation-types"
import type { ModelsConfiguration } from "./model-catalogue"

export type Face = "sprout" | "round" | "cat"
export type PortraitTone = "green" | "soft" | "graphite"
export type Emotion = "neutral" | "happy" | "thinking" | "concerned" | "celebrating"
export type Character = {
  studio?: import("./character").CharacterStudio
  name: string
  speakingPreset: "warm" | "direct" | "curious" | "custom"
  speakingStyle: string
  personality: string
  renderer: "static" | "live-2d" | "live-3d"
  portrait: string
  face: Face
  tone: PortraitTone
  mood: string
  emotions: Record<Emotion, "default" | Face | "portrait">
}
export type LocalMessage = { id: string; text: string; createdAt: string; attachments?: import("../conversation-attachments").ConversationAttachment[]; researchMode?: import("../conversation-research").ResearchMode }
export type Thread = {
  messages: { id: string; text: string; time: string; language?: string }[]
  reply: string
  mood: string
  time: string
  sources?: { id: string; text: string; time: string }[]
  tool?: { name: string; summary: string; record: Record<string, unknown> }
}
export type AuthState = { status: "unconfigured" | "preview" | "authenticated"; ownerName: string }
export type DailyHeadline = {
  id: string
  title: string
  summary: string
  publisher: string
  url: string
  publishedAt: string
  topic: string
}
export type DailyBriefing = {
  date: string
  timezone: string
  mode: "sample" | "live"
  summary: string
  news: {
    status: "unavailable" | "ready"
    updatedAt: string | null
    items: DailyHeadline[]
  }
}
export type Snapshot = {
  /** Resolved owner views only; hidden-source bodies and raw comparison text never escape. */
  artifacts: import("./artifact-types").ArtifactView[]
  projects: import("./project-types").ProjectRecord[]
  collaboration: import("./agent-collaboration-types").CollaborationData
  tasks: import("./task-types").TaskRecord[]
  companionSessionId: string
  dailyBriefing: DailyBriefing
  agents: Agent[]; sessions: Session[]; tickets: Ticket[]; jobs: Job[]
  entries: JournalEntry[]; memories: Memory[]; services: Service[]; tools: Tool[]
  vitals: { name: string; value: string; unit: string; used: number; detail: string }[]
  system: { status: string; detail: string; sampleAge: string; sampledAt: string; recoverySummary: string; recoveryDetail: string }
  memorySearch: { degraded: boolean; detail: string }
  plan: { day: string; date: string; title: string; detail: string }[]
  planningIntent: string
  profile: Character
  messages: Record<string, LocalMessage[]>
  conversations: Record<string, ConversationState>
  modelsConfiguration: ModelsConfiguration
  threads: Record<string, Thread>
  replyRequests: string[]
  auth: AuthState
  connections: Connections
  terminal: TerminalSnapshot
  files: FilesSnapshot
}

/** Transport boundary. No React, browser storage, or fixture types in this contract. */
