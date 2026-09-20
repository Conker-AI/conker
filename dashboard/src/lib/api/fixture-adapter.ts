import { agents } from "./fixtures/agents"
import { sessions, plan, planningIntent } from "./fixtures/chat"
import { tickets } from "./fixtures/inbox"
import { jobs } from "./fixtures/jobs"
import { entries } from "./fixtures/journal"
import { memories, memorySearch } from "./fixtures/memory"
import { services, vitals, system } from "./fixtures/system"
import { tools } from "./fixtures/tools"
import { createToolWorkspacePreview } from "./tool-workspace-preview"
import { threads } from "./fixtures/threads"
import { terminal } from "./fixtures/terminal"
import { files } from "./fixtures/files"
import { connectionConfig } from "./config"
import type { ConkerClient, Snapshot, AuthResult } from "./client"
import { createConversations, createConversationState } from "./conversation-fixtures"
import { createModelsConfiguration, getAvailableModels, validateModelsConfiguration } from "./model-catalogue"
import type { ConversationMessage, ConversationRun } from "./conversation-types"
import { unavailableVoiceInput } from "../voice/types"
import { describeJobTiming, normalizeJobInput } from "./job-configuration"
import { activeConversationMessages, contextBeforeMessage, hasDownstreamMessages, messagesForFork, responseFamilyId } from "../conversation-continuity"
import { activityScenarios, createActivityScenario, isActivityScenarioName } from "./activity-fixtures"
import { mergeActivityRun } from "../conversation-activity"
import { richAnswerFixture } from "./rich-answer-fixture"
import { normalizeMemoryInput } from "../memory-explorer"

