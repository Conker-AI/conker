import { validateAttachments } from "../conversation-attachments"
import { normalizeResearchMode, researchLabel } from "../conversation-research"
import { activeConversationMessages, contextBeforeMessage, hasDownstreamMessages, messagesForFork, responseFamilyId } from "../conversation-continuity"
import { mergeActivityRun } from "../conversation-activity"
import { projectActivity } from "./activity-projection"
import { activityScenarios, createActivityScenario, isActivityScenarioName } from "./activity-fixtures"
import { collaborationReferences } from "./agent-collaboration-preview"
import type { ConkerClient, Snapshot } from "./client"
import type { ConversationMessage, ConversationRun, ConversationState, SteeringReceipt } from "./conversation-types"
import { createConversationState } from "./conversation-fixtures"
import { contextPolicyForMessages, normalizeContextPolicy, planContext } from "./context-policy"
import { richAnswerFixture } from "./rich-answer-fixture"

/** Shared state and helpers the fixture client's conversation methods use from `createFixtureClient`. */
export type FixtureContext = {
  state: Snapshot
  findConversation: (id: string) => { session: Snapshot["sessions"][number]; conversation: ConversationState }
  idle: (id: string) => void
  touch: (id: string) => void
  findAgent: (id: string) => Snapshot["agents"][number]
  agentName: (id: string) => string
  availableAgent: (id: string) => Snapshot["agents"][number]
  availableModel: (id: string | null) => string
  streaming: Set<string>
  steering: Map<string, (runId: string, requestId: string, text: string) => SteeringReceipt>
  steeringReceipts: Map<string, { sessionId: string; text: string; receipt: SteeringReceipt }>
}

function aborted() { return new DOMException("Reply stopped.", "AbortError") }

export function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(aborted()); return }
    const finish = () => { signal?.removeEventListener("abort", stop); resolve() }
    const timer = setTimeout(finish, ms)
    const stop = () => { clearTimeout(timer); signal?.removeEventListener("abort", stop); reject(aborted()) }
    signal?.addEventListener("abort", stop, { once: true })
  })
}

