import { create } from "zustand"
import { conkerClient } from "@/lib/api"
import { useConkerStore } from "@/lib/api/store"
import { getAvailableModels } from "@/lib/api/model-catalogue"
import type { ConversationRun } from "@/lib/api/conversation-types"
import { captureQueuedTurn, validateQueuedTurn, MAX_QUEUED_TURNS, type QueuedTurn, type TurnQueue } from "@/lib/conversation-continuity"
import { mergeActivityRun } from "@/lib/conversation-activity"
import { useArtifactWorkspace } from "@/lib/artifact-workspace"
import { pruneLocalAttachments } from "@/lib/conversation-attachments"

export type RailView = "overview" | "forks" | "source" | "explain" | "usage" | "privacy" | "daily" | "activity"
type Rail = { open: boolean; view: RailView; messageId?: string; sourceId?: string; runId?: string; stepId?: string }
type Stream = { text: string; modelId: string; phase: "thinking" | "streaming" }
type UnansweredRequest = { messageId: string; modelId: string; reason: string }
type Workspace = {
  rails: Record<string, Rail>
  nextModels: Record<string, string>
  replies: Record<string, string | undefined>
  notices: Record<string, string>
  streams: Record<string, Stream | undefined>
  activities: Record<string, ConversationRun | undefined>
  queues: Record<string, TurnQueue | undefined>
  selectedVersions: Record<string, Record<string, string>>
  previews: Record<string, string>
  activeQueued: Record<string, string | undefined>
  unanswered: Record<string, UnansweredRequest | undefined>
  openRail: (id: string, view?: RailView, messageId?: string, detail?: { sourceId?: string; runId?: string; stepId?: string }) => void
  closeRail: (id: string) => void
  setNextModel: (id: string, modelId: string) => void
  setReply: (id: string, messageId?: string) => void
  setPreview: (id: string, scenario: string) => void
  selectVersion: (id: string, familyId: string, messageId: string) => void
  notify: (id: string, message: string) => void
  reset: (id: string) => void
  send: (id: string) => Promise<void>
  retry: (id: string, messageId: string, modelId: string) => Promise<boolean>
  retryUnanswered: (id: string) => Promise<boolean>
  stop: (id: string) => void
  steer: (id: string) => Promise<boolean>
  enqueue: (id: string) => void
  editQueued: (id: string, entryId: string, text: string) => boolean
  reviewQueued: (id: string, entryId: string) => boolean
  removeQueued: (id: string, entryId: string) => void
  pauseQueue: (id: string, reason?: string) => void
  resumeQueue: (id: string) => Promise<void>
}
const controllers = new Map<string, AbortController>()
const steeringRequests = new Map<string, { runId: string; text: string; requestId: string }>()
const draining = new Set<string>()

function approvalWait(id: string): string | null {
  const data = useConkerStore.getState().data
  const messages = data?.conversations[id]?.messages
  const unresolved = messages?.some(message => !message.redacted && message.activity?.steps.some(step => {
    if (step.status !== "waiting") return false
    const ticket = data?.tickets.find(item => item.id === step.approvalId)
    return !ticket || ticket.status === "Needs you"
  }))
  return unresolved ? "A response is waiting for a decision. Review it in Inbox before resuming the queue." : null
}

