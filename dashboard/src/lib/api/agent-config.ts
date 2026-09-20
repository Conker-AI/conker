import type { Snapshot } from "./client"
import type { Agent, AgentInput } from "./models"
import { getAvailableModels } from "./model-catalogue"

export function agentInput(agent?: Agent): AgentInput {
  return structuredClone(agent?.configuration || {
    name: agent?.name || "", role: agent?.role || "", instructions: "", modelId: null,
    toolIds: [], memory: { scope: "conversation", memoryIds: [] },
  })
}

export function normalizeAgentInput(input: AgentInput, data: Snapshot, id?: string): AgentInput {
  const text = (value: unknown, label: string, max: number) => {
    if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new Error(`${label} is required, up to ${max.toLocaleString()} characters.`)
    return value.trim()
  }
  const name = text(input.name, "Name", 80)
  const role = text(input.role, "Role", 160)
  const instructions = text(input.instructions, "Instructions", 8000)
  if (data.agents.some(agent => agent.id !== id && agent.name.toLocaleLowerCase() === name.toLocaleLowerCase()) || (name.toLocaleLowerCase() === data.profile.name.toLocaleLowerCase())) throw new Error("Choose a unique agent name, distinct from your Companion.")
  if (input.modelId !== null && !getAvailableModels(data.modelsConfiguration).some(model => model.id === input.modelId)) throw new Error("Choose an enabled model or follow the default route.")
  const refs = (values: unknown, available: string[], label: string): string[] => {
    if (!Array.isArray(values) || values.some(value => typeof value !== "string" || !available.includes(value))) throw new Error(`Choose existing ${label}.`)
    return [...new Set(values)]
  }
  const toolIds = refs(input.toolIds, data.tools.map(tool => tool.id), "tools")
  if (!input.memory || !["none", "conversation", "selected"].includes(input.memory.scope)) throw new Error("Choose a memory scope.")
  const memoryIds = refs(input.memory.memoryIds, data.memories.map(memory => memory.id), "memory records")
  if (input.memory.scope === "selected" && !memoryIds.length) throw new Error("Select at least one memory record.")
  if (input.memory.scope !== "selected" && memoryIds.length) throw new Error("Selected records require Selected memories scope.")
  return { name, role, instructions, modelId: input.modelId, toolIds, memory: { scope: input.memory.scope, memoryIds } }
}

/** Includes historical handoffs/messages, not just the current session owner. */
export function agentReferences(data: Snapshot, id: string): string[] {
  const agent = data.agents.find(item => item.id === id)
  const names = [agent?.name, ...(agent?.historicalNames || [])]
  const references: string[] = []
  if (data.sessions.some(session => session.agentId === id || (!session.agentId && session.agent === agent?.name))) references.push("conversations")
  if (Object.values(data.conversations).some(conversation => conversation.initialAgentId === id || conversation.messages.some(message => message.agentId === id || message.activity?.steps.some(step => step.agentId === id || step.handoffTo?.id === id)) || conversation.handoffs.some(handoff => handoff.fromAgentId === id || handoff.toAgentId === id))) references.push("conversation history")
  if (data.jobs.some(job => job.agentId === id)) references.push("jobs")
  if (data.tasks?.some(task => task.agentId === id)) references.push("tasks")
  if (data.tickets.some(ticket => names.includes(ticket.agent)) || data.entries.some(entry => names.includes(entry.actor))) references.push("recorded evidence")
  return references
}