/** The fixture client's conversation methods; `fixture` is the client's shared state and helpers. */
export function fixtureConversationMethods(fixture: FixtureContext): Pick<ConkerClient, "createConversation" | "handoffConversation" | "sendMessage" | "updateConversation" | "deleteConversation" | "updateMessage" | "forkConversation" | "streamReply" | "steerConversation"> {
  const { state, findConversation, idle, touch, findAgent, agentName, availableAgent, availableModel, streaming, steering, steeringReceipts } = fixture
  return {
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
      const attachments = validateAttachments(options?.attachments || [])
      const researchMode = normalizeResearchMode(options?.researchMode)
      if ((!text.trim() && !attachments.length) || text.length > 4000) throw new Error("Add a message or attachment, with up to 4,000 characters.")
      if (options?.replyTo && !conversation.messages.some(message => message.id === options.replyTo && !message.redacted)) {
        throw new Error("The message you are replying to is no longer available.")
      }
      const message = { id: crypto.randomUUID(), text: text.trim(), createdAt: new Date().toISOString(), ...(attachments.length ? { attachments } : {}), ...(researchMode !== "off" ? { researchMode } : {}) }
      if (session.isDraft) {
        session.isDraft = false
        if (session.title === "New chat") session.title = (message.text || attachments.map(item => item.name).join(", ")).replace(/\s+/g, " ").slice(0, 64)
      }
      session.subtitle = (message.text || attachments.map(item => item.name).join(", ")).replace(/\s+/g, " ").slice(0, 120)
      state.messages[id] = [...(state.messages[id] || []), message]
      const contextMessageIds = activeConversationMessages(conversation.messages).map(item => item.id)
      conversation.messages.push({ ...message, role: "user", status: "complete", contextMessageIds, ...(options?.replyTo ? { replyTo: options.replyTo } : {}) })
      conversation.usage.inputTokens += Math.ceil(message.text.length / 4)
      touch(id)
      return structuredClone(message)
    },
    async updateConversation(id, update) {
      const { session, conversation } = findConversation(id)
      const contextPolicy = update.contextPolicy === undefined ? undefined : normalizeContextPolicy(update.contextPolicy)
      if (contextPolicy) {
        idle(id)
        if (session.archived) throw new Error("Restore this conversation before editing context.")
        if (Object.keys(contextPolicy.messagePolicies).some(messageId => !conversation.messages.some(message => message.id === messageId && !message.redacted))) throw new Error("Context policies must reference available messages in this conversation.")
      }
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
      if (contextPolicy) conversation.contextPolicy = contextPolicy
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
      if (collaborationReferences(state.collaboration, "context", `session:${id}`).length) throw new Error("This conversation is referenced by team configuration history. Archive it to preserve that context.")
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
      if (update.pinned !== undefined) {
        message.pinned = update.pinned
        if (update.pinned && conversation.contextPolicy) conversation.contextPolicy.messagePolicies[message.id] = "keep-exact"
      }
      if (update.redacted) {
        delete message.attachments
        delete message.researchMode
        message.text = ""
        message.redacted = true
        message.pinned = false
        message.scenario = false
        delete message.rating
        delete message.source
        delete message.activity
        delete message.citations
        delete message.contextPolicySnapshot
        delete message.agentInstructionsSnapshot
        if (conversation.contextPolicy) conversation.contextPolicy = contextPolicyForMessages(conversation.contextPolicy, conversation.messages)
        for (const item of conversation.messages) if (item.contextPolicySnapshot) item.contextPolicySnapshot = contextPolicyForMessages(item.contextPolicySnapshot, conversation.messages)
      }
      // Legacy consumers must not reveal text after an edit or redaction.
      const local = state.messages[id]?.find(item => item.id === messageId)
      if (local) { local.text = message.text; if (update.redacted) { delete local.attachments; delete local.researchMode } }
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
      if (conversation.contextPolicy) next.contextPolicy = contextPolicyForMessages(conversation.contextPolicy, next.messages)
      for (const message of next.messages) if (message.contextPolicySnapshot) message.contextPolicySnapshot = contextPolicyForMessages(message.contextPolicySnapshot, next.messages)
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
      state.messages[forkId] = next.messages.filter(message => message.role === "user").map(({ id, text, createdAt, attachments, researchMode }) => ({ id, text, createdAt, ...(attachments ? { attachments } : {}), ...(researchMode ? { researchMode } : {}) }))
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
      const boundary = retryTarget ? contextBeforeMessage(conversation.messages, retryTarget.id) : activeConversationMessages(conversation.messages)
      const requestedPolicy = retryTarget ? retryTarget.contextPolicySnapshot : conversation.contextPolicy
      const contextPolicy = requestedPolicy ? contextPolicyForMessages(requestedPolicy, boundary) : undefined
      const agentInstructions = retryTarget ? retryTarget.agentInstructionsSnapshot || "" : findAgent(session.agentId || conversation.initialAgentId).configuration?.instructions || ""
      const contextPlan = contextPolicy ? planContext({ policy: contextPolicy, messages: boundary, privacy: conversation.privacy, inheritedInstructions: agentInstructions ? [{ scope: "agent", text: agentInstructions }] : [] }) : undefined
      if (contextPlan && contextPlan.nextAction !== "within-estimated-budget") throw new Error(`Review conversation context before replying: ${contextPlan.conflicts[0]?.detail || "The preview context is unresolved."}`)
      const context = contextPlan ? boundary.filter(message => contextPlan.messages.some(row => row.messageId === message.id && row.disposition === "included-exact")) : boundary
      const prompt = [...boundary].reverse().find(message => message.role === "user" && !message.redacted)
      if (!prompt) throw new Error("Send a message before asking for a reply.")
      const researchMode = normalizeResearchMode(retryTarget ? retryTarget.researchMode : prompt.researchMode)
      if (!context.some(message => message.id === prompt.id)) throw new Error("The latest request is excluded from context. Include it before requesting a reply.")
      const replyId = crypto.randomUUID()
      const reply: ConversationMessage = {
        id: replyId, role: "assistant", text: "", createdAt: new Date().toISOString(),
        agentId: retryTarget?.agentId || session.agentId, agentName: retryTarget?.agentName || agentName(session.agentId || conversation.initialAgentId),
        presentationMode: retryTarget?.presentationMode || conversation.presentationMode || "focus",
        responseFamilyId: retryTarget ? responseFamilyId(conversation.messages, retryTarget) : replyId,
        contextMessageId: prompt.id, contextMessageIds: context.map(message => message.id),
        ...(researchMode !== "off" ? { researchMode } : {}),
        ...(contextPolicy ? { contextPolicySnapshot: structuredClone(contextPolicy) } : {}),
        agentInstructionsSnapshot: agentInstructions,
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
      let steeringRevision = 0
      const steeringMessages: ConversationMessage[] = []
      steering.set(id, (runId, requestId, text) => {
        if (runId !== run.id || run.status !== "running" || options.signal?.aborted) throw new Error("This response is no longer running. Your draft is retained.")
        if (["tool", "agent", "waiting"].includes(run.phase)) throw new Error("An action is already in progress or waiting for a decision. Wait for its result or stop future work; your draft is retained.")
        if (options.retryMessageId || (options.previewScenario && isActivityScenarioName(options.previewScenario))) throw new Error("This response preview does not support steering. Your draft is retained; use Normal or Slow response preview.")
        if (!requestId || !text.trim() || text.length > 4000) throw new Error("Use 1–4,000 characters for a steering instruction.")
        if (steeringMessages.length >= 10) throw new Error("This response already has ten steering instructions. Finish or stop it first.")
        const message: ConversationMessage = { id: crypto.randomUUID(), role: "user", text: text.trim(), createdAt: new Date().toISOString(), status: "complete" }
        if (contextPolicy) {
          const plan = planContext({ messages: [...boundary, ...steeringMessages, message], policy: contextPolicy, privacy: conversation.privacy, inheritedInstructions: agentInstructions ? [{ scope: "agent", text: agentInstructions }] : [] })
          if (plan.nextAction !== "within-estimated-budget") throw new Error("Review the conversation context before steering. Your draft is retained.")
        }
        steeringMessages.push(message)
        conversation.messages.push(message)
        state.messages[id] = [...(state.messages[id] || []), { id: message.id, text: message.text, createdAt: message.createdAt }]
        conversation.usage.inputTokens += Math.ceil(message.text.length / 4)
        reply.contextMessageIds = [...(reply.contextMessageIds || []), message.id]
        reply.text = ""
        reply.citations = undefined
        steeringRevision += 1
        options.onReset?.()
        const now = new Date().toISOString()
        run = { ...run, sequence: (run.sequence || 0) + 1, label: "Applying steering", steps: [...run.steps, { id: requestId, kind: "commentary", status: "complete", label: "Steering instruction saved", startedAt: now, endedAt: now, detail: "Applies to this preview response. No model or tool is connected." }] }
        publishActivity()
        touch(id)
        return { requestId, runId, messageId: message.id, status: "applied" }
      })
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
        if (researchMode === "off" && options.previewScenario && isActivityScenarioName(options.previewScenario)) {
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
        if (researchMode !== "off") {
          const startedAt = new Date().toISOString()
          run.steps[0] = { ...run.steps[0], status: "complete", endedAt: startedAt }
          run.steps.push({ id: "research-preview", kind: "phase", status: "running", label: `${researchLabel(researchMode)} preview`, startedAt, detail: "Requested mode recorded only. No web search, source retrieval, or external service ran. Memory and privacy settings are unchanged; this mode grants no permissions." })
          run.phase = "searching"
          run.label = `${researchLabel(researchMode)} preview`
          publishActivity()
          await pause(450, options.signal)
          run.steps[1] = { ...run.steps[1], status: "complete", endedAt: new Date().toISOString() }
        }
        const writingAt = new Date().toISOString()
        run.steps[0] = { ...run.steps[0], status: "complete", endedAt: writingAt }
        run.steps.push({ id: "write", kind: "phase", status: "running", label: "Writing preview response", startedAt: writingAt, detail: "Simulated text stream. No tools or agents are being executed." })
        run.phase = "streaming"
        run.label = "Writing"
        publishActivity()
        const text = researchMode !== "off"
          ? `${researchLabel(researchMode)} preview: your requested mode is saved with this message. No web search or source retrieval was performed, and there are no research results yet. Memory, privacy, and permissions are unchanged.${prompt.attachments?.length ? " Attached file contents were not uploaded or read." : ""}`
          : prompt?.attachments?.length
          ? "Local attachment preview saved. File contents were not uploaded, read, or sent to a model. Reloading clears these files and this preview conversation."
          : options.previewScenario === "slow-response"
          ? "Development preview: this response streams slowly so you can inspect the queue and scrolling. You can write another message, queue it, edit or remove it, and pause the queue while this response continues. Stop preserves partial text and holds queued requests until you explicitly resume. Reading earlier content keeps your position; the small bottom control brings you back to the latest response. No model, tools, agents or external services are running."
          : options.previewScenario === "rich-answer" ? richAnswerFixture.text : reply.presentationMode === "character"
          ? "Simulated reply: I have your message. Once connected, I will answer in your character’s style. No tools have run."
          : "Simulated reply: Your message is saved. A connected model will respond here. No tools have run."
        if (!steeringRevision && researchMode === "off" && options.previewScenario === "rich-answer") reply.citations = structuredClone(richAnswerFixture.citations)
        const steeredText = "Steering preview: your updated instruction is saved with this response. No model, tool or external service ran."
        let revision = steeringRevision
        let chunks = (steeringRevision ? steeredText : text).match(options.previewScenario === "rich-answer" ? /[\s\S]{1,100}/g : /[\s\S]{1,6}/g) || []
        for (let index = 0; index < chunks.length || revision !== steeringRevision;) {
          await pause(150, options.signal)
          if (revision !== steeringRevision) { revision = steeringRevision; chunks = steeredText.match(/[\s\S]{1,6}/g) || []; index = 0 }
          const chunk = chunks[index++]
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
      } finally { streaming.delete(id); steering.delete(id) }
    },
    async steerConversation(id, runId, requestId, text) {
      findConversation(id)
      const previous = steeringReceipts.get(requestId)
      if (previous) {
        if (previous.sessionId !== id || previous.text !== text || previous.receipt.runId !== runId) throw new Error("This steering request was already used for another instruction.")
        return structuredClone(previous.receipt)
      }
      const apply = steering.get(id)
      if (!apply) throw new Error("This response is no longer running. Your draft is retained; send it as a new message.")
      const receipt = apply(runId, requestId, text)
      steeringReceipts.set(requestId, { sessionId: id, text, receipt })
      return structuredClone(receipt)
    },
  }
}
