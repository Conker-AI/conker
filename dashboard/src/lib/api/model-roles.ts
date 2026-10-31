import type { CatalogueModel, ModelsConfiguration } from "./model-catalogue"

export const MODEL_ROLES = ["answer", "reviewer", "thinking", "routing", "context-selection", "summarization", "memory-ranking", "proposals", "search-ranking", "memory-sorting", "tool-text"] as const
export type ModelRole = typeof MODEL_ROLES[number]
export const MODEL_ROLE_LABELS: Record<ModelRole, string> = { answer: "Talking / answers", reviewer: "Checking actions (reviewer)", thinking: "Background thinking", routing: "Routing decision", "context-selection": "Context selection", summarization: "Summarization", "memory-ranking": "Memory ranking", proposals: "Proposals (daily pass)", "search-ranking": "Search ranking", "memory-sorting": "Memory sorting", "tool-text": "Tool text" }
/** What a role does, where its name alone does not say it. MemoryGate and ToolGate ask Pi for these two. */
export const MODEL_ROLE_DESCRIPTIONS: Partial<Record<ModelRole, string>> = { "memory-sorting": "how new memories are sorted", "tool-text": "AI steps inside your tools" }
export type ModelRoleAssignment = {
  enabled: boolean
  /** Owner-assigned eligibility, not a verified capability claim. */
  eligibleModelIds: string[]
  modelId: string | null
  timeoutMs: number
  failure: "stop" | "fallback"
  /** Backups tried in this order after the model fails; empty when the role stops on failure. */
  fallbackModelIds: string[]
}
/** Pi tries at most this many backups for one role. */
export const MAX_BACKUPS = 8
export type ModelRolesConfiguration = {
  answerMode: "manual" | "router"
  roles: Record<ModelRole, ModelRoleAssignment>
}

function enabledModels(configuration: ModelsConfiguration): CatalogueModel[] {
  return configuration.models.filter(model => model.enabled && configuration.providers.some(provider => provider.id === model.providerId && provider.enabled))
}

export function createModelRoles(configuration: ModelsConfiguration): ModelRolesConfiguration {
  const defaultId = enabledModels(configuration).find(model => model.id === configuration.defaultModelId)?.id || null
  const empty = (): ModelRoleAssignment => ({ enabled: false, eligibleModelIds: [], modelId: null, timeoutMs: 30000, failure: "stop", fallbackModelIds: [] })
  return { answerMode: "manual", roles: { answer: { ...empty(), enabled: !!defaultId, modelId: defaultId, eligibleModelIds: defaultId ? [defaultId] : [] }, reviewer: empty(), thinking: empty(), routing: empty(), "context-selection": empty(), summarization: empty(), "memory-ranking": empty(), proposals: empty(), "search-ranking": empty(), "memory-sorting": empty(), "tool-text": empty() } }
}

