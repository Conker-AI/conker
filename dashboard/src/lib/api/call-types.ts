import type { CharacterMode } from "./character"

export type CallChannels = {
  microphone: boolean; camera: boolean; keyboard: boolean
  voice: boolean; avatar: boolean; captions: boolean
}
export type CallEvent = {
  id: string; at: number; kind: "user" | "assistant" | "event"; text: string
}
export type CallSession = {
  id: string; conversationId: string; agentId: string; name: string
  startedAt: number; endedAt?: number; mode: CharacterMode; modelId: string | null
  channels: CallChannels; phase: "ready" | "thinking" | "responding" | "ended"
  paused: boolean
  privacy: { memory: boolean; harness: boolean }; events: CallEvent[]
}
export type CallUpdate = {
  channels?: Partial<CallChannels>; mode?: CharacterMode
  paused?: boolean
  privacy?: Partial<CallSession["privacy"]>; modelId?: string
}
/** Replace the fixture transport here when realtime services are available. */
export interface CallClient {
  start(conversationId: string): Promise<CallSession>
  update(id: string, patch: CallUpdate): Promise<CallSession>
  send(id: string, text: string, signal: AbortSignal, onChange: (call: CallSession) => void): Promise<CallSession>
  end(id: string): Promise<CallSession>
}
