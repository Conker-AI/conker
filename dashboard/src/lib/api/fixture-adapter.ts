import { agents } from "./fixtures/agents"
import { sessions, plan, planningIntent } from "./fixtures/chat"
import { tickets } from "./fixtures/inbox"
import { jobs } from "./fixtures/jobs"
import { entries } from "./fixtures/journal"
import { memories, memorySearch } from "./fixtures/memory"
import { services, vitals, system } from "./fixtures/system"
import { tools } from "./fixtures/tools"
import { threads } from "./fixtures/threads"
import { connectionConfig } from "./config"
import type { ConkerClient, Snapshot, AuthResult } from "./client"
import { createConversations, createConversationState } from "./conversation-fixtures"
import { createModelsConfiguration, getAvailableModels, validateModelsConfiguration } from "./model-catalogue"
import type { ConversationMessage } from "./conversation-types"

function aborted() { return new DOMException("Reply stopped.", "AbortError") }

function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(aborted()); return }
    const finish = () => { signal?.removeEventListener("abort", stop); resolve() }
    const timer = setTimeout(finish, ms)
    const stop = () => { clearTimeout(timer); signal?.removeEventListener("abort", stop); reject(aborted()) }
    signal?.addEventListener("abort", stop, { once: true })
  })
}

/** Explicit fixture transport: mutable per adapter instance, reset on reload, no network. */
export function createFixtureClient(): ConkerClient {
  const state: Snapshot = structuredClone({
    companionSessionId: "companion",
    dailyBriefing: {
      date: "2026-09-12",
      timezone: "Asia/Jerusalem",
      mode: "sample",
      summary: "Your maths exam is on Monday. Two short study blocks are proposed for Sunday, and judo is Tuesday and Thursday at 18:30. The study plan is still a proposal; your calendar has not changed.",
      news: { status: "unavailable", updatedAt: null, items: [] },
    },
    agents,
    sessions: [{
      id: "companion", title: "Your companion", agent: "Conker",
      subtitle: "Your daily briefing and a place to get things done",
      updated: "Ready when you are", minutesAgo: 0, pinned: false, mode: "companion",
    }, ...sessions],
    plan, planningIntent, tickets, jobs, entries, memories, memorySearch, services, vitals, system, tools,
    profile: {
      name: "Conker", speakingPreset: "warm", speakingStyle: "Warm, direct, and concise. A little dry humour when it fits.",
      personality: "Curious and steady. Help me make room for school, judo, and building things. Ask before making assumptions. Be honest when you don’t know.",
      renderer: "static", portrait: "/conker.png", face: "sprout", tone: "green", mood: "Thoughtful · ready to listen",
      emotions: { neutral: "default", happy: "portrait", thinking: "portrait", concerned: "default", celebrating: "portrait" },
    },
    threads, messages: {}, conversations: {}, modelsConfiguration: createModelsConfiguration(),
    replyRequests: [], auth: { status: "unconfigured", ownerName: "Alexey" },
    connections: connectionConfig.read(),
    terminal: { prompt: "alexey@conker", context: [["Repository", "companion"], ["Branch", "feat/dashboard"], ["Working tree", "Unknown · no filesystem probe"], ["Last commit", "Dashboard shell scaffold · fixture"]] },
  })
  state.conversations = createConversations(state.sessions, state.threads)
  const streaming = new Set<string>()
  const findConversation = (id: string) => {
    const session = state.sessions.find(item => item.id === id)
    const conversation = session && state.conversations[id]
    if (!session || !conversation) throw new Error("Conversation not found.")
    return { session, conversation }
  }
  const idle = (id: string) => {
    if (streaming.has(id)) throw new Error("Stop the current reply before changing this conversation.")
  }
  const availableModel = (id: string | null) => {
    if (!id || !getAvailableModels(state.modelsConfiguration).some(model => model.id === id)) {
      throw new Error("Choose an enabled model from Settings.")
    }
    return id
  }
  const touch = (id: string) => {
    const { session } = findConversation(id)
    session.updated = "Just now"
    session.minutesAgo = 0
  }
  const unwired: AuthResult = { wired: false, message: "Authentication is not connected. No password was stored and this dashboard is not protected." }
  return {
    mode: "fixture",
    async load() { return structuredClone(state) },
    async saveCharacter(profile) {
      if (!profile.name.trim()) throw new Error("Give your companion a name.")
      state.profile = structuredClone({ ...profile, name: profile.name.trim() })
      return structuredClone(state.profile)
    },
    async sendMessage(id, text, options) {
      const { session, conversation } = findConversation(id)
      idle(id)
      if (session.archived) throw new Error("Restore this conversation before sending a message.")
      if (!text.trim() || text.length > 4000) throw new Error("Use 1–4,000 characters for a message.")
      if (options?.replyTo && !conversation.messages.some(message => message.id === options.replyTo && !message.redacted)) {
        throw new Error("The message you are replying to is no longer available.")
      }
      const message = { id: crypto.randomUUID(), text: text.trim(), createdAt: new Date().toISOString() }
      state.messages[id] = [...(state.messages[id] || []), message]
      conversation.messages.push({ ...message, role: "user", status: "complete", ...(options?.replyTo ? { replyTo: options.replyTo } : {}) })
      conversation.usage.inputTokens += Math.ceil(message.text.length / 4)
      touch(id)
      return structuredClone(message)
    },
    async updateConversation(id, update) {
      const { session, conversation } = findConversation(id)
      if (update.title !== undefined && (typeof update.title !== "string" || !update.title.trim() || update.title.trim().length > 120)) {
        throw new Error("Use 1–120 characters for a conversation title.")
      }
      for (const key of ["pinned", "archived", "incognito"] as const) {
        if (update[key] !== undefined && typeof update[key] !== "boolean") throw new Error("Use a valid conversation setting.")
      }
      if (update.modelId !== undefined && update.modelId !== null) availableModel(update.modelId)
      if (update.archived) idle(id)
      if (update.title !== undefined) session.title = update.title.trim()
      if (update.pinned !== undefined) session.pinned = update.pinned
      if (update.archived !== undefined) session.archived = update.archived
      if (update.modelId !== undefined) conversation.modelId = update.modelId
      if (update.incognito !== undefined) {
        conversation.incognito = update.incognito
        conversation.memory.scope = update.incognito ? "none" : "conversation"
        conversation.memory.sources = []
      }
      return structuredClone(session)
    },
    async deleteConversation(id) {
      findConversation(id)
      idle(id)
      delete state.messages[id]
      delete state.threads[id]
      state.replyRequests = state.replyRequests.filter(item => item !== id)
      if (id === state.companionSessionId) {
        state.conversations[id] = createConversationState()
        const { session } = findConversation(id)
        session.archived = false
        touch(id)
      } else {
        state.sessions = state.sessions.filter(item => item.id !== id)
        delete state.conversations[id]
        // Existing forks remain usable and retain the source identifier as provenance.
      }
    },
    async updateMessage(id, messageId, update) {
      const { conversation } = findConversation(id)
      idle(id)
      const message = conversation.messages.find(item => item.id === messageId)
      if (!message) throw new Error("Message not found.")
      if (message.redacted) throw new Error("A redacted message cannot be restored or changed.")
      if (update.text !== undefined && (typeof update.text !== "string" || !update.text.trim() || update.text.length > 4000)) {
        throw new Error("Use 1–4,000 characters for a message.")
      }
      for (const key of ["pinned", "redacted"] as const) {
        if (update[key] !== undefined && typeof update[key] !== "boolean") throw new Error("Use a valid message setting.")
      }
      if (update.text !== undefined) { message.text = update.text.trim(); message.edited = true; message.scenario = false }
      if (update.pinned !== undefined) message.pinned = update.pinned
      if (update.redacted) {
        message.text = ""
        message.redacted = true
        message.pinned = false
        message.scenario = false
        delete message.source
      }
      // Legacy consumers must not reveal text after an edit or redaction.
      const local = state.messages[id]?.find(item => item.id === messageId)
      if (local) local.text = message.text
      const thread = state.threads[id]
      const original = thread?.messages.find(item => item.id === messageId)
      if (original) original.text = message.text
      if (thread && messageId === `${id}-assistant`) thread.reply = message.text
      return structuredClone(message)
    },
    async forkConversation(id, messageId) {
      const { session, conversation } = findConversation(id)
      idle(id)
      const index = conversation.messages.findIndex(message => message.id === messageId)
      if (index < 0 || conversation.messages[index].redacted) throw new Error("Choose an available message to fork from.")
      const forkId = crypto.randomUUID()
      const fork = {
        ...structuredClone(session), id: forkId,
        title: `Fork · ${session.title}`.slice(0, 120), subtitle: `Forked from ${session.title}`,
        updated: "Just now", minutesAgo: 0, pinned: false, archived: false,
        mode: session.mode === "companion" ? "project" as const : session.mode,
      }
      const next = createConversationState()
      next.parentSessionId = id
      next.forkMessageId = messageId
      next.incognito = conversation.incognito
      next.modelId = conversation.modelId
      next.memory.scope = conversation.incognito ? "none" : "conversation"
      next.files = structuredClone(conversation.files)
      const path = id === state.companionSessionId ? "/companion" : `/chat/${id}`
      next.messages = structuredClone(conversation.messages.slice(0, index + 1)).map(message => ({
        ...message, scenario: false,
        ...(!message.redacted ? { source: { id: message.id, label: `From ${session.title}`, href: `${path}#message-${message.id}` } } : {}),
      }))
      state.sessions.unshift(fork)
      state.conversations[forkId] = next
      state.messages[forkId] = next.messages.filter(message => message.role === "user").map(({ id, text, createdAt }) => ({ id, text, createdAt }))
      return structuredClone(fork)
    },
    async streamReply(id, options, onChunk) {
      const { session, conversation } = findConversation(id)
      idle(id)
      if (session.archived) throw new Error("Restore this conversation before requesting a reply.")
      const modelId = availableModel(options.modelId || conversation.modelId || state.modelsConfiguration.defaultModelId)
      if (options.retryMessageId && !conversation.messages.some(message => message.id === options.retryMessageId && message.role === "assistant" && !message.redacted)) {
        throw new Error("Choose an available companion message to retry.")
      }
      if (!conversation.messages.some(message => message.role === "user" && !message.redacted)) throw new Error("Send a message before asking for a reply.")
      const reply: ConversationMessage = {
        id: crypto.randomUUID(), role: "assistant", text: "", createdAt: new Date().toISOString(),
        modelId, status: "complete", ...(options.retryMessageId ? { retryOf: options.retryMessageId } : {}),
      }
      streaming.add(id)
      const saveReply = () => {
        conversation.messages.push(reply)
        conversation.usage.outputTokens += Math.ceil(reply.text.length / 4)
        touch(id)
      }
      try {
        await pause(450, options.signal)
        const text = "Simulated reply: Your message is saved. A connected model will respond here. No tools have run."
        for (const chunk of text.match(/.{1,6}/g) || []) {
          await pause(150, options.signal)
          reply.text += chunk
          onChunk(chunk)
          if (options.signal?.aborted) throw aborted()
        }
        saveReply()
        return structuredClone(reply)
      } catch (error) {
        if (reply.text) {
          reply.status = "stopped"
          saveReply()
          if (options.signal?.aborted) return structuredClone(reply)
        }
        throw error
      } finally { streaming.delete(id) }
    },
    async saveModelsConfiguration(value) {
      const error = validateModelsConfiguration(value)
      if (error) throw new Error(error)
      state.modelsConfiguration = structuredClone(value)
      const available = new Set(getAvailableModels(state.modelsConfiguration).map(model => model.id))
      for (const conversation of Object.values(state.conversations)) {
        if (conversation.modelId && !available.has(conversation.modelId)) conversation.modelId = null
      }
      return structuredClone(state.modelsConfiguration)
    },
    async requestReply(id) {
      if (!state.sessions.some(session => session.id === id)) throw new Error("Conversation not found.")
      if (!state.replyRequests.includes(id)) state.replyRequests.push(id)
    },
    async decideTicket(id, status) {
      const ticket = state.tickets.find(item => item.id === id)
      if (!ticket || ticket.status !== "Needs you") throw new Error("This request is no longer awaiting a decision.")
      const allowed = ticket.effect === "Proposal" ? ["Accepted", "Dismissed"] : ["Approved once", "Denied"]
      if (!allowed.includes(status)) throw new Error("This decision does not apply to the request.")
      ticket.status = status
      return structuredClone(ticket)
    },
    async updateJob(id, action) {
      const job = state.jobs.find(item => item.id === id)
      if (!job) throw new Error("Job not found.")
      if (action === "toggle") job.status = job.status === "Paused" ? "Scheduled" : "Paused"
      else { job.runs++; job.lastRun = `Just now · simulated receipt #${job.runs}` }
      return structuredClone(job)
    },
    async saveConnections(value) {
      connectionConfig.write(value)
      state.connections = connectionConfig.read()
      return structuredClone(state.connections)
    },
    async setup(input) {
      if (input.password.length < 12) throw new Error("Use at least 12 characters.")
      connectionConfig.write(input.connections)
      state.connections = connectionConfig.read()
      state.auth.ownerName = input.ownerName.trim() || "Owner"
      return unwired // Password is deliberately discarded. Never claim setup secured the app.
    },
    async login() { return unwired },
    async enterPreview(ownerName) {
      state.auth = { status: "preview", ownerName: ownerName?.trim() || state.auth.ownerName }
      return structuredClone(state.auth)
    },
  }
}
