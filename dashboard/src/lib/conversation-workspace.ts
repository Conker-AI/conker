import { create } from "zustand"
import { conkerClient } from "@/lib/api"
import { useConkerStore } from "@/lib/api/store"
import { getAvailableModels } from "@/lib/api/model-catalogue"
import type { ConversationRun } from "@/lib/api/conversation-types"

export type RailView = "overview" | "forks" | "source" | "explain" | "usage" | "privacy" | "daily"
type Rail = { open: boolean; view: RailView; messageId?: string }
type Stream = { text: string; modelId: string; phase: "thinking" | "streaming" }
type Workspace = {
  rails: Record<string, Rail>
  nextModels: Record<string, string>
  replies: Record<string, string | undefined>
  notices: Record<string, string>
  streams: Record<string, Stream | undefined>
  activities: Record<string, ConversationRun | undefined>
  openRail: (id: string, view?: RailView, messageId?: string) => void
  closeRail: (id: string) => void
  setNextModel: (id: string, modelId: string) => void
  setReply: (id: string, messageId?: string) => void
  notify: (id: string, message: string) => void
  reset: (id: string) => void
  send: (id: string) => Promise<void>
  retry: (id: string, messageId: string, modelId: string) => Promise<boolean>
  stop: (id: string) => void
}
const controllers = new Map<string, AbortController>()

export const useConversationWorkspace = create<Workspace>((set, get) => {
  const run = async (id: string, retryMessageId?: string, retryModelId?: string) => {
    if (get().streams[id] || useConkerStore.getState().pending) return false
    const store = useConkerStore.getState()
    const data = store.data
    if (!data) return false
    const draft = store.drafts[id] || ""
    if (!retryMessageId && !draft.trim()) return false
    const modelId = retryModelId || get().nextModels[id] || data.conversations[id]?.modelId || data.modelsConfiguration.defaultModelId
    if (!modelId || !getAvailableModels(data.modelsConfiguration).some(model => model.id === modelId)) {
      get().notify(id, "Choose an enabled model in Tools, or configure a default in Settings.")
      return false
    }
    const controller = new AbortController()
    controllers.set(id, controller)
    set(state => ({ streams: { ...state.streams, [id]: { text: "", modelId, phase: "thinking" } }, activities: { ...state.activities, [id]: undefined }, notices: { ...state.notices, [id]: "" } }))
    try {
      if (!retryMessageId) {
        const replyTo = data.conversations[id]?.messages.find(message => message.id === get().replies[id] && !message.redacted)?.id
        const saved = await store.mutate(() => conkerClient.sendMessage(id, draft, { replyTo }))
        if (!saved) {
          get().notify(id, useConkerStore.getState().error || "Your message could not be saved. Your draft is retained.")
          return false
        }
        if (useConkerStore.getState().drafts[id] === draft) store.setDraft(id, "")
        get().setReply(id)
      }
      await conkerClient.streamReply(id, { modelId, retryMessageId, signal: controller.signal, onActivity: activity => {
        set(state => ({ activities: { ...state.activities, [id]: activity } }))
      } }, chunk => {
        set(state => ({ streams: { ...state.streams, [id]: { modelId, phase: "streaming", text: (state.streams[id]?.text || "") + chunk } } }))
      })
      return !controller.signal.aborted
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        get().notify(id, error instanceof Error ? error.message : "The preview response failed. Your message is retained.")
      }
      return false
    } finally {
      await useConkerStore.getState().load()
      if (!retryMessageId && get().nextModels[id] === modelId) get().setNextModel(id, "")
      controllers.delete(id)
      set(state => {
        const activity = state.activities[id]
        const saved = useConkerStore.getState().data?.conversations[id]?.messages.some(message => message.activity?.id === activity?.id)
        return { streams: { ...state.streams, [id]: undefined }, activities: { ...state.activities, [id]: saved ? undefined : activity } }
      })
    }
  }
  return {
    rails: {}, nextModels: {}, replies: {}, notices: {}, streams: {}, activities: {},
    openRail: (id, view = "overview", messageId) => set(state => ({ rails: { ...state.rails, [id]: { open: true, view, messageId } } })),
    closeRail: id => set(state => ({ rails: { ...state.rails, [id]: { ...state.rails[id], open: false, view: state.rails[id]?.view || "overview" } } })),
    setNextModel: (id, modelId) => set(state => ({ nextModels: { ...state.nextModels, [id]: modelId } })),
    setReply: (id, messageId) => set(state => ({ replies: { ...state.replies, [id]: messageId } })),
    notify: (id, message) => set(state => ({ notices: { ...state.notices, [id]: message } })),
    reset: id => set(state => {
      const rails = { ...state.rails }, nextModels = { ...state.nextModels }, replies = { ...state.replies }, notices = { ...state.notices }, activities = { ...state.activities }
      delete rails[id]; delete nextModels[id]; delete replies[id]; delete notices[id]
      delete activities[id]
      return { rails, nextModels, replies, notices, activities }
    }),
    send: async id => { await run(id) },
    retry: (id, messageId, modelId) => run(id, messageId, modelId),
    stop: id => { controllers.get(id)?.abort(); get().notify(id, "Preview response stopped. No tools were run.") },
  }
})
