import type { GatewayTeamRun, TeamRunState, TeamStepState } from './gateway/team-runs'

/** Plain words for a run and its steps: what the owner reads, never Pi's state names. */
export const RUN_STATE_WORDS: Record<TeamRunState, string> = {
  ready: 'Between roles',
  running: 'A role is working',
  held: 'Waiting for your approval',
  blocked: 'Stopped',
  interrupted: 'Cut off',
  completed: 'Finished',
  cancelled: 'Cancelled',
}
export const STEP_STATE_WORDS: Record<TeamStepState, string> = {
  running: 'Working',
  complete: 'Answered',
  held: 'Waiting for your approval',
  blocked: 'Stopped',
  interrupted: 'Cut off',
}
type Definition = GatewayTeamRun['snapshot']['definition']
export type NextRole = { roleId: string; roleName: string; handoffId: string | null; condition: string | null }

export const isOver = (run: GatewayTeamRun) => run.state === 'completed' || run.state === 'cancelled'
export const roleName = (definition: Definition, id: string) => definition.roles.find(role => role.id === id)?.name ?? 'A role'

/** The role no handoff leads to: where a run starts. */
export function firstRole(definition: Definition) {
  const targets = new Set(definition.handoffs.map(edge => edge.toRoleId))
  return definition.roles.find(role => !targets.has(role.id)) ?? definition.roles[0]
}

/** What the owner may start now: the first role, or each handoff leading on from the last role that ran. Only between roles. */
export function nextRoles(run: GatewayTeamRun): NextRole[] {
  if (run.state !== 'ready') return []
  const definition = run.snapshot.definition,
    last = run.steps.at(-1)
  if (!last) {
    const role = firstRole(definition)
    return [{ roleId: role.id, roleName: role.name, handoffId: null, condition: null }]
  }
  return definition.handoffs.filter(edge => edge.fromRoleId === last.role_id).map(edge => ({ roleId: edge.toRoleId, roleName: roleName(definition, edge.toRoleId), handoffId: edge.id, condition: edge.condition }))
}

export type RunUsage = { tokens: number; costUsd: number | null; unknownAnswers: number }
/** Counts only what Pi measured: an answer whose use is unknown is named, never guessed. */
export function usageOf(run: GatewayTeamRun): RunUsage {
  let tokens = 0,
    cost = 0,
    priced = false,
    unknown = 0
  for (const call of run.modelCalls) {
    if (call.state === 'running') continue
    if (call.state === 'unknown' || call.input_tokens === null || call.output_tokens === null) {
      unknown += 1
      continue
    }
    tokens += call.input_tokens + call.output_tokens
    if (call.cost_usd !== null) {
      cost += call.cost_usd
      priced = true
    }
  }
  return { tokens, costUsd: priced ? cost : null, unknownAnswers: unknown }
}

/** One or two sentences: where the run stands and what can be done. */
export function runSummary(run: GatewayTeamRun): string {
  const definition = run.snapshot.definition,
    last = run.steps.at(-1),
    who = last ? roleName(definition, last.role_id) : null
  if (run.state === 'completed') return 'You marked this run finished. Its answers stay in the role chats below.'
  if (run.state === 'cancelled') return 'This run was cancelled. What the roles already answered stays in their chats.'
  if (run.state === 'running') return `${who ?? 'A role'} is working. This page looks again every few seconds.`
  if (run.state === 'held') return `${who ?? 'A role'} wants to use a tool and is waiting for your approval in the Inbox. Answer it there, then check again. Nothing resumes by itself.`
  if (run.state === 'blocked') return `${who ?? 'A role'} stopped before it finished, or a limit was reached, so no further role will run. You can end the run.`
  if (run.state === 'interrupted') return `Conker restarted while ${who ?? 'a role'} was working, so nobody knows how far it got. The run can only be cancelled.`
  const next = nextRoles(run)
  if (!last) return `No role has run yet. It starts with ${next[0]?.roleName ?? 'the first role'}.`
  if (!next.length) return `${who} answered. That was the last role: read its answer, then mark the run finished.`
  return `${who} answered. Read the answer first; ${next.length === 1 ? `${next[0].roleName} is next` : 'choose who goes next'}, or end the run.`
}
