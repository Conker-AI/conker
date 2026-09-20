import type { Snapshot } from "./client"
import type { CallClient, CallSession, CallEvent } from "./call-types"
import { getAvailableModels } from "./model-catalogue"

export function createCallFixture(snapshot: () => Snapshot): CallClient {
  let call: CallSession | null = null
  const copy = () => structuredClone(call!)
  const availableAgent = (id: string) => {
    const agent = snapshot().agents.find(item => item.id === id)
    if (!agent || agent.archivedAt) throw new Error("Restore this agent before starting or continuing a call.")
  }
  const active = (id: string) => {
    if (!call || call.id !== id || call.endedAt) throw new Error("This call has ended. Start a new call to continue.")
    return call
  }
  const event = (kind: CallEvent["kind"], text: string) => {
    call!.events.push({ id: crypto.randomUUID(), at: Date.now(), kind, text })
  }
  const wait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
    const stop = () => { clearTimeout(timer); signal.removeEventListener("abort", stop); reject(new DOMException("Stopped", "AbortError")) }
    let remaining = ms, last = Date.now()
    const tick = () => {
      const now = Date.now()
      if (!call?.paused) remaining -= now - last
      last = now
      if (remaining <= 0) { signal.removeEventListener("abort", stop); resolve() }
      else timer = setTimeout(tick, 50)
    }
    let timer = setTimeout(tick, 50)
    signal.addEventListener("abort", stop, { once: true })
    if (signal.aborted) stop()
  })
  return {
    async start(conversationId) {
      if (call && !call.endedAt) { availableAgent(call.agentId); return copy() }
      const data = snapshot(), session = data.sessions.find(item => item.id === conversationId)
      if (!session || session.archived) throw new Error("Choose an active conversation to start a call.")
      const agent = data.agents.find(item => item.id === session.agentId || (!session.agentId && item.name === session.agent))
      if (!agent) throw new Error("Choose an available agent.")
      availableAgent(agent.id)
      const conversation = data.conversations[conversationId]
      call = {
        id: crypto.randomUUID(), conversationId, agentId: agent?.id || "companion", name: agent?.kind === "companion" || conversationId === data.companionSessionId ? data.profile.name : session.agent,
        startedAt: Date.now(), mode: conversation?.presentationMode || data.profile.studio?.modes.default || "character",
        modelId: conversation?.modelId || data.modelsConfiguration.defaultModelId,
        channels: { microphone: false, camera: false, keyboard: true, voice: true, avatar: false, captions: true },
        privacy: { memory: conversation?.privacy?.memoryDisabled ?? false, harness: conversation?.privacy?.harnessDisabled ?? false },
        phase: "ready", paused: false, events: [],
      }
      event("event", "Call preview started · English")
      return copy()
    },
    async update(id, patch) {
      const value = active(id)
      if (patch.modelId && !getAvailableModels(snapshot().modelsConfiguration).some(model => model.id === patch.modelId)) throw new Error("Choose an enabled model from Settings.")
      if (patch.channels) value.channels = { ...value.channels, ...patch.channels }
      if (patch.mode && patch.mode !== value.mode) { value.mode = patch.mode; event("event", `${patch.mode === "focus" ? "Focus" : "Character"} mode`) }
      if (patch.privacy) value.privacy = { ...value.privacy, ...patch.privacy }
      if (patch.modelId) value.modelId = patch.modelId
      if (patch.paused !== undefined && patch.paused !== value.paused) {
        value.paused = patch.paused
        event("event", patch.paused ? "Call paused" : "Call resumed")
      }
      return copy()
    },
    async send(id, text, signal, onChange) {
      const value = active(id)
      availableAgent(value.agentId)
      if (value.paused) throw new Error("Resume the call before sending a message.")
      if (value.phase !== "ready") throw new Error("Wait for this response or stop it first.")
      if (!text.trim() || text.length > 4000) throw new Error("Enter a message of up to 4,000 characters.")
      event("user", text.trim()); value.phase = "thinking"; onChange(copy())
      try {
        await wait(700, signal); active(id); availableAgent(value.agentId)
        value.phase = "responding"; onChange(copy())
        await wait(700, signal); active(id); availableAgent(value.agentId)
        event("assistant", value.mode === "focus"
          ? "This is a sample response. Your typed message reached the call preview. A connected reasoning model will answer here; speech and tools are not connected yet."
          : "I'm here. You can talk, type, or switch between them without leaving our call. This is a sample of the conversation flow; my live voice and reasoning aren't connected yet.")
      } catch (error) {
        if (!(error instanceof Error && error.name === "AbortError")) throw error
        if (!value.endedAt) event("event", "Response interrupted")
      } finally {
        if (!value.endedAt) value.phase = "ready"
      }
      return structuredClone(value)
    },
    async end(id) {
      const value = active(id)
      value.endedAt = Date.now(); value.phase = "ended"
      value.channels.microphone = false; value.channels.camera = false
      event("event", "Call ended")
      return copy()
    },
  }
}