export const useConversationWorkspace = create<Workspace>((set, get) => {
  const queueUpdate = (id: string, update: (queue: TurnQueue) => TurnQueue) => set(state => ({ queues: { ...state.queues, [id]: update(state.queues[id] || { entries: [], paused: false }) } }))
  const run = async (id: string, retryMessageId?: string, retryModelId?: string, entry?: QueuedTurn, savedRequestId?: string) => {
    if (get().streams[id] || useConkerStore.getState().pending) return false
    const store = useConkerStore.getState()
    const data = store.data
    if (!data) return false
    const draft = entry?.text ?? store.drafts[id] ?? ""
    const attachments = entry ? entry.attachments || [] : store.attachmentDrafts[id] || []
    const researchMode = entry ? entry.researchMode || "off" : store.researchDrafts[id] || "off"
    if (!retryMessageId && !savedRequestId && !draft.trim() && !attachments.length) return false
    const modelId = entry?.modelId || retryModelId || get().nextModels[id] || data.conversations[id]?.modelId || data.modelsConfiguration.defaultModelId
    if (!modelId || !getAvailableModels(data.modelsConfiguration).some(model => model.id === modelId)) {
      get().notify(id, "Choose an enabled model in Tools, or configure a default in Settings.")
      return false
    }
    if (entry) {
      const invalid = validateQueuedTurn(entry, data) || approvalWait(id)
      if (invalid) { get().pauseQueue(id, invalid); return false }
    }
    const controller = new AbortController()
    controllers.set(id, controller)
    const previewScenario = retryMessageId || savedRequestId || entry?.sentMessageId ? undefined : entry ? entry.previewScenario : get().previews[id]
    if (!entry && !retryMessageId && !savedRequestId) get().setPreview(id, "")
    set(state => ({ activeQueued: { ...state.activeQueued, [id]: entry?.id }, streams: { ...state.streams, [id]: { text: "", modelId, phase: "thinking" } }, activities: { ...state.activities, [id]: undefined }, notices: { ...state.notices, [id]: "" } }))
    let requestId = savedRequestId
    let startFailure: string | undefined
    try {
      if (!retryMessageId && !savedRequestId && !entry?.sentMessageId) {
        const replyTo = entry ? entry.replyTo : data.conversations[id]?.messages.find(message => message.id === get().replies[id] && !message.redacted)?.id
        let savedMessageId: string | undefined
        const saved = await store.mutate(async () => { savedMessageId = (await conkerClient.sendMessage(id, draft, { replyTo, attachments, researchMode })).id })
        if (!saved) {
          get().notify(id, useConkerStore.getState().error || "Your message could not be saved. Your draft is retained.")
          return false
        }
        if (entry) queueUpdate(id, queue => ({ ...queue, entries: queue.entries.map(item => item.id === entry.id ? { ...item, sentMessageId: savedMessageId } : item) }))
        else {
          requestId = savedMessageId
          set(state => ({ unanswered: { ...state.unanswered, [id]: undefined } }))
          if (useConkerStore.getState().drafts[id] === draft) store.setDraft(id, "")
          if ((useConkerStore.getState().researchDrafts[id] || "off") === researchMode) store.setResearchMode(id, "off")
          store.setAttachments(id, (useConkerStore.getState().attachmentDrafts[id] || []).filter(item => !attachments.some(sent => sent.id === item.id)))
          get().setReply(id)
        }
      }
      if (controller.signal.aborted) return false
      if (entry) {
        const fresh = useConkerStore.getState().data
        const savedEntry = get().queues[id]?.entries.find(item => item.id === entry.id)
        const invalid = fresh && savedEntry ? validateQueuedTurn(savedEntry, fresh) : "This queued request is no longer available."
        if (invalid) { get().pauseQueue(id, invalid); return false }
      }
      const savedAttempt = entry?.sentMessageId ? [...(useConkerStore.getState().data?.conversations[id]?.messages || [])].reverse().find(message => message.role === "assistant" && message.contextMessageId === entry.sentMessageId && !message.redacted) : undefined
      const response = await conkerClient.streamReply(id, { modelId, retryMessageId: retryMessageId || savedAttempt?.id, signal: controller.signal, previewScenario, onReset: () => {
        if (controllers.get(id) === controller && !controller.signal.aborted) set(state => ({ streams: { ...state.streams, [id]: { modelId, phase: "thinking", text: "" } } }))
      }, onActivity: activity => {
        if (controllers.get(id) !== controller) return
        set(state => ({ activities: { ...state.activities, [id]: mergeActivityRun(state.activities[id], activity) } }))
        if (activity.phase === "waiting" || activity.steps.some(step => step.status === "waiting")) get().pauseQueue(id, "Waiting for a decision. Review the activity before resuming queued messages.")
      } }, chunk => {
        if (controllers.get(id) !== controller || controller.signal.aborted) return
        set(state => ({ streams: { ...state.streams, [id]: { modelId, phase: "streaming", text: (state.streams[id]?.text || "") + chunk } } }))
      })
      if (response.responseFamilyId) get().selectVersion(id, response.responseFamilyId, response.id)
      return !controller.signal.aborted && response.status !== "stopped" && response.status !== "failed" && response.activity?.status !== "stopped" && response.activity?.status !== "failed"
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        startFailure = error instanceof Error ? error.message : "The preview response failed. Your message is retained."
        get().notify(id, startFailure)
      }
      return false
    } finally {
      await useConkerStore.getState().load()
      if (!entry && !retryMessageId && !savedRequestId && get().nextModels[id] === modelId) get().setNextModel(id, "")
      controllers.delete(id)
      set(state => {
        const activity = state.activities[id]
        const messages = useConkerStore.getState().data?.conversations[id]?.messages || []
        const saved = messages.some(message => message.activity?.id === activity?.id)
        const unanswered = { ...state.unanswered }
        if (!entry && requestId) {
          const request = messages.find(message => message.id === requestId && !message.redacted)
          const hasReply = messages.some(message => message.role === "assistant" && message.contextMessageId === requestId)
          unanswered[id] = startFailure && request && !hasReply && !activity && !state.streams[id]?.text ? { messageId: requestId, modelId, reason: startFailure } : undefined
        }
        return { unanswered, activeQueued: { ...state.activeQueued, [id]: undefined }, streams: { ...state.streams, [id]: undefined }, activities: { ...state.activities, [id]: saved ? undefined : activity } }
      })
    }
  }
  const drain = async (id: string) => {
    if (draining.has(id) || get().streams[id]) return
    draining.add(id)
    try {
      while (get().queues[id]?.entries.length && !get().queues[id]?.paused) {
        const entry = get().queues[id]!.entries[0]
        if (useConkerStore.getState().pending) { get().pauseQueue(id, "Another change is being saved. Resume when it finishes."); break }
        const succeeded = await run(id, undefined, undefined, entry)
        if (!succeeded) { get().pauseQueue(id, get().queues[id]?.reason || "The response stopped or failed. Your unsent requests are retained. Resume to retry."); break }
        queueUpdate(id, queue => ({ ...queue, entries: queue.entries.filter(item => item.id !== entry.id) }))
        const waiting = approvalWait(id)
        if (waiting) get().pauseQueue(id, waiting)
      }
    } finally { draining.delete(id) }
  }
  return {
    rails: {}, nextModels: {}, replies: {}, notices: {}, streams: {}, activities: {}, queues: {}, selectedVersions: {}, previews: {}, activeQueued: {}, unanswered: {},
    openRail: (id, view = "overview", messageId, detail) => { useArtifactWorkspace.getState().close(id); set(state => ({ rails: { ...state.rails, [id]: { open: true, view, messageId, ...detail } } })) },
    closeRail: id => set(state => ({ rails: { ...state.rails, [id]: { ...state.rails[id], open: false, view: state.rails[id]?.view || "overview" } } })),
    setNextModel: (id, modelId) => set(state => ({ nextModels: { ...state.nextModels, [id]: modelId } })),
    setReply: (id, messageId) => set(state => ({ replies: { ...state.replies, [id]: messageId } })),
    setPreview: (id, scenario) => set(state => ({ previews: { ...state.previews, [id]: scenario } })),
    selectVersion: (id, familyId, messageId) => set(state => ({ selectedVersions: { ...state.selectedVersions, [id]: { ...state.selectedVersions[id], [familyId]: messageId } } })),
    notify: (id, message) => set(state => ({ notices: { ...state.notices, [id]: message } })),
    reset: id => {
      useConkerStore.getState().setAttachments(id, [])
      useConkerStore.getState().setResearchMode(id, "off")
      controllers.get(id)?.abort()
      set(state => {
        const rails = { ...state.rails }, nextModels = { ...state.nextModels }, replies = { ...state.replies }, notices = { ...state.notices }, activities = { ...state.activities }, queues = { ...state.queues }, selectedVersions = { ...state.selectedVersions }, previews = { ...state.previews }, unanswered = { ...state.unanswered }
        delete rails[id]; delete nextModels[id]; delete replies[id]; delete notices[id]; delete activities[id]; delete queues[id]; delete selectedVersions[id]; delete previews[id]; delete unanswered[id]
        return { rails, nextModels, replies, notices, activities, queues, selectedVersions, previews, unanswered }
      })
    },
    send: async id => {
      if (get().streams[id] || get().queues[id]?.entries.length) { get().enqueue(id); return }
      if (await run(id)) await drain(id)
      else get().pauseQueue(id, "The response stopped or failed. Resume queued messages when you are ready.")
    },
    retry: async (id, messageId, modelId) => {
      get().pauseQueue(id, "A response is being retried. Resume the queue after reviewing it.")
      return run(id, messageId, modelId)
    },
    retryUnanswered: async id => {
      const request = get().unanswered[id]
      const data = useConkerStore.getState().data
      const messages = data?.conversations[id]?.messages || []
      // Only the saved latest request can resume without silently changing its boundary.
      if (!request || messages.at(-1)?.id !== request.messageId || messages.at(-1)?.redacted) {
        get().notify(id, "This unanswered request changed or has later messages. Continue from its message explicitly.")
        return false
      }
      get().pauseQueue(id, "Review the recovered reply before resuming queued messages.")
      return run(id, undefined, get().nextModels[id] || request.modelId, undefined, request.messageId)
    },
    stop: id => { get().pauseQueue(id, "Response stopped. Queued messages will wait until you resume."); controllers.get(id)?.abort(); get().notify(id, "Preview response stopped. No tools were run.") },
    steer: async id => {
      const store = useConkerStore.getState()
      const text = store.drafts[id] || ""
      const activity = get().activities[id]
      if (!text.trim() || text.length > 4000 || store.pending) return false
      if (!get().streams[id] || !activity || activity.status !== "running") { get().notify(id, "This response is no longer running. Your draft is retained; send it as a new message."); return false }
      const previous = steeringRequests.get(id)
      const request = previous?.runId === activity.id && previous.text === text ? previous : { runId: activity.id, text, requestId: crypto.randomUUID() }
      steeringRequests.set(id, request)
      const saved = await store.mutate(() => conkerClient.steerConversation(id, activity.id, request.requestId, text))
      if (!saved) { get().notify(id, useConkerStore.getState().error || "Could not steer this response. Your draft is retained."); return false }
      steeringRequests.delete(id)
      if (useConkerStore.getState().drafts[id] === text) store.setDraft(id, "")
      get().notify(id, "Steering instruction saved for this preview response. Attachments and next-message settings stay in your draft.")
      return true
    },
    enqueue: id => {
      const data = useConkerStore.getState().data
      if (!data) return
      try {
        if ((get().queues[id]?.entries.length || 0) >= MAX_QUEUED_TURNS) throw new Error(`The queue holds up to ${MAX_QUEUED_TURNS} messages. Your draft is retained.`)
        const modelId = get().nextModels[id] || data.conversations[id]?.modelId || data.modelsConfiguration.defaultModelId || ""
        const draft = useConkerStore.getState().drafts[id] || ""
        const entry = { ...captureQueuedTurn(data, id, draft, modelId, get().replies[id], useConkerStore.getState().attachmentDrafts[id], useConkerStore.getState().researchDrafts[id]), previewScenario: get().previews[id] }
        queueUpdate(id, queue => ({ ...queue, entries: [...queue.entries, entry] }))
        useConkerStore.getState().setDraft(id, "")
        useConkerStore.getState().setAttachments(id, [])
        useConkerStore.getState().setResearchMode(id, "off")
        get().setReply(id); get().setNextModel(id, ""); get().setPreview(id, ""); get().notify(id, "Message queued. It will use the model and privacy settings captured now.")
        if (!get().streams[id]) void drain(id)
      } catch (error) { get().notify(id, error instanceof Error ? error.message : "Could not queue the message.") }
    },
    editQueued: (id, entryId, text) => {
      const entry = get().queues[id]?.entries.find(item => item.id === entryId)
      if (!entry || entry.sentMessageId || get().activeQueued[id] === entryId || (!text.trim() && !entry.attachments?.length) || text.length > 4000) return false
      queueUpdate(id, queue => ({ ...queue, entries: queue.entries.map(item => item.id === entryId ? { ...item, text: text.trim() } : item) }))
      return true
    },
    reviewQueued: (id, entryId) => {
      const data = useConkerStore.getState().data
      const entry = get().queues[id]?.entries.find(item => item.id === entryId)
      if (!data || !entry || entry.sentMessageId || get().activeQueued[id] === entryId) return false
      try {
        const modelId = get().nextModels[id] || data.conversations[id]?.modelId || data.modelsConfiguration.defaultModelId || ""
        const replyTo = data.conversations[id]?.messages.some(item => item.id === entry.replyTo && !item.redacted) ? entry.replyTo : undefined
        const replacement = { ...captureQueuedTurn(data, id, entry.text, modelId, replyTo, entry.attachments, entry.researchMode), id: entry.id, previewScenario: entry.previewScenario }
        queueUpdate(id, queue => ({ ...queue, entries: queue.entries.map(item => item.id === entryId ? replacement : item) }))
        return true
      } catch (error) { get().notify(id, error instanceof Error ? error.message : "Could not update the queued message."); return false }
    },
    removeQueued: (id, entryId) => { if (get().activeQueued[id] !== entryId) queueUpdate(id, queue => ({ ...queue, entries: queue.entries.filter(item => item.id !== entryId) })) },
    pauseQueue: (id, reason = "Queue paused. Resume when you are ready.") => queueUpdate(id, queue => ({ ...queue, paused: true, reason })),
    resumeQueue: async id => {
      const data = useConkerStore.getState().data
      const queue = get().queues[id]
      if (!data || !queue?.entries.length) return
      const reason = queue.entries.map(entry => validateQueuedTurn(entry, data)).find(Boolean) || approvalWait(id)
      if (reason) { get().pauseQueue(id, reason); return }
      queueUpdate(id, value => ({ ...value, paused: false, reason: undefined }))
      await drain(id)
    },
  }
})

