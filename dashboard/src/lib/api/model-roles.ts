import type { CatalogueModel, ModelsConfiguration } from "./model-catalogue"

export const MODEL_ROLES = ["answer", "routing", "context-selection", "summarization"] as const
export type ModelRole = typeof MODEL_ROLES[number]
export const MODEL_ROLE_LABELS: Record<ModelRole, string> = { answer: "Answer", routing: "Routing decision", "context-selection": "Context selection", summarization: "Summarization" }
export type ModelRoleAssignment = {
  enabled: boolean
  /** Owner-assigned eligibility, not a verified capability claim. */
  eligibleModelIds: string[]
  modelId: string | null
  timeoutMs: number
  failure: "stop" | "fallback"
  fallbackModelId: string | null
}
export type ModelRolesConfiguration = {
  answerMode: "manual" | "router"
  roles: Record<ModelRole, ModelRoleAssignment>
}

function enabledModels(configuration: ModelsConfiguration): CatalogueModel[] {
  return configuration.models.filter(model => model.enabled && configuration.providers.some(provider => provider.id === model.providerId && provider.enabled))
}

export function createModelRoles(configuration: ModelsConfiguration): ModelRolesConfiguration {
  const defaultId = enabledModels(configuration).find(model => model.id === configuration.defaultModelId)?.id || null
  const empty = (): ModelRoleAssignment => ({ enabled: false, eligibleModelIds: [], modelId: null, timeoutMs: 30000, failure: "stop", fallbackModelId: null })
  return { answerMode: "manual", roles: { answer: { ...empty(), enabled: !!defaultId, modelId: defaultId, eligibleModelIds: defaultId ? [defaultId] : [] }, routing: empty(), "context-selection": empty(), summarization: empty() } }
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
    if (!Number.isSafeInteger(assignment.timeoutMs) || assignment.timeoutMs < 100 || assignment.timeoutMs > 120000) errors.push(`${label}: timeout must be 100–120,000 milliseconds.`)
    if (!["stop", "fallback"].includes(assignment.failure)) errors.push(`${label}: choose stop or explicit fallback on failure.`)
    for (const id of [assignment.modelId, assignment.fallbackModelId]) if (id !== null && (typeof id !== "string" || !known.has(id) || !assignment.eligibleModelIds.includes(id))) errors.push(`${label}: selected and fallback models must belong to its eligible list.`)
    if (assignment.modelId && assignment.fallbackModelId === assignment.modelId) errors.push(`${label}: fallback must differ from the primary model.`)
    if (assignment.failure === "stop" && assignment.fallbackModelId !== null) errors.push(`${label}: remove the fallback or explicitly enable it.`)
    if (assignment.enabled) {
      if (!assignment.modelId || !enabled.has(assignment.modelId)) errors.push(`${label}: choose an enabled primary model and provider.`)
      if (assignment.failure === "fallback" && (!assignment.fallbackModelId || !enabled.has(assignment.fallbackModelId))) errors.push(`${label}: choose an enabled fallback model and provider.`)
      if (!assignment.eligibleModelIds.some(id => enabled.has(id))) errors.push(`${label}: no eligible models are enabled.`)
    }
  }
  if (value.answerMode === "manual" && value.roles.answer?.failure !== "stop") errors.push("A manual answer lock must stop on failure; it cannot silently switch models.")
  if (value.answerMode === "router" && (!value.roles.answer?.enabled || !value.roles.routing?.enabled)) errors.push("Router mode needs an enabled answer role and routing decision role.")
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
    if (assignment.failure !== "fallback" || !assignment.fallbackModelId || assignment.fallbackModelId === selected) return { ...result, reason: "The selected model failed or is unavailable. This role has no distinct permitted fallback." }
    selected = assignment.fallbackModelId
    basis = "fallback"
  }
  const model = eligible.find(model => model.id === selected)
  if (!model) return { ...result, reason: "No eligible configured model is available under the current restrictions." }
  return { ...result, status: "planned", selectedModelId: model.id, providerId: model.providerId, route: model.route, timeoutMs: assignment.timeoutMs, basis, reason: basis === "fallback" ? "Explicit fallback proposed after failure or unavailability; no provider was contacted." : "Configured model proposed; capabilities and dispatch authorization still require verification." }
}
