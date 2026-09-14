import type { Thread } from "./client"
import type { Session } from "./models"
import type { ConversationMessage, ConversationState } from "./conversation-types"

function sampleTimestamp(time: string) {
  const clock = /\b(\d{2}:\d{2})\b/.exec(time)?.[1] || "12:00"
  const day = time.includes("Yesterday") ? "11" : "12"
  return `2026-09-${day}T${clock}:00+03:00`
}

export function createConversationState(): ConversationState {
  return {
    messages: [], incognito: false, modelId: null,
    privacy: { memoryDisabled: false, harnessDisabled: false },
    usage: { inputTokens: 0, outputTokens: 0, costUsd: null, mode: "sample" },
    memory: { scope: "conversation", sources: [], writeEnabled: false },
    grants: [],
    autonomy: { level: "ask", detail: "Ask before actions. This preview has no live execution grants." },
    files: [],
  }
}

export function createConversations(sessions: Session[], threads: Record<string, Thread>) {
  return Object.fromEntries(sessions.map(session => {
    const conversation = createConversationState()
    const thread = threads[session.id]
    if (!thread) return [session.id, conversation]

    conversation.messages = thread.messages.map(message => ({
      id: message.id, role: "user", text: message.text,
      createdAt: sampleTimestamp(message.time), status: "complete",
    } satisfies ConversationMessage))
    const original = conversation.messages[0]
    conversation.messages.push({
      id: `${session.id}-assistant`, role: "assistant", text: thread.reply,
      createdAt: sampleTimestamp(thread.time), status: "complete", scenario: true,
      source: original ? { id: original.id, label: "Original request", href: `/chat/${session.id}#${encodeURIComponent(original.id)}` } : undefined,
    })
    conversation.usage.inputTokens = conversation.messages.filter(message => message.role === "user").reduce((sum, message) => sum + Math.ceil(message.text.length / 4), 0)
    conversation.usage.outputTokens = Math.ceil(thread.reply.length / 4)
    if (session.id === "week" || session.id === "judo") {
      conversation.memory = {
        scope: "selected", writeEnabled: false,
        sources: [{ id: "training", label: "Training schedule · sample reference" }],
      }
    }
    if (session.id === "judo") {
      conversation.parentSessionId = "week"
      conversation.forkMessageId = "intent"
    }
    if (session.id === "reading") {
      conversation.files = [{ id: "downloads", name: "Downloads · 47 PDFs (sample reference)", kind: "reference", source: "/inbox/cleanup" }]
    }
    return [session.id, conversation]
  })) as Record<string, ConversationState>
}
