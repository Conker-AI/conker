import { z } from "zod"
import type { AgentInput } from "./models"
import type { AgentCollaborationClient, AgentTeamInput, AgentTeamRecord, AgentTemplateInput, AgentTemplateRecord, CollaborationData, CollaborationPreviewState, CollaborationReferenceKind, PreparedAgentConfiguration, PreparedTeamConfiguration } from "./agent-collaboration-types"

const text = (max: number) => z.string().trim().min(1).max(max)
const identity = text(200)
const references = z.array(identity).max(100)
const memory = z.object({ scope: z.enum(["none", "conversation", "selected"]), memoryIds: references }).strict()
const agentSchema = z.object({ name: text(80), role: text(160), instructions: text(8000), modelId: identity.nullable(), toolIds: references, memory }).strict()
const templateSchema = z.object({ name: text(80), description: text(1000), agent: agentSchema }).strict()
const instantiateSchema = z.object({ name: text(80), overrides: agentSchema.omit({ name: true }).partial().optional() }).strict()
const budgetSchema = z.object({ maxTurns: z.number().int().min(1).max(200), maxTokens: z.number().int().min(1).max(1_000_000), maxCostCents: z.number().int().min(0).max(1_000_000) }).strict()
const roleIdentity = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/)
const teamSchema = z.object({
  name: text(80), objective: text(2000),
  roles: z.array(z.object({ id: roleIdentity, name: text(80), agentId: identity, instructions: text(8000), toolIds: references, memory,
    context: z.object({ mode: z.enum(["task_only", "selected"]), sourceIds: references }).strict(), budget: budgetSchema,
  }).strict()).min(1).max(12),
  handoffs: z.array(z.object({ id: roleIdentity, fromRoleId: roleIdentity, toRoleId: roleIdentity, condition: text(1000), payload: z.enum(["result_only", "result_and_citations"]), maxTransfers: z.number().int().min(1).max(100) }).strict()).max(30),
  budget: budgetSchema.extend({ maxHandoffs: z.number().int().min(0).max(100) }).strict(),
}).strict()

function parse<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    const first = result.error.issues[0]
    throw new Error(`${label}: check ${first.path.join(".") || "the supplied fields"}. ${first.message}`)
  }
  return result.data
}
function distinct(values: string[], label: string) {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be distinct.`)
}
function selected(values: string[], available: string[], label: string) {
  distinct(values, label)
  if (values.some(value => !available.includes(value))) throw new Error(`Choose existing ${label}.`)
}
function validateMemory(value: AgentInput["memory"], state: CollaborationPreviewState) {
  selected(value.memoryIds, state.memoryIds, "memory records")
  if (value.scope === "selected" ? !value.memoryIds.length : value.memoryIds.length > 0) throw new Error("Selected memory scope requires records; other scopes cannot carry selected records.")
}
function validateConfiguration(value: AgentInput, state: CollaborationPreviewState, requireUniqueName = false) {
  if (value.modelId !== null && !state.modelIds.includes(value.modelId)) throw new Error("Choose an enabled model configuration or follow the default route.")
  selected(value.toolIds, state.toolIds, "tools")
  validateMemory(value.memory, state)
  if (requireUniqueName && (value.name.toLocaleLowerCase() === state.companionName.toLocaleLowerCase() || state.agents.some(agent => agent.name.toLocaleLowerCase() === value.name.toLocaleLowerCase()))) throw new Error("Choose a unique specialist name, distinct from the Companion.")
}
function templateInput(input: AgentTemplateInput, state: CollaborationPreviewState, id?: string) {
  const value = parse(templateSchema, input, "Template")
  if (state.templates.some(template => template.id !== id && template.draft.name.toLocaleLowerCase() === value.name.toLocaleLowerCase())) throw new Error("Choose a unique template name.")
  validateConfiguration(value.agent, state)
  return value
}
function teamInput(input: AgentTeamInput, state: CollaborationPreviewState, id?: string) {
  const value = parse(teamSchema, input, "Team")
  if (state.teams.some(team => team.id !== id && team.definition.name.toLocaleLowerCase() === value.name.toLocaleLowerCase())) throw new Error("Choose a unique team name.")
  distinct(value.roles.map(role => role.id), "Role IDs")
  distinct(value.roles.map(role => role.name.toLocaleLowerCase()), "Role names")
  distinct(value.handoffs.map(handoff => handoff.id), "Handoff IDs")
  const allocations = { maxTurns: 0, maxTokens: 0, maxCostCents: 0 }
  for (const role of value.roles) {
    const agent = state.agents.find(item => item.id === role.agentId && !item.archivedAt)
    if (!agent?.configuration) throw new Error(`Configure an active agent for role ${role.name} first.`)
    validateConfiguration(agent.configuration, state)
    selected(role.toolIds, agent.configuration.toolIds, `tools selected for role ${role.name}'s agent`)
    validateMemory(role.memory, state)
    const ceiling = agent.configuration.memory
    if (role.memory.scope !== "none" && (role.memory.scope !== ceiling.scope || role.memory.memoryIds.some(memoryId => !ceiling.memoryIds.includes(memoryId)))) throw new Error(`Role ${role.name} exceeds its agent's memory selection.`)
    selected(role.context.sourceIds, state.contextSourceIds, "context sources")
    if (role.context.mode === "selected" ? !role.context.sourceIds.length : role.context.sourceIds.length > 0) throw new Error(`Choose explicit sources for selected context in role ${role.name}; task-only context carries no additional sources.`)
    for (const key of Object.keys(allocations) as (keyof typeof allocations)[]) allocations[key] += role.budget[key]
  }
  const budgetLabels = { maxTurns: "turn", maxTokens: "token", maxCostCents: "cost" }
  for (const key of Object.keys(allocations) as (keyof typeof allocations)[]) if (allocations[key] > value.budget[key]) throw new Error(`Role allocations exceed the team ${budgetLabels[key]} budget.`)
  let transfers = 0
  const edges: string[] = []
  for (const handoff of value.handoffs) {
    if (handoff.fromRoleId === handoff.toRoleId || !value.roles.some(role => role.id === handoff.fromRoleId) || !value.roles.some(role => role.id === handoff.toRoleId)) throw new Error("Handoffs must connect two different existing roles.")
    edges.push(`${handoff.fromRoleId}:${handoff.toRoleId}`)
    transfers += handoff.maxTransfers
  }
  distinct(edges, "Directed handoff pairs")
  if (transfers > value.budget.maxHandoffs) throw new Error("Handoff allocations exceed the team's maximum handoffs.")
  return value
}