/** Checks known IDs, owner eligibility and enabled routes; capabilities remain unverified. */
export function modelRolesErrors(value: ModelRolesConfiguration, configuration: ModelsConfiguration): string[] {
  if (!value || !["manual", "router"].includes(value.answerMode) || !value.roles || typeof value.roles !== "object") return ["Choose a manual answer lock or configured router mode."]
  const errors: string[] = []
  const known = new Set(configuration.models.map(model => model.id))
  const enabled = new Set(enabledModels(configuration).map(model => model.id))
  for (const role of MODEL_ROLES) {
    const assignment = value.roles[role]
    const label = MODEL_ROLE_LABELS[role]
    if (!assignment || typeof assignment.enabled !== "boolean" || !Array.isArray(assignment.eligibleModelIds) || assignment.eligibleModelIds.length > 200 || assignment.eligibleModelIds.some(id => typeof id !== "string" || !known.has(id)) || new Set(assignment.eligibleModelIds).size !== assignment.eligibleModelIds.length) { errors.push(`${label}: choose unique catalogue models for the eligible list.`); continue }
    const decisionRoute = role === 'routing' ? 'model-routing' : role === 'memory-ranking' || role === 'search-ranking' ? role : null
    if (configuration.models.some(model => assignment.eligibleModelIds.includes(model.id) && model.providerId === 'decisions' && model.route !== decisionRoute)) errors.push(`${label}: this decision classifier cannot perform this role.`)
    if (!Number.isSafeInteger(assignment.timeoutMs) || assignment.timeoutMs < 100 || assignment.timeoutMs > 600000) errors.push(`${label}: timeout must be 100–600,000 milliseconds.`)
    if (!["stop", "fallback"].includes(assignment.failure)) errors.push(`${label}: choose stop or explicit fallback on failure.`)
    const backups = assignment.fallbackModelIds
    if (!Array.isArray(backups) || backups.length > MAX_BACKUPS || new Set(backups).size !== backups.length) { errors.push(`${label}: list each backup model once, at most ${MAX_BACKUPS}.`); continue }
    if ([assignment.modelId, ...backups].some(id => id !== null && (typeof id !== "string" || !known.has(id) || !assignment.eligibleModelIds.includes(id)))) errors.push(`${label}: selected and backup models must belong to its eligible list.`)
    if (assignment.modelId && backups.includes(assignment.modelId)) errors.push(`${label}: backups must differ from the primary model.`)
    if (assignment.failure === "stop" && backups.length) errors.push(`${label}: remove the backups or explicitly enable them.`)
    if (assignment.enabled) {
      if (!assignment.modelId || !enabled.has(assignment.modelId)) errors.push(`${label}: choose an enabled primary model and provider.`)
      if (assignment.failure === "fallback" && (!backups.length || backups.some(id => !enabled.has(id)))) errors.push(`${label}: choose enabled backup models and providers.`)
      if (!assignment.eligibleModelIds.some(id => enabled.has(id))) errors.push(`${label}: no eligible models are enabled.`)
    }
  }
  if (value.answerMode === "manual" && value.roles.answer?.failure !== "stop") errors.push("A manual answer lock must stop on failure; it cannot silently switch models.")
  if (value.answerMode === "router" && (!value.roles.answer?.enabled || !value.roles.routing?.enabled)) errors.push("Router mode needs an enabled answer role and routing decision role.")
  const routing = value.roles.routing
  if (value.answerMode === 'router' && routing && configuration.models.some(model => model.providerId === 'decisions' && [routing.modelId].concat(routing.fallbackModelIds ?? []).includes(model.id)) && (value.roles.answer?.eligibleModelIds.length ?? 0) > 8) errors.push('Laya supports a shortlist of at most eight talking models.')
  if (configuration.models.some(model => model.id === configuration.defaultModelId && model.providerId === 'decisions')) errors.push('A decision classifier cannot be the default talking model.')
  return errors
}

export type ModelRolePlan = {
  mode: "preview"
  execution: "not-wired"
  role: ModelRole
  status: "disabled" | "blocked" | "needs-routing" | "planned"
  reason: string
  selectedModelId?: string
  providerId?: string
  route?: string
  timeoutMs?: number
  basis?: "configured" | "manual-lock" | "owner-override" | "router-choice" | "fallback"
  eligibleModelIds: string[]
  memoryAccessAllowed: boolean
  capabilityEvidence: "owner-assigned-unverified"
  dispatchAuthorization: "not-evaluated"
}

/**
 * Deterministic selection proposal only. No model call, hidden planner or permission grant.
 * A future adapter must verify capabilities, privacy, pricing/budget and credentials before dispatch.
 */
