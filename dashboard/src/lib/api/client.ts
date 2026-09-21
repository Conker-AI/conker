import type { Agent, Session, Ticket, TicketStatus, Job, JobInput, JournalEntry, Memory, Service, Tool, TerminalSnapshot, FilesSnapshot } from "./models"
import type { Connections } from "./config"
import type { ConversationMessage, ConversationState, ConversationUpdate, MessageUpdate, ReplyOptions } from "./conversation-types"
import type { ModelsConfiguration } from "./model-catalogue"
import type { VoiceInputClient } from "../voice/types"

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
export type SetupInput = { ownerName: string; password: string; connections: Connections }
export type AuthResult = { wired: false; message: string } | { wired: true; session: AuthState }
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
export interface ConkerClient {
  readonly systemRuntime: import("./system-runtime-types").SystemRuntimeClient
  readonly artifacts: import("./artifact-types").ArtifactClient
  readonly projects: import("./project-types").ProjectClient
  readonly collaboration: import("./agent-collaboration-types").AgentCollaborationClient
  readonly tasks: import("./task-types").TaskClient
  readonly mode: "fixture" | "http"
  readonly toolWorkspace: import("../tool-workspace").ToolWorkspaceClient
  readonly calls: import("./call-types").CallClient
  readonly voiceInput: VoiceInputClient
  load(): Promise<Snapshot>
  createAgent(input: import("./models").AgentInput): Promise<Agent>
  saveAgent(id: string, input: import("./models").AgentInput): Promise<Agent>
  archiveAgent(id: string, archived: boolean): Promise<Agent>
  deleteAgent(id: string): Promise<void>
  createMemory(input: import("./models").MemoryInput): Promise<Memory>
  saveMemory(id: string, input: import("./models").MemoryInput): Promise<Memory>
  deleteMemory(id: string): Promise<void>
  saveCharacter(profile: Character): Promise<Character>
  previewCharacter(profile: Character, mode: import("./character").CharacterMode): Promise<ReturnType<typeof import("./character").previewCharacter>>
  createConversation(agentId: string): Promise<Session>
  handoffConversation(sessionId: string, agentId: string): Promise<Session>
  sendMessage(sessionId: string, text: string, options?: { replyTo?: string; attachments?: import("../conversation-attachments").ConversationAttachment[]; researchMode?: import("../conversation-research").ResearchMode }): Promise<LocalMessage>
  updateConversation(sessionId: string, update: ConversationUpdate): Promise<Session>
  deleteConversation(sessionId: string): Promise<void>
  updateMessage(sessionId: string, messageId: string, update: MessageUpdate): Promise<ConversationMessage>
  forkConversation(sessionId: string, messageId: string): Promise<Session>
  /** Text deltas and optional public activity snapshots. Fixture mode simulates text only; retry never repeats actions. */
  streamReply(sessionId: string, options: ReplyOptions, onChunk: (chunk: string) => void): Promise<ConversationMessage>
  saveModelsConfiguration(value: ModelsConfiguration): Promise<ModelsConfiguration>
  requestReply(sessionId: string): Promise<void>
  decideTicket(id: string, status: TicketStatus): Promise<Ticket>
  updateJob(id: string, action: "toggle" | "run"): Promise<Job>
  createJob(input: JobInput): Promise<Job>
  saveJob(id: string, input: JobInput): Promise<Job>
  duplicateJob(id: string): Promise<Job>
  deleteJob(id: string): Promise<void>
  saveConnections(value: Connections): Promise<Connections>
  setup(input: SetupInput): Promise<AuthResult>
  login(password: string): Promise<AuthResult>
  enterPreview(ownerName?: string): Promise<AuthState>
}