/** Include archived definitions and immutable snapshots when protecting referenced records. */
export function collaborationReferences(state: CollaborationData, kind: CollaborationReferenceKind, id: string): string[] {
  const found = new Set<string>()
  const configuration = (value: AgentInput, label: string) => {
    if (kind === "tool" && value.toolIds.includes(id) || kind === "memory" && value.memory.memoryIds.includes(id)) found.add(label)
  }
  for (const template of state.templates) {
    configuration(template.draft.agent, "template drafts")
    for (const version of template.versions) configuration(version.definition.agent, "published templates")
  }
  for (const preparation of state.agentPreparations) {
    if (kind === "template" && preparation.templateId === id) found.add("prepared agent configurations")
    configuration(preparation.configuration, "prepared agent configurations")
  }
  const team = (value: AgentTeamInput, label: string) => {
    for (const role of value.roles) {
      if (kind === "agent" && role.agentId === id || kind === "tool" && role.toolIds.includes(id) || kind === "memory" && role.memory.memoryIds.includes(id) || kind === "context" && role.context.sourceIds.includes(id)) found.add(label)
    }
  }
  for (const record of state.teams) team(record.definition, "team definitions")
  for (const preparation of state.teamPreparations) {
    if (kind === "team" && preparation.teamId === id) found.add("prepared team configurations")
    team(preparation.definition, "prepared team configurations")
    for (const agent of preparation.agents) configuration(agent.configuration, "prepared team configurations")
  }
  return [...found]
}