export function planModelRole(input: {
  configuration: ModelsConfiguration
  settings: ModelRolesConfiguration
  role: ModelRole
  privacy?: { memoryDisabled: boolean; harnessDisabled: boolean }
  /** Current server-filtered eligibility, never a way to widen the owner's list. */
  allowedProviderIds?: readonly string[]
  allowedModelIds?: readonly string[]
  ownerAnswerOverride?: string
  routedAnswerModelId?: string
  failure?: "timeout" | "unavailable"
  /** The adapter carries attempts across failures; a model is never proposed twice. */
  attemptedModelIds?: readonly string[]
}): ModelRolePlan {
  const { settings, configuration, role } = input
  const result: ModelRolePlan = { mode: "preview", execution: "not-wired", role, status: "blocked", reason: "Role configuration needs review.", eligibleModelIds: [], memoryAccessAllowed: !input.privacy?.memoryDisabled, capabilityEvidence: "owner-assigned-unverified", dispatchAuthorization: "not-evaluated" }
  // Structural configuration errors must block, but runtime availability is re-evaluated below.
  const structural = modelRolesErrors(settings, { ...configuration, providers: configuration.providers.map(provider => ({ ...provider, enabled: true })), models: configuration.models.map(model => ({ ...model, enabled: true })) })
  if (structural.length) return { ...result, reason: structural[0] }
  if (input.failure !== undefined && !["timeout", "unavailable"].includes(input.failure)) return { ...result, reason: "Use a supported failure category; no retry was proposed." }
  const assignment = settings.roles[role]
  if (!assignment?.enabled) return { ...result, status: "disabled", reason: "This role is disabled." }
  if (role !== "answer" && input.privacy?.harnessDisabled) return { ...result, reason: "No harness disables helper model roles." }
  const eligible = enabledModels(configuration).filter(model => assignment.eligibleModelIds.includes(model.id) && !input.attemptedModelIds?.includes(model.id) && (!input.allowedProviderIds || input.allowedProviderIds.includes(model.providerId)) && (!input.allowedModelIds || input.allowedModelIds.includes(model.id)))
  result.eligibleModelIds = eligible.map(model => model.id)
  let selected = assignment.modelId
  let basis: NonNullable<ModelRolePlan["basis"]> = "configured"
  let locked = false
  if (role === "answer") {
    if (input.ownerAnswerOverride !== undefined) { selected = input.ownerAnswerOverride; basis = "owner-override"; locked = true }
    else if (settings.answerMode === "manual") { basis = "manual-lock"; locked = true }
    else {
      if (input.privacy?.harnessDisabled) return { ...result, reason: "No harness disables answer routing. Choose a manual answer model." }
      if (!input.routedAnswerModelId && !input.failure) return { ...result, status: "needs-routing", reason: "Await a typed decision from the configured routing role. No routing model has run." }
      if (input.routedAnswerModelId && !assignment.eligibleModelIds.includes(input.routedAnswerModelId)) return { ...result, reason: "The routing result is outside the owner-assigned answer choices." }
      selected = input.routedAnswerModelId || assignment.modelId
      basis = "router-choice"
    }
  }
  if (input.failure || !eligible.some(model => model.id === selected)) {
    if (locked) return { ...result, reason: "The manually locked answer model failed or is unavailable. Review the choice; no substitute was selected." }
    const backups = assignment.failure === "fallback" ? assignment.fallbackModelIds.filter(id => id !== selected) : []
    if (!backups.length) return { ...result, reason: "The selected model failed or is unavailable. This role has no distinct permitted backup." }
    // The first backup still available, so one that already failed is not proposed again.
    selected = backups.find(id => eligible.some(model => model.id === id)) ?? backups[0]
    basis = "fallback"
  }
  const model = eligible.find(model => model.id === selected)
  if (!model) return { ...result, reason: "No eligible configured model is available under the current restrictions." }
  return { ...result, status: "planned", selectedModelId: model.id, providerId: model.providerId, route: model.route, timeoutMs: assignment.timeoutMs, basis, reason: basis === "fallback" ? "Backup model proposed after failure or unavailability; no provider was contacted." : "Configured model proposed; capabilities and dispatch authorization still require verification." }
}

/**
 * Makes one model answer every chat. Pi answers with the Answer role's model, not the default
 * route, so both move together: manual mode, the model eligible and selected, no backups.
 */
export function withAnswerModel<T extends { defaultModelId: string | null; roleSettings: ModelRolesConfiguration }>(configuration: T, modelId: string): T {
  const answer = configuration.roleSettings.roles.answer
  const eligibleModelIds = answer.eligibleModelIds.includes(modelId) ? answer.eligibleModelIds : [...answer.eligibleModelIds, modelId]
  return { ...configuration, defaultModelId: modelId, roleSettings: { ...configuration.roleSettings, answerMode: "manual",
    roles: { ...configuration.roleSettings.roles, answer: { ...answer, enabled: true, modelId, eligibleModelIds, failure: "stop", fallbackModelIds: [] } } } }
}

/** Turns the daily ideas pass on with one model, or off. Other roles are untouched. */
export function withIdeas<T extends { roleSettings: ModelRolesConfiguration }>(configuration: T, modelId: string | null): T {
  const proposals = configuration.roleSettings.roles.proposals
  const eligibleModelIds = modelId === null || proposals.eligibleModelIds.includes(modelId) ? proposals.eligibleModelIds : [...proposals.eligibleModelIds, modelId]
  const next = modelId === null ? { ...proposals, enabled: false } : { ...proposals, enabled: true, modelId, eligibleModelIds, failure: "stop" as const, fallbackModelIds: [] }
  return { ...configuration, roleSettings: { ...configuration.roleSettings, roles: { ...configuration.roleSettings.roles, proposals: next } } }
}