// Only prune after client mutation + snapshot refresh has settled. A fork or queue
// may share an attachment with its original message and must keep its preview.
function pruneAttachmentPreviews() {
  const state = useConkerStore.getState()
  if (state.pending) return
  const ids = new Set<string>()
  for (const files of Object.values(state.attachmentDrafts)) for (const file of files) ids.add(file.id)
  for (const conversation of Object.values(state.data?.conversations || {})) for (const message of conversation.messages) {
    if (!message.redacted) for (const file of message.attachments || []) ids.add(file.id)
  }
  for (const queue of Object.values(useConversationWorkspace.getState().queues)) for (const entry of queue?.entries || []) {
    if (!entry.sentMessageId) for (const file of entry.attachments || []) ids.add(file.id)
  }
  pruneLocalAttachments(ids)
}
useConkerStore.subscribe(pruneAttachmentPreviews)
useConversationWorkspace.subscribe(pruneAttachmentPreviews)

// Once authority changes, restoring it later never silently restarts a queue.
useConkerStore.subscribe((state, previous) => {
  if (!state.data || state.data === previous.data) return
  for (const [id, queue] of Object.entries(useConversationWorkspace.getState().queues)) {
    if (!queue?.entries.length || queue.paused) continue
    const reason = queue.entries.map(entry => validateQueuedTurn(entry, state.data!)).find(Boolean)
    if (reason) useConversationWorkspace.getState().pauseQueue(id, reason)
  }
})
