import { agents } from "./fixtures/agents"
import { createOwnerPreferencesFixture } from "./owner-preferences-fixture"
import { createSystemRuntimeFixture } from "./system-runtime-fixture"
import { sessions, plan, planningIntent } from "./fixtures/chat"
import { tickets } from "./fixtures/inbox"
import { jobs } from "./fixtures/jobs"
import { entries } from "./fixtures/journal"
import { memories, memorySearch } from "./fixtures/memory"
import { services, vitals, system } from "./fixtures/system"
import { tools } from "./fixtures/tools"
import { createToolWorkspacePreview } from "./tool-workspace-preview"
import { projectToolCatalogue } from "./tool-catalogue"
import { threads } from "./fixtures/threads"
import { terminal } from "./fixtures/terminal"
import { files } from "./fixtures/files"
import { connectionConfig } from "./config"
import type { ConkerClient, Snapshot, AuthResult } from "./client"
import { createConversations } from "./conversation-fixtures"
import { fixtureConversationMethods, pause } from "./fixture-conversations"
import { createModelsConfiguration, getAvailableModels, validateModelsConfiguration } from "./model-catalogue"
import { unavailableVoiceInput } from "../voice/types"
import { describeJobTiming, normalizeJobInput } from "./job-configuration"
import { normalizeMemoryInput } from "../memory-explorer"

import { createCharacterStudio } from "./character-defaults"
import { createCallFixture } from "./call-fixture"
import { agentReferences, normalizeAgentInput } from "./agent-config"
import { createTaskPreviewClient } from "./task-preview"
import { projectActivity, toolActivityRunIds } from "./activity-projection"
import type { ActivityRunRecord } from "./task-types"
import { collaborationReferences, createAgentCollaborationPreviewClient } from "./agent-collaboration-preview"

import { createProjectPreviewClient } from "./project-preview"
import { projectPreviewState } from "./project-snapshot"
import { createArtifactPreviewClient, resolveArtifactView } from "./artifact-preview"
import { artifactPreviewState } from "./artifact-snapshot"
import type { ArtifactRecord } from "./artifact-types"

