/**
 * Development-only team runs for the preview: one run of the preview team, read by its id like
 * Pi (no list route), with the role steps, finish and check routes guarded by the expected revision.
 * `sessionStorage['conker-fake-team-run']` = held | blocked | interrupted | cap-off | done picks another state.
 */
import { GatewayError } from '../lib/gateway/transport'

type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST' | 'PUT'; body?: Json }
type Fail = (status: number) => never

export const FAKE_TEAM_RUN_ID = `teamrun_${'a'.repeat(32)}`
const hex = (letter: string, length: number) => letter.repeat(length)

export function createFakeTeamRuns(now: () => number, fail: Fail, teamDefinition: () => Json, teamId: () => string) {
  const scenario = globalThis.sessionStorage?.getItem('conker-fake-team-run') ?? ''
  const refuse = (code: string, status = 409): never => { throw new GatewayError('http', status, undefined, code as never) }
  const step = (n: number, roleId: string, state: string, handoff: string | null): Json => ({
    id: `teamstep_${hex(String(n), 32)}`, request_id: `ui_step_${hex(String(n), 32)}`, role_id: roleId, handoff_id: handoff,
    session_id: `ses_${hex(String(n), 16)}`, task_id: `tsk_${hex(String(n), 32)}`, state, created_at: now() - 600 + n,
  })
  const call = (n: number, stepNumber: number, state = 'complete'): Json => ({
    id: `teamcall_${hex(String(n), 32)}`, step_id: `teamstep_${hex(String(stepNumber), 32)}`, provider: 'ollama', requested_model: 'qwen2.5:3b',
    actual_model: 'qwen2.5:3b', state, input_tokens: state === 'complete' ? 812 : null, output_tokens: state === 'complete' ? 640 : null, cost_usd: null, latency_ms: state === 'complete' ? 9100 : null,
  })
  const base = (): Json => ({
    id: FAKE_TEAM_RUN_ID, teamId: teamId(), revision: 2, state: 'ready', rootSessionId: `ses_${hex('7', 16)}`,
    snapshot: { definition: structuredClone(teamDefinition()), agents: [], teamRevision: 1, base: {} },
    steps: [step(1, 'planner', 'complete', null)], modelCalls: [call(1, 1)],
    limits: { turnsAndHandoffs: 'strict', tokensAndCost: 'observed-stop; the current provider call may overshoot', unknownUsage: 'blocks further calls', toolCharges: 'separate ToolGate authorization; not included in model cost', conditions: 'owner-reviewed, not automatically evaluated', authority: 'none' },
  })
  const run = base()
  if (scenario === 'held') { run.state = 'held'; run.steps = [step(1, 'planner', 'held', null)]; run.modelCalls = [] }
  if (scenario === 'blocked') { run.state = 'blocked'; run.steps = [step(1, 'planner', 'blocked', null)]; run.modelCalls = [call(1, 1, 'unknown')] }
  if (scenario === 'interrupted') { run.state = 'interrupted'; run.steps = [step(1, 'planner', 'interrupted', null)]; run.modelCalls = [call(1, 1, 'unknown')] }
  if (scenario === 'done') { run.state = 'ready'; run.steps = [step(1, 'planner', 'complete', null), step(2, 'reviewer', 'complete', 'plan_review')]; run.modelCalls = [call(1, 1), call(2, 2)]; run.revision = 4 }
  let working = false
  const bump = () => { run.revision = Number(run.revision) + 1 }
  const settle = () => {
    if (!working) return
    working = false
    run.state = 'ready'; bump()
    ;(run.steps as Json[]).at(-1)!.state = 'complete'
    ;(run.modelCalls as Json[]).push(call((run.modelCalls as Json[]).length + 1, (run.steps as Json[]).length))
  }
  return function handle(path: string, method: 'GET' | 'POST' | 'PUT', options: Request): Json | undefined {
    const match = path.match(/^\/api\/control\/pi\/team-runs\/(teamrun_[0-9a-f]{32})(?:\/(steps|reconcile|finish))?$/)
    if (!match) return undefined
    if (match[1] !== run.id) return fail(404)
    if (method === 'GET' && !match[2]) { settle(); return run }
    if (method !== 'POST' || !match[2]) return fail(404)
    if (match[2] === 'reconcile') { settle(); return run }
    if (Number(options.body?.expected_revision) !== run.revision) refuse('revision_conflict')
    if (match[2] === 'finish') {
      if (['running', 'held'].includes(String(run.state)) || (run.state === 'interrupted' && options.body?.state !== 'cancelled')) refuse('unresolved_run')
      if (options.body?.state === 'completed' && run.state !== 'ready') refuse('blocked_run')
      run.state = options.body?.state; bump(); return run
    }
    if (run.state !== 'ready') refuse('run_blocked')
    if (scenario === 'cap-off') refuse('spending_cap_off')
    const steps = run.steps as Json[], last = steps.at(-1), definition = (run.snapshot as Json).definition as { handoffs: Json[] }
    const edge = definition.handoffs.find(item => item.id === options.body?.handoffId)
    if (last && (!edge || options.body?.conditionReviewed !== true || edge.fromRoleId !== last.role_id || edge.toRoleId !== options.body?.roleId)) refuse('handoff_required')
    steps.push(step(steps.length + 1, String(options.body?.roleId), 'running', edge ? String(edge.id) : null))
    run.state = 'running'; working = true; bump()
    return run
  }
}
