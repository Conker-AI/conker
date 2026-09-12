import type { Agent, Session, Ticket, TicketStatus, Job, JournalEntry, Memory, Service, Tool } from "./models"
import type { Connections } from "./config"

export type Face = "sprout" | "round" | "cat"
export type PortraitTone = "green" | "soft" | "graphite"
export type Emotion = "neutral" | "happy" | "thinking" | "concerned" | "celebrating"
export type Character = {
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
export type LocalMessage = { id: string; text: string; createdAt: string }
export type AuthState = { status: "unconfigured" | "preview" | "authenticated"; ownerName: string }
export type SetupInput = { ownerName: string; password: string; connections: Connections }
export type AuthResult = { wired: false; message: string } | { wired: true; session: AuthState }
export type Snapshot = {
  agents: Agent[]; sessions: Session[]; tickets: Ticket[]; jobs: Job[]
  entries: JournalEntry[]; memories: Memory[]; services: Service[]; tools: Tool[]
  vitals: { name: string; value: string; unit: string; used: number; detail: string }[]
  plan: { day: string; date: string; title: string; detail: string }[]
  planningIntent: string
  profile: Character
  messages: Record<string, LocalMessage[]>
  replyRequests: string[]
  auth: AuthState
  connections: Connections
  terminal: { prompt: string; context: [string, string][] }
}

/** Transport boundary. No React, browser storage, or fixture types in this contract. */
export interface ConkerClient {
  readonly mode: "fixture" | "http"
  load(): Promise<Snapshot>
  saveCharacter(profile: Character): Promise<Character>
  sendMessage(sessionId: string, text: string): Promise<LocalMessage>
  requestReply(sessionId: string): Promise<void>
  decideTicket(id: string, status: TicketStatus): Promise<Ticket>
  updateJob(id: string, action: "toggle" | "run"): Promise<Job>
  saveConnections(value: Connections): Promise<Connections>
  setup(input: SetupInput): Promise<AuthResult>
  login(password: string): Promise<AuthResult>
  enterPreview(ownerName?: string): Promise<AuthState>
}