/** Configuration preparation only: no scheduler, handoff transport, grants or model calls. */
export function createAgentCollaborationPreviewClient(options: {
  getSnapshot: () => CollaborationPreviewState
  /** Commit all four collections together, then notify subscribers. */
  setData: (data: CollaborationData) => void
  now?: () => string
  newId?: () => string
}): AgentCollaborationClient {
  const now = options.now ?? (() => new Date().toISOString())
  const newId = options.newId ?? (() => crypto.randomUUID())
  const snapshot = () => structuredClone(options.getSnapshot())
  const collections = (state: CollaborationData): CollaborationData => structuredClone({ templates: state.templates, teams: state.teams, agentPreparations: state.agentPreparations, teamPreparations: state.teamPreparations })
  const commit = (state: CollaborationData) => options.setData(collections(state))
  function find<T extends AgentTemplateRecord | AgentTeamRecord>(records: T[], id: string, revision: number, allowArchived = false): T {
    const record = records.find(item => item.id === id)
    if (!record) throw new Error("Configuration not found.")
    if (!Number.isInteger(revision) || record.revision !== revision) throw new Error("This configuration changed. Reload before saving or preparing it.")
    if (!allowArchived && record.archivedAt) throw new Error("Restore this configuration before changing or preparing it.")
    return record
  }
  function updateRecord(record: AgentTemplateRecord | AgentTeamRecord) { record.revision++; record.updatedAt = now() }
  function identity(prefix: string, state: CollaborationData) {
    const id = `${prefix}_${newId()}`
    if ([...state.templates, ...state.teams, ...state.agentPreparations, ...state.teamPreparations].some(item => item.id === id)) throw new Error("Configuration identity collision. Try again.")
    return id
  }
  function externalReferences(state: CollaborationPreviewState, kind: "template" | "team", id: string) { return (state.references ?? []).filter(reference => reference.kind === kind && reference.id === id).map(reference => reference.label) }
  function archive<T extends AgentTemplateRecord | AgentTeamRecord>(records: T[], id: string, archived: boolean, revision: number) {
    if (typeof archived !== "boolean") throw new Error("Specify archive or restore explicitly.")
    const record = find(records, id, revision, true)
    if (Boolean(record.archivedAt) !== archived) { record.archivedAt = archived ? now() : null; updateRecord(record) }
    return record
  }
  return {
    mode: "preview",
    async list() { return collections(snapshot()) },
    async createTemplate(input) {
      const state = snapshot(), draft = templateInput(input, state), at = now()
      const record: AgentTemplateRecord = { id: identity("template", state), draft, revision: 1, versions: [], createdAt: at, updatedAt: at, archivedAt: null, provenance: "preview" }
      state.templates.push(record); commit(state); return structuredClone(record)
    },
    async updateTemplate(id, input, revision) {
      const state = snapshot(), record = find(state.templates, id, revision)
      record.draft = templateInput(input, state, id); updateRecord(record); commit(state); return structuredClone(record)
    },
    async publishTemplate(id, revision) {
      const state = snapshot(), record = find(state.templates, id, revision)
      const definition = templateInput(record.draft, state, id)
      if (JSON.stringify(record.versions.at(-1)?.definition) === JSON.stringify(definition)) throw new Error("This draft is already published. Change it before publishing another version.")
      const version = { version: (record.versions.at(-1)?.version ?? 0) + 1, publishedAt: now(), definition }
      record.versions.push(version); updateRecord(record); commit(state); return structuredClone(version)
    },
    async instantiateTemplate(id, version, input, revision) {
      const state = snapshot(), record = find(state.templates, id, revision)
      const published = record.versions.find(item => item.version === version)
      if (!Number.isInteger(version) || !published) throw new Error("Select an existing published template version.")
      const value = parse(instantiateSchema, input, "Instantiation")
      const configuration = parse(agentSchema, { ...published.definition.agent, ...value.overrides, name: value.name }, "Agent configuration")
      validateConfiguration(configuration, state, true)
      const prepared: PreparedAgentConfiguration = { id: identity("agent_preparation", state), templateId: id, templateVersion: version, createdAt: now(), configuration, overriddenFields: ["name", ...Object.keys(value.overrides ?? {}) as (keyof AgentInput)[]], status: "prepared", provenance: "preview", authority: "none" }
      state.agentPreparations.push(prepared); commit(state); return structuredClone(prepared)
    },
    async archiveTemplate(id, archived, revision) { const state = snapshot(), record = archive(state.templates, id, archived, revision); commit(state); return structuredClone(record) },
    async removeTemplate(id, revision) {
      const state = snapshot(), record = find(state.templates, id, revision, true)
      if (record.versions.length || collaborationReferences(state, "template", id).length || externalReferences(state, "template", id).length) throw new Error("Archive this template to preserve published versions and references.")
      state.templates = state.templates.filter(item => item.id !== id); commit(state)
    },
    async createTeam(input) {
      const state = snapshot(), definition = teamInput(input, state), at = now()
      const record: AgentTeamRecord = { id: identity("team", state), definition, revision: 1, createdAt: at, updatedAt: at, archivedAt: null, provenance: "preview" }
      state.teams.push(record); commit(state); return structuredClone(record)
    },
    async updateTeam(id, input, revision) {
      const state = snapshot(), record = find(state.teams, id, revision)
      record.definition = teamInput(input, state, id); updateRecord(record); commit(state); return structuredClone(record)
    },
    async prepareTeam(id, revision) {
      const state = snapshot(), record = find(state.teams, id, revision)
      const definition = teamInput(record.definition, state, id)
      const prepared: PreparedTeamConfiguration = { id: identity("team_preparation", state), teamId: id, teamRevision: revision, createdAt: now(), definition, agents: definition.roles.map(role => {
        const agent = state.agents.find(item => item.id === role.agentId)!
        return { roleId: role.id, agentId: agent.id, agentVersion: agent.version ?? null, configuration: structuredClone(agent.configuration!) }
      }), status: "prepared", provenance: "preview", authority: "none" }
      state.teamPreparations.push(prepared); commit(state); return structuredClone(prepared)
    },
    async archiveTeam(id, archived, revision) { const state = snapshot(), record = archive(state.teams, id, archived, revision); commit(state); return structuredClone(record) },
    async removeTeam(id, revision) {
      const state = snapshot(); find(state.teams, id, revision, true)
      if (collaborationReferences(state, "team", id).length || externalReferences(state, "team", id).length) throw new Error("Archive this team to preserve preparation history and references.")
      state.teams = state.teams.filter(item => item.id !== id); commit(state)
    },
  }
}
