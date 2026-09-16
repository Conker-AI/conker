import { agents } from "./fixtures/agents"
import { sessions, plan, planningIntent } from "./fixtures/chat"
import { tickets } from "./fixtures/inbox"
import { jobs } from "./fixtures/jobs"
import { entries } from "./fixtures/journal"
import { memories, memorySearch } from "./fixtures/memory"
import { services, vitals, system } from "./fixtures/system"
import { tools } from "./fixtures/tools"
import { threads } from "./fixtures/threads"
import { terminal } from "./fixtures/terminal"
import { files } from "./fixtures/files"
import { connectionConfig } from "./config"
import type { ConkerClient, Snapshot, AuthResult } from "./client"
import { createConversations, createConversationState } from "./conversation-fixtures"
import { createModelsConfiguration, getAvailableModels, validateModelsConfiguration } from "./model-catalogue"
import type { ConversationMessage } from "./conversation-types"
import { unavailableVoiceInput } from "../voice/types"
import { describeJobTiming, normalizeJobInput } from "./job-configuration"

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
    terminal,
    files,
  })
  state.conversations = createConversations(state.sessions, state.threads, state.agents)
  const streaming = new Set<string>()
  const runningJobs = new Set<string>()
  const findJob = (id: string) => {
    const job = state.jobs.find(item => item.id === id)
    if (!job) throw new Error("Job not found. Refresh the list and try again.")
    if (runningJobs.has(id)) throw new Error("Wait for this preview run to finish.")
    return job
  }
  const findConversation = (id: string) => {
    const session = state.sessions.find(item => item.id === id)
    const conversation = session && state.conversations[id]
    if (!session || !conversation) throw new Error("Conversation not found.")
    return { session, conversation }
  }
  const idle = (id: string) => {
    if (streaming.has(id)) throw new Error("Stop the current reply before changing this conversation.")
  }
  const findAgent = (id: string) => {
    const agent = state.agents.find(agent => agent.id === id)
    if (!agent) throw new Error("Choose an available agent.")
    return agent
  }
  const agentName = (id: string) => { const agent = findAgent(id); return agent.kind === "companion" ? state.profile.name : agent.name }
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
    state.sessions = [session, ...state.sessions.filter(item => item.id !== id)]
  }
  const unwired: AuthResult = { wired: false, message: "Authentication is not connected. No password was stored and this dashboard is not protected." }
  return {
    mode: "fixture",
    voiceInput: unavailableVoiceInput,
    async load() { return structuredClone(state) },
    async saveCharacter(profile) {
      if (!profile.name.trim()) throw new Error("Give your companion a name.")
      state.profile = structuredClone({ ...profile, name: profile.name.trim() })
      return structuredClone(state.profile)
    },
    async createConversation(agentId) {
      const agent = findAgent(agentId)
      const existing = state.sessions.find(session => session.isDraft && session.agentId === agent.id && !session.archived)
      if (existing) return structuredClone(existing)
      const session = {
        id: crypto.randomUUID(), title: "New chat", agent: agent.name, agentId: agent.id,
        subtitle: "No messages yet", updated: "Just now", minutesAgo: 0,
        pinned: false, isDraft: true, mode: "project" as const,
      }
      state.sessions.unshift(session)
      state.conversations[session.id] = createConversationState(agent.id)
      return structuredClone(session)
    },
    async handoffConversation(id, agentId) {
      const { session, conversation } = findConversation(id)
      idle(id)
      const agent = findAgent(agentId)
      if (id === state.companionSessionId) throw new Error("Your companion keeps its identity. Start a separate chat with this agent.")
      if (session.archived) throw new Error("Restore this conversation before changing its agent.")
      if (session.agentId === agent.id) return structuredClone(session)
      const previous = findAgent(session.agentId || conversation.initialAgentId)
      const last = conversation.messages.at(-1)
      if (last) conversation.handoffs.push({ id: crypto.randomUUID(), afterMessageId: last.id, fromAgentId: previous.id, toAgentId: agent.id, fromName: agentName(previous.id), toName: agentName(agent.id), createdAt: new Date().toISOString() })
      else conversation.initialAgentId = agent.id
      session.agent = agent.name
      session.agentId = agent.id
      conversation.grants = []
      conversation.autonomy = { level: "ask", detail: "Ask before actions. This agent has no live execution grants in the preview." }
      touch(id)
      return structuredClone(session)
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
      if (session.isDraft) {
        session.isDraft = false
        if (session.title === "New chat") session.title = message.text.replace(/\s+/g, " ").slice(0, 64)
      }
      session.subtitle = message.text.replace(/\s+/g, " ").slice(0, 120)
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
      if (update.privacy !== undefined && (!update.privacy || typeof update.privacy !== "object" || Object.entries(update.privacy).some(([key, value]) => !["memoryDisabled", "harnessDisabled"].includes(key) || typeof value !== "boolean"))) {
        throw new Error("Use valid conversation privacy settings.")
      }
      if (update.modelId !== undefined && update.modelId !== null) availableModel(update.modelId)
      if (update.archived) idle(id)
      if (update.title !== undefined) session.title = update.title.trim()
      if (update.pinned !== undefined) session.pinned = update.pinned
      if (update.archived !== undefined) session.archived = update.archived
      if (update.modelId !== undefined) conversation.modelId = update.modelId
      if (update.incognito !== undefined || update.privacy !== undefined) {
        const previousMemory = conversation.privacy.memoryDisabled
        // Preserve the legacy shortcut while allowing each exclusion independently.
        if (update.incognito !== undefined) conversation.privacy = { memoryDisabled: update.incognito, harnessDisabled: update.incognito }
        Object.assign(conversation.privacy, update.privacy)
        conversation.incognito = conversation.privacy.memoryDisabled || conversation.privacy.harnessDisabled
        if (previousMemory !== conversation.privacy.memoryDisabled) {
          conversation.memory.scope = conversation.privacy.memoryDisabled ? "none" : "conversation"
          conversation.memory.sources = []
        }
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
        state.conversations[id] = createConversationState(state.sessions.find(session => session.id === id)?.agentId)
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
      if (update.rating !== undefined && (message.role !== "assistant" || !["up", "down", null].includes(update.rating))) {
        throw new Error("Choose a valid response rating.")
      }
      if (update.rating !== undefined) message.rating = update.rating
      if (update.text !== undefined) { message.text = update.text.trim(); message.edited = true; message.scenario = false; delete message.rating }
      if (update.pinned !== undefined) message.pinned = update.pinned
      if (update.redacted) {
        message.text = ""
        message.redacted = true
        message.pinned = false
        message.scenario = false
        delete message.rating
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
      next.privacy = structuredClone(conversation.privacy)
      next.modelId = conversation.modelId
      next.memory.scope = conversation.privacy.memoryDisabled ? "none" : "conversation"
      next.files = structuredClone(conversation.files)
      const path = id === state.companionSessionId ? "/companion" : `/chat/${id}`
      next.messages = structuredClone(conversation.messages.slice(0, index + 1)).map(message => ({
        ...message, scenario: false,
        ...(!message.redacted ? { source: { id: message.id, label: `From ${session.title}`, href: `${path}#${encodeURIComponent(message.id)}` } } : {}),
      }))
      // A handoff after the selected message is outside a fork ending at that message.
      const included = new Set(next.messages.slice(0, -1).map(message => message.id))
      next.handoffs = structuredClone(conversation.handoffs.filter(event => included.has(event.afterMessageId)))
      next.initialAgentId = conversation.initialAgentId
      const lead = findAgent(next.handoffs.at(-1)?.toAgentId || next.initialAgentId)
      fork.agentId = lead.id
      fork.agent = lead.name
      fork.isDraft = false
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
        agentId: session.agentId, agentName: agentName(session.agentId || conversation.initialAgentId),
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
      const job = findJob(id)
      if (action === "toggle") job.status = job.status === "Paused" ? "Scheduled" : "Paused"
      else {
        runningJobs.add(id)
        try {
          await pause(450)
          job.runs++
          job.lastRun = `Just now · simulated receipt #${job.runs}`
          job.history.unshift({ id: crypto.randomUUID(), startedAt: new Date().toISOString(), status: "Completed", source: "preview", summary: "Preview run completed. No agent, tool or server command was executed." })
        } finally { runningJobs.delete(id) }
      }
      return structuredClone(job)
    },
    async createJob(input) {
      const { enabled, ...config } = normalizeJobInput(input)
      findAgent(config.agentId)
      const job = { ...config, id: crypto.randomUUID(), purpose: config.instructions.split("\n")[0].slice(0, 160), schedule: describeJobTiming(config.timing), status: enabled ? "Scheduled" as const : "Paused" as const, lastRun: "Never run", nextRun: "Awaiting scheduler", runs: 0, history: [] }
      state.jobs.unshift(job)
      return structuredClone(job)
    },
    async saveJob(id, input) {
      const job = findJob(id)
      const { enabled, ...config } = normalizeJobInput(input)
      findAgent(config.agentId)
      Object.assign(job, config, { purpose: config.instructions.split("\n")[0].slice(0, 160), schedule: describeJobTiming(config.timing), status: enabled ? "Scheduled" : "Paused", nextRun: "Awaiting scheduler" })
      return structuredClone(job)
    },
    async duplicateJob(id) {
      const original = findJob(id)
      const job = { ...structuredClone(original), id: crypto.randomUUID(), name: `${original.name.slice(0, 73)} (copy)`, status: "Paused" as const, lastRun: "Never run", nextRun: "Awaiting scheduler", runs: 0, history: [] }
      state.jobs.unshift(job)
      return structuredClone(job)
    },
    async deleteJob(id) {
      findJob(id)
      state.jobs = state.jobs.filter(job => job.id !== id)
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