/** Explicit fixture transport: mutable per adapter instance, reset on reload, no network. */
export function createFixtureClient(): ConkerClient {
  const state: Snapshot = structuredClone({
    artifacts: [],
    projects: [],
    collaboration: { templates: [], teams: [], agentPreparations: [], teamPreparations: [] },
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
    replyRequests: [], auth: { status: "unconfigured", ownerName: "Sam" },
    connections: connectionConfig.read(),
    terminal,
    files,
  })
  state.conversations = createConversations(state.sessions, state.threads, state.agents)
  // Never place raw source copies in Snapshot, even temporarily.
  let artifactRecords: ArtifactRecord[] = []
  const artifactClient = createArtifactPreviewClient({
    getSnapshot: () => artifactPreviewState(state, artifactRecords),
    setArtifacts: records => { artifactRecords = records },
  })
  state.conversations[state.companionSessionId].presentationMode = state.profile.studio?.modes.default || "character"
  const streaming = new Set<string>()
  const steering = new Map<string, (runId: string, requestId: string, text: string) => import("./conversation-types").SteeringReceipt>()
  const steeringReceipts = new Map<string, { sessionId: string; text: string; receipt: import("./conversation-types").SteeringReceipt }>()
  const runningJobs = new Set<string>()
  const toolWorkspace = createToolWorkspacePreview(tools, { retainRun: run => {
    const ids = new Set(toolActivityRunIds(run))
    return state.tasks.some(task => task.runIds.some(id => ids.has(id)))
  } })
  let taskRunSources: ActivityRunRecord[] = []
  const refreshToolCatalogue = async () => { state.tools = projectToolCatalogue(await toolWorkspace.list()) }
  // Registry writes and consumers share one critical section, including awaited reads.
  let catalogueMutation: Promise<unknown> = Promise.resolve()
  const withToolCatalogue = <T>(action: () => T | Promise<T>): Promise<T> => {
    const result = catalogueMutation.then(async () => { await refreshToolCatalogue(); return action() })
    catalogueMutation = result.then(() => undefined, () => undefined)
    return result
  }
  const taskClient = createTaskPreviewClient({
    getSnapshot: () => ({ tasks: state.tasks, agents: state.agents, sessions: state.sessions, runs: taskRunSources }),
    setTasks: tasks => { state.tasks = tasks },
  })
  const projectClient = createProjectPreviewClient({
    getSnapshot: () => projectPreviewState(state),
    setProjects: projects => { state.projects = projects },
  })
  const collaborationClient = createAgentCollaborationPreviewClient({
    getSnapshot: () => ({ ...state.collaboration, agents: state.agents, companionName: state.profile.name,
      modelIds: getAvailableModels(state.modelsConfiguration).map(model => model.id),
      toolIds: state.tools.map(tool => tool.id), memoryIds: state.memories.map(memory => memory.id),
      contextSourceIds: state.sessions.filter(session => !session.archived).map(session => `session:${session.id}`),
    }),
    setData: data => { state.collaboration = data },
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
    ownerPreferences: createOwnerPreferencesFixture(),
    systemRuntime: createSystemRuntimeFixture(),
    artifacts: artifactClient,
    projects: projectClient,
    collaboration: {
      ...collaborationClient,
      createTemplate(input) { return withToolCatalogue(() => collaborationClient.createTemplate(input)) },
      updateTemplate(id, input, revision) { return withToolCatalogue(() => collaborationClient.updateTemplate(id, input, revision)) },
      publishTemplate(id, revision) { return withToolCatalogue(() => collaborationClient.publishTemplate(id, revision)) },
      instantiateTemplate(id, version, input, revision) { return withToolCatalogue(() => collaborationClient.instantiateTemplate(id, version, input, revision)) },
      createTeam(input) { return withToolCatalogue(() => collaborationClient.createTeam(input)) },
      updateTeam(id, input, revision) { return withToolCatalogue(() => collaborationClient.updateTeam(id, input, revision)) },
      prepareTeam(id, revision) { return withToolCatalogue(() => collaborationClient.prepareTeam(id, revision)) },
    },
    toolWorkspace: {
      ...toolWorkspace,
      create(name, kind) { return withToolCatalogue(() => toolWorkspace.create(name, kind)) },
      save(definition) { return withToolCatalogue(() => toolWorkspace.save(definition)) },
      publish(id) { return withToolCatalogue(() => toolWorkspace.publish(id)) },
      run(id, input, version) { return withToolCatalogue(() => toolWorkspace.run(id, input, version)) },
      remove(id) { return withToolCatalogue(async () => {
        if (state.agents.some(agent => agent.configuration?.toolIds.includes(id))) throw new Error("This tool is referenced by agent configurations. Remove those selections before deleting it.")
        if (collaborationReferences(state.collaboration, "tool", id).length) throw new Error("This tool is referenced by team or template configuration history. Keep it to preserve those references.")
        await refreshTaskRuns()
        const runIds = new Set(taskRunSources.filter(run => run.source.kind === "tool" && run.source.toolId === id).map(run => run.id))
        let previousSize = -1
        while (previousSize !== runIds.size) {
          previousSize = runIds.size
          taskRunSources.filter(run => run.parentRunId && runIds.has(run.parentRunId)).forEach(run => runIds.add(run.id))
        }
        if (state.tasks.some(task => task.runIds.some(runId => runIds.has(runId)))) throw new Error("This tool has runs linked to task history. Keep it to preserve their evidence.")
        return toolWorkspace.remove(id)
      }) },
    },
    tasks: {
      ...taskClient,
      create(input) { return withToolCatalogue(async () => { await refreshTaskRuns(); return taskClient.create(input) }) },
      update(id, input, revision) { return withToolCatalogue(async () => { await refreshTaskRuns(); return taskClient.update(id, input, revision) }) },
    },
    calls: createCallFixture(() => state),
    voiceInput: unavailableVoiceInput,
    async load() {
      await refreshToolCatalogue()
      const source = artifactPreviewState(state, artifactRecords)
      return structuredClone({ ...state, artifacts: artifactRecords.map(record => resolveArtifactView(source, record)) })
    },
    createAgent(input) { return withToolCatalogue(() => {
      const configuration = normalizeAgentInput(input, state)
      const model = state.modelsConfiguration.models.find(item => item.id === configuration.modelId)
      const agent = { id: `agent-${crypto.randomUUID()}`, name: configuration.name, role: configuration.role, kind: "agent" as const, model: model?.name || "Default route", grants: 0, cost: "Not metered", status: "idle" as const, configuration, version: 1 }
      state.agents.push(agent)
      return structuredClone(agent)
    }) },
    saveAgent(id, input) { return withToolCatalogue(() => {
      const agent = specialist(id)
      if (agent.archivedAt) throw new Error("Restore this agent before editing it.")
      if (state.sessions.some(session => session.agentId === id && streaming.has(session.id)) || state.jobs.some(job => job.agentId === id && runningJobs.has(job.id))) throw new Error("Wait for this agent’s preview work to finish before editing it.")
      const configuration = normalizeAgentInput(input, state, id)
      if (agent.name !== configuration.name) agent.historicalNames = [...new Set([...(agent.historicalNames || []), agent.name])]
      Object.assign(agent, { name: configuration.name, role: configuration.role, configuration, model: state.modelsConfiguration.models.find(model => model.id === configuration.modelId)?.name || "Default route", version: (agent.version || 0) + 1 })
      for (const session of state.sessions) if (session.agentId === id) session.agent = agent.name
      return structuredClone(agent)
    }) },
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
      const references = [...agentReferences(state, id), ...collaborationReferences(state.collaboration, "agent", id)]
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
      if (collaborationReferences(state.collaboration, "memory", id).length) throw new Error("This memory is referenced by team or template configuration history. Keep it to preserve those references.")
      state.memories = state.memories.filter(item => item.id !== id)
    },
    async saveCharacter(profile) {
      const { validateCharacter } = await import("./character")
      state.profile = structuredClone(validateCharacter(profile))
      return structuredClone(state.profile)
    },
    async previewCharacter(profile, mode) { const { previewCharacter } = await import("./character"); return previewCharacter(profile, mode) },
    ...fixtureConversationMethods({ state, findConversation, idle, touch, findAgent, agentName, availableAgent, availableModel, streaming, steering, steeringReceipts }),
    async saveModelsConfiguration(value) {
      const error = validateModelsConfiguration(value)
      if (error) throw new Error(error)
      state.modelsConfiguration = structuredClone(value)
      // Preserve explicit conversation choices. A disabled route must block until
      // the owner selects another model, never silently inherit the workspace default.
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
