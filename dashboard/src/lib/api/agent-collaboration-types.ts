import type { AgentInput } from "./models"

export type AgentTemplateInput = { name: string; description: string; agent: AgentInput }
export type AgentTemplateVersion = { version: number; publishedAt: string; definition: AgentTemplateInput }
export type AgentTemplateRecord = {
  id: string; draft: AgentTemplateInput; revision: number; versions: AgentTemplateVersion[];
  createdAt: string; updatedAt: string; archivedAt: string | null; provenance: "preview"
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
