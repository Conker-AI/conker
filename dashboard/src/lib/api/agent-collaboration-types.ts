import type { Agent, AgentInput } from "./models"

export type AgentTemplateInput = { name: string; description: string; agent: AgentInput }
export type AgentTemplateVersion = { version: number; publishedAt: string; definition: AgentTemplateInput }
export type AgentTemplateRecord = {
  id: string; draft: AgentTemplateInput; revision: number; versions: AgentTemplateVersion[];
  createdAt: string; updatedAt: string; archivedAt: string | null; provenance: "preview"
}
export type TemplateInstantiationInput = {
  name: string
  /** Whole-field replacements. Tool and memory selections never union with defaults. */
  overrides?: Partial<Omit<AgentInput, "name">>
}
export type PreparedAgentConfiguration = {
  id: string; templateId: string; templateVersion: number; createdAt: string;
  configuration: AgentInput; overriddenFields: (keyof AgentInput)[];
  status: "prepared"; provenance: "preview"; authority: "none"
}
export type CollaborationBudget = {
  maxTurns: number
  maxTokens: number
  /** Integer cents. Zero means no paid usage, not unlimited spending. */
  maxCostCents: number
}
export type TeamRoleInput = {
  id: string; name: string; agentId: string; instructions: string;
  toolIds: string[]; memory: AgentInput["memory"];
  /** Only these source references may accompany the task's own bounded context. */
  context: { mode: "task_only" | "selected"; sourceIds: string[] }
  budget: CollaborationBudget
}
export type TeamHandoffInput = {
  id: string; fromRoleId: string; toRoleId: string; condition: string;
  /** Declared handoff content, never implicit transcript or permission sharing. */
  payload: "result_only" | "result_and_citations"
  maxTransfers: number
}
export type AgentTeamInput = {
  name: string; objective: string; roles: TeamRoleInput[]; handoffs: TeamHandoffInput[];
  budget: CollaborationBudget & { maxHandoffs: number }
}
export type AgentTeamRecord = {
  id: string; definition: AgentTeamInput; revision: number;
  createdAt: string; updatedAt: string; archivedAt: string | null; provenance: "preview"
}
export type PreparedTeamConfiguration = {
  id: string; teamId: string; teamRevision: number; createdAt: string;
  definition: AgentTeamInput
  /** Historical base configuration, not effective permissions. definition.roles contains
   * the narrower role selections; later execution must revalidate current authority. */
  agents: { roleId: string; agentId: string; agentVersion: number | null; configuration: AgentInput }[]
  status: "prepared"; provenance: "preview"; authority: "none"
}
export type CollaborationData = {
  templates: AgentTemplateRecord[]; teams: AgentTeamRecord[];
  agentPreparations: PreparedAgentConfiguration[]; teamPreparations: PreparedTeamConfiguration[]
}
export type CollaborationReferenceKind = "agent" | "tool" | "memory" | "template" | "team" | "context"
export type CollaborationPreviewState = CollaborationData & {
  agents: Pick<Agent, "id" | "name" | "configuration" | "version" | "archivedAt">[]
  companionName: string
  /** Enabled configuration entries only; these IDs never establish live readiness. */
  modelIds: string[]; toolIds: string[]; memoryIds: string[]; contextSourceIds: string[]
  references?: { kind: "template" | "team"; id: string; label: string }[]
}
export interface AgentCollaborationClient {
  readonly mode: "preview"
  list(): Promise<CollaborationData>
  createTemplate(input: AgentTemplateInput): Promise<AgentTemplateRecord>
  updateTemplate(id: string, input: AgentTemplateInput, revision: number): Promise<AgentTemplateRecord>
  publishTemplate(id: string, revision: number): Promise<AgentTemplateVersion>
  instantiateTemplate(id: string, version: number, input: TemplateInstantiationInput, revision: number): Promise<PreparedAgentConfiguration>
  archiveTemplate(id: string, archived: boolean, revision: number): Promise<AgentTemplateRecord>
  removeTemplate(id: string, revision: number): Promise<void>
  createTeam(input: AgentTeamInput): Promise<AgentTeamRecord>
  updateTeam(id: string, input: AgentTeamInput, revision: number): Promise<AgentTeamRecord>
  prepareTeam(id: string, revision: number): Promise<PreparedTeamConfiguration>
  archiveTeam(id: string, archived: boolean, revision: number): Promise<AgentTeamRecord>
  removeTeam(id: string, revision: number): Promise<void>
}