import { createCharacterStudio } from "./character-defaults"
import { createCallFixture } from "./call-fixture"
import { agentReferences, normalizeAgentInput } from "./agent-config"
import { createTaskPreviewClient } from "./task-preview"
import { projectActivity, toolActivityRunIds } from "./activity-projection"
import type { ActivityRunRecord } from "./task-types"

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
    tasks: [],
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
      studio: createCharacterStudio(),
      name: "Conker", speakingPreset: "custom", speakingStyle: "Warm, direct, and concise. A little dry humour when it fits.",
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
  state.conversations[state.companionSessionId].presentationMode = state.profile.studio?.modes.default || "character"
  const streaming = new Set<string>()
  const runningJobs = new Set<string>()
  const toolWorkspace = createToolWorkspacePreview(tools, { retainRun: run => {
    const ids = new Set(toolActivityRunIds(run))
    return state.tasks.some(task => task.runIds.some(id => ids.has(id)))
  } })
  let taskRunSources: ActivityRunRecord[] = []
  const taskClient = createTaskPreviewClient({
    getSnapshot: () => ({ tasks: state.tasks, agents: state.agents, sessions: state.sessions, runs: taskRunSources }),
    setTasks: tasks => { state.tasks = tasks },
  })
  const refreshTaskRuns = async () => {
    taskRunSources = projectActivity({ ...state, tools: await toolWorkspace.list(), journalProvenance: "sample", fixture: true }).runs
  }
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
  const availableAgent = (id: string) => {
    const agent = findAgent(id)
    if (agent.archivedAt) throw new Error("Restore this agent before starting work, or choose another agent.")
    return agent
  }
  const specialist = (id: string) => {
    const agent = findAgent(id)
    if (agent.kind === "companion") throw new Error("Your Companion keeps its identity. Use Character Studio to edit it.")
    return agent
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
    state.sessions = [session, ...state.sessions.filter(item => item.id !== id)]
  }
  const unwired: AuthResult = { wired: false, message: "Authentication is not connected. No password was stored and this dashboard is not protected." }
  return {
    mode: "fixture",
    toolWorkspace: {
      ...toolWorkspace,
      async remove(id) {
        await refreshTaskRuns()
        const runIds = new Set(taskRunSources.filter(run => run.source.kind === "tool" && run.source.toolId === id).map(run => run.id))
        let previousSize = -1
        while (previousSize !== runIds.size) {
          previousSize = runIds.size
          taskRunSources.filter(run => run.parentRunId && runIds.has(run.parentRunId)).forEach(run => runIds.add(run.id))
        }
        if (state.tasks.some(task => task.runIds.some(runId => runIds.has(runId)))) throw new Error("This tool has runs linked to task history. Keep it to preserve their evidence.")
        return toolWorkspace.remove(id)
      },
    },
    tasks: {
      ...taskClient,
      async create(input) { await refreshTaskRuns(); return taskClient.create(input) },
      async update(id, input, revision) { await refreshTaskRuns(); return taskClient.update(id, input, revision) },
    },
    calls: createCallFixture(() => state),
    voiceInput: unavailableVoiceInput,
    async load() { return structuredClone(state) },
    async createAgent(input) {
      const configuration = normalizeAgentInput(input, state)
      const model = state.modelsConfiguration.models.find(item => item.id === configuration.modelId)
      const agent = { id: `agent-${crypto.randomUUID()}`, name: configuration.name, role: configuration.role, kind: "agent" as const, model: model?.name || "Default route", grants: 0, cost: "Not metered", status: "idle" as const, configuration, version: 1 }
      state.agents.push(agent)
      return structuredClone(agent)
    },
    async saveAgent(id, input) {
      const agent = specialist(id)
      if (agent.archivedAt) throw new Error("Restore this agent before editing it.")
      if (state.sessions.some(session => session.agentId === id && streaming.has(session.id)) || state.jobs.some(job => job.agentId === id && runningJobs.has(job.id))) throw new Error("Wait for this agent’s preview work to finish before editing it.")
      const configuration = normalizeAgentInput(input, state, id)
      if (agent.name !== configuration.name) agent.historicalNames = [...new Set([...(agent.historicalNames || []), agent.name])]
      Object.assign(agent, { name: configuration.name, role: configuration.role, configuration, model: state.modelsConfiguration.models.find(model => model.id === configuration.modelId)?.name || "Default route", version: (agent.version || 0) + 1 })
      for (const session of state.sessions) if (session.agentId === id) session.agent = agent.name
      return structuredClone(agent)
    },
    async archiveAgent(id, archived) {
      const agent = specialist(id)
      if (typeof archived !== "boolean") throw new Error("Choose archive or restore.")
      if (archived && state.tasks.some(task => task.agentId === id && !["completed", "cancelled"].includes(task.status))) throw new Error("Reassign or resolve this agent’s tasks before archiving it.")
      if (archived && (state.sessions.some(session => session.agentId === id && streaming.has(session.id)) || state.jobs.some(job => job.agentId === id && (job.status === "Scheduled" || runningJobs.has(job.id))))) throw new Error("Pause this agent’s jobs and finish its active replies before archiving it.")
      if (archived) agent.archivedAt = new Date().toISOString()
      else delete agent.archivedAt
      return structuredClone(agent)
    },
    async deleteAgent(id) {
      specialist(id)
      const references = agentReferences(state, id)
      if (references.length) throw new Error(`This agent is referenced by ${references.join(", ")}. Archive it to preserve history.`)
      state.agents = state.agents.filter(agent => agent.id !== id)
    },
    async createMemory(input) {
      const value = normalizeMemoryInput(input)
      const id = `note-${crypto.randomUUID()}`
      const memory = { ...value, id, origin: "manual" as const, confidence: "Unreviewed", age: "Just now", provenance: "Manually added in this preview", source: `/memory#${id}`, updatedAt: new Date().toISOString() }
      state.memories.unshift(memory)
      return structuredClone(memory)
    },
    async saveMemory(id, input) {
      const value = normalizeMemoryInput(input)
      const memory = state.memories.find(item => item.id === id)
      if (!memory) throw new Error("Memory not found. Refresh and try again.")
      memory.originalText ??= memory.text
      Object.assign(memory, value, { updatedAt: new Date().toISOString(), age: "Just now" })
      return structuredClone(memory)
    },
    async deleteMemory(id) {
      if (!state.memories.some(item => item.id === id)) throw new Error("Memory not found.")
      if (state.agents.some(agent => agent.configuration?.memory.memoryIds.includes(id))) throw new Error("Remove this memory from agent configurations before deleting it.")
      state.memories = state.memories.filter(item => item.id !== id)
    },
    async saveCharacter(profile) {
      const { validateCharacter } = await import("./character")
      state.profile = structuredClone(validateCharacter(profile))
      return structuredClone(state.profile)
    },
    async previewCharacter(profile, mode) { const { previewCharacter } = await import("./character"); return previewCharacter(profile, mode) },
    async createConversation(agentId) {
      const agent = availableAgent(agentId)
      const existing = state.sessions.find(session => session.isDraft && session.agentId === agent.id && !session.archived)
      if (existing) return structuredClone(existing)
      const session = {
        id: crypto.randomUUID(), title: "New chat", agent: agent.name, agentId: agent.id,
        subtitle: "No messages yet", updated: "Just now", minutesAgo: 0,
        pinned: false, isDraft: true, mode: "project" as const,
      }
      state.sessions.unshift(session)
      state.conversations[session.id] = createConversationState(agent.id)
      state.conversations[session.id].modelId = agent.configuration?.modelId || null
      if (agent.configuration) state.conversations[session.id].memory = { scope: agent.configuration.memory.scope, sources: agent.configuration.memory.memoryIds.map(id => ({ id, label: state.memories.find(memory => memory.id === id)?.title || id })), writeEnabled: false }
      state.conversations[session.id].presentationMode = agent.kind === "companion" ? state.profile.studio?.modes.default || "character" : "focus"
      return structuredClone(session)
    },
    async handoffConversation(id, agentId) {
      const { session, conversation } = findConversation(id)
      idle(id)
      const agent = availableAgent(agentId)
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
      const target = findConversation(id)
      availableAgent(target.session.agentId || target.conversation.initialAgentId)
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
      const contextMessageIds = activeConversationMessages(conversation.messages).map(item => item.id)
      conversation.messages.push({ ...message, role: "user", status: "complete", contextMessageIds, ...(options?.replyTo ? { replyTo: options.replyTo } : {}) })
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
      if (update.presentationMode !== undefined) {
        idle(id)
        if (!["focus", "character"].includes(update.presentationMode)) throw new Error("Choose Focus or Character mode.")
      }
      if (update.modelId !== undefined && update.modelId !== null) availableModel(update.modelId)
      if (update.archived) idle(id)
      if (update.title !== undefined) session.title = update.title.trim()
      if (update.pinned !== undefined) session.pinned = update.pinned
      if (update.archived !== undefined) session.archived = update.archived
      if (update.modelId !== undefined) conversation.modelId = update.modelId
      if (update.presentationMode !== undefined) conversation.presentationMode = update.presentationMode
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
      if (state.tasks.some(task => task.sessionId === id)) throw new Error("This conversation is linked to task history. Archive it to preserve those references.")
      const conversationRuns = projectActivity({ ...state, tools: [], journalProvenance: "sample" }).runs.filter(run => run.source.kind === "conversation" && run.source.sessionId === id)
      if (state.tasks.some(task => task.runIds.some(runId => conversationRuns.some(run => run.id === runId)))) throw new Error("This conversation contains runs linked to task history. Archive it to preserve their evidence.")
      delete state.messages[id]
      delete state.threads[id]
      state.replyRequests = state.replyRequests.filter(item => item !== id)
      if (id === state.companionSessionId) {
        state.conversations[id] = createConversationState(state.sessions.find(session => session.id === id)?.agentId)
        state.conversations[id].presentationMode = state.profile.studio?.modes.default || "character"
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
      if (update.text !== undefined && hasDownstreamMessages(conversation.messages, messageId)) {
        throw new Error("Fork from this message before editing it, so later replies keep their original context.")
      }
      for (const key of ["pinned", "redacted"] as const) {
        if (update[key] !== undefined && typeof update[key] !== "boolean") throw new Error("Use a valid message setting.")
      }
      if (update.rating !== undefined && (message.role !== "assistant" || !["up", "down", null].includes(update.rating))) {
        throw new Error("Choose a valid response rating.")
      }
      if (update.rating !== undefined) message.rating = update.rating
      if (update.text !== undefined) { message.text = update.text.trim(); message.edited = true; message.scenario = false; delete message.rating; delete message.activity; delete message.citations; delete message.source }
      if (update.pinned !== undefined) message.pinned = update.pinned
      if (update.redacted) {
        message.text = ""
        message.redacted = true
        message.pinned = false
        message.scenario = false
        delete message.rating
        delete message.source
        delete message.activity
        delete message.citations
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
      next.presentationMode = conversation.presentationMode
      next.parentSessionId = id
      next.forkMessageId = messageId
      next.incognito = conversation.incognito
      next.privacy = structuredClone(conversation.privacy)
      next.modelId = conversation.modelId
      next.memory.scope = conversation.privacy.memoryDisabled ? "none" : "conversation"
      next.files = structuredClone(conversation.files)
      const path = id === state.companionSessionId ? "/companion" : `/chat/${id}`
      next.messages = structuredClone(messagesForFork(conversation.messages, messageId)).map(message => ({
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
      availableAgent(session.agentId || conversation.initialAgentId)
      if (session.archived) throw new Error("Restore this conversation before requesting a reply.")
      const modelId = availableModel(options.modelId || conversation.modelId || state.modelsConfiguration.defaultModelId)
      const retryTarget = options.retryMessageId ? conversation.messages.find(message => message.id === options.retryMessageId && message.role === "assistant" && !message.redacted) : undefined
      if (options.retryMessageId && !retryTarget) {
        throw new Error("Choose an available companion message to retry.")
      }
      const context = retryTarget ? contextBeforeMessage(conversation.messages, retryTarget.id) : activeConversationMessages(conversation.messages)
      const prompt = [...context].reverse().find(message => message.role === "user" && !message.redacted)
      if (!prompt) throw new Error("Send a message before asking for a reply.")
      const replyId = crypto.randomUUID()
      const reply: ConversationMessage = {
        id: replyId, role: "assistant", text: "", createdAt: new Date().toISOString(),
        agentId: retryTarget?.agentId || session.agentId, agentName: retryTarget?.agentName || agentName(session.agentId || conversation.initialAgentId),
        presentationMode: retryTarget?.presentationMode || conversation.presentationMode || "focus",
        responseFamilyId: retryTarget ? responseFamilyId(conversation.messages, retryTarget) : replyId,
        contextMessageId: prompt.id, contextMessageIds: context.map(message => message.id),
        modelId, status: "complete", ...(options.retryMessageId ? { retryOf: options.retryMessageId } : {}),
      }
      let run: ConversationRun = {
        id: crypto.randomUUID(), status: "running", phase: "thinking", label: "Preparing reply", provenance: "preview",
        startedAt: new Date().toISOString(),
        steps: [{ id: "prepare", kind: "phase", status: "running", label: "Preparing preview reply", startedAt: new Date().toISOString(), detail: "Using the selected model configuration. No model service is connected." }],
      }
      const publishActivity = () => { reply.activity = structuredClone(run); options.onActivity?.(structuredClone(run)) }
      const finishActivity = (status: "complete" | "stopped" | "failed") => {
        const endedAt = new Date().toISOString()
        run = mergeActivityRun(run, {
          ...run, status, endedAt, sequence: (run.sequence || 0) + 1,
          label: status === "complete" ? "Reply complete" : status === "stopped" ? "Response stopped" : "Response failed",
          steps: run.steps.map(step => step.status === "running" || step.status === "waiting" ? { ...step, status, endedAt, sequence: (step.sequence || 0) + 1 } : step),
        })
        publishActivity()
      }
      streaming.add(id)
      let saved = false
      const saveReply = () => {
        if (saved) return
        saved = true
        conversation.messages.push(reply)
        conversation.usage.outputTokens += Math.ceil(reply.text.length / 4)
        touch(id)
      }
      try {
        if (options.previewScenario === "service-disconnected") {
          publishActivity()
          await pause(450, options.signal)
          run.steps[0].detail = "Development fixture: the model service is unavailable. No connection was attempted. Choose Normal preview to retry; this preview has no reconnect or resume transport."
          run.steps[0].failure = { message: "Model service disconnected (fixture).", recovery: "Choose Normal preview, then retry this response. Your saved message is retained." }
          throw new Error("Model service disconnected (fixture). Your message is saved. Choose Normal preview and retry; no automatic reconnect is available.")
        }
        // Development fixtures are opt-in; retries never inherit previous tool work.
        if (options.previewScenario && isActivityScenarioName(options.previewScenario)) {
          const snapshots = createActivityScenario(options.previewScenario)
          const epoch = Date.now()
          const fixtureEpoch = new Date(snapshots[0].startedAt!).getTime()
          const rebase = (value?: string) => value ? new Date(epoch + (new Date(value).getTime() - fixtureEpoch) / 5).toISOString() : undefined
          let previous: ConversationRun | undefined
          let previousOffset = 0
          for (const snapshot of snapshots) {
            const offset = Math.max(0, ...[snapshot.endedAt, ...snapshot.steps.flatMap(step => [step.startedAt, step.endedAt])].filter((value): value is string => !!value).map(value => (new Date(value).getTime() - fixtureEpoch) / 5))
            await pause(Math.max(350, offset - previousOffset), options.signal)
            previousOffset = offset
            const next = { ...snapshot, id: run.id, startedAt: rebase(snapshot.startedAt), endedAt: snapshot.status === "running" ? undefined : new Date().toISOString(), steps: snapshot.steps.map(step => ({ ...step, startedAt: rebase(step.startedAt), endedAt: rebase(step.endedAt) })) }
            run = mergeActivityRun(previous, next)
            previous = run
            publishActivity()
            if (options.signal?.aborted) throw aborted()
          }
          reply.text = `Development preview: ${activityScenarios.find(item => item.id === options.previewScenario)?.label}. Activity above is a supplied fixture; no search, tool, agent or external service ran.`
          if (run.phase === "waiting") reply.text += " Review the linked Inbox request. This preview does not reconnect or resume automatically."
          reply.status = run.status === "failed" ? "failed" : run.status === "stopped" ? "stopped" : "complete"
          onChunk(reply.text)
          saveReply()
          if (run.status === "failed") throw new Error("The fixture request failed. Your message and failure details are retained; queued turns are paused.")
          return structuredClone(reply)
        }
        publishActivity()
        await pause(450, options.signal)
        const writingAt = new Date().toISOString()
        run.steps[0] = { ...run.steps[0], status: "complete", endedAt: writingAt }
        run.steps.push({ id: "write", kind: "phase", status: "running", label: "Writing preview response", startedAt: writingAt, detail: "Simulated text stream. No tools or agents are being executed." })
        run.phase = "streaming"
        run.label = "Writing"
        publishActivity()
        const text = options.previewScenario === "slow-response"
          ? "Development preview: this response streams slowly so you can inspect the queue and scrolling. You can write another message, queue it, edit or remove it, and pause the queue while this response continues. Stop preserves partial text and holds queued requests until you explicitly resume. Reading earlier content keeps your position; the small bottom control brings you back to the latest response. No model, tools, agents or external services are running."
          : options.previewScenario === "rich-answer" ? richAnswerFixture.text : reply.presentationMode === "character"
          ? "Simulated reply: I have your message. Once connected, I will answer in your character’s style. No tools have run."
          : "Simulated reply: Your message is saved. A connected model will respond here. No tools have run."
        if (options.previewScenario === "rich-answer") reply.citations = structuredClone(richAnswerFixture.citations)
        for (const chunk of text.match(options.previewScenario === "rich-answer" ? /[\s\S]{1,100}/g : /[\s\S]{1,6}/g) || []) {
          await pause(150, options.signal)
          reply.text += chunk
          onChunk(chunk)
          if (options.signal?.aborted) throw aborted()
        }
        finishActivity("complete")
        saveReply()
        return structuredClone(reply)
      } catch (error) {
        finishActivity(options.signal?.aborted ? "stopped" : "failed")
        if (reply.text || !options.signal?.aborted) {
          reply.status = options.signal?.aborted ? "stopped" : "failed"
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
      if (action === "run" || job.status === "Paused") availableAgent(job.agentId)
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
      availableAgent(config.agentId)
      const job = { ...config, id: crypto.randomUUID(), purpose: config.instructions.split("\n")[0].slice(0, 160), schedule: describeJobTiming(config.timing), status: enabled ? "Scheduled" as const : "Paused" as const, lastRun: "Never run", nextRun: "Awaiting scheduler", runs: 0, history: [] }
      state.jobs.unshift(job)
      return structuredClone(job)
    },
    async saveJob(id, input) {
      const job = findJob(id)
      const { enabled, ...config } = normalizeJobInput(input)
      if (config.agentId !== job.agentId || enabled) availableAgent(config.agentId)
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
      const jobRuns = projectActivity({ ...state, tools: [], journalProvenance: "sample" }).runs.filter(run => run.source.kind === "job" && run.source.jobId === id)
      if (state.tasks.some(task => task.runIds.some(runId => jobRuns.some(run => run.id === runId)))) throw new Error("This job has runs linked to task history. Pause it to preserve their evidence.")
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
