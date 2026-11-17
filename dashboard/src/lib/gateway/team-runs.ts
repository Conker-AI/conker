import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError, teamRunErrorCodes, type TeamRunErrorCode } from './transport'
import { teamDefinitionSchema } from './teams'

const runId = z.string().regex(/^teamrun_[0-9a-f]{32}$/)
const roleId = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/)
const count = z.number().int().nonnegative()

/** Run states from Pi's team_execution: ready between roles, running and held while one works. */
export const teamRunStates = ['ready', 'running', 'held', 'blocked', 'interrupted', 'completed', 'cancelled'] as const
export type TeamRunState = typeof teamRunStates[number]
export const teamStepStates = ['running', 'complete', 'held', 'blocked', 'interrupted'] as const
export type TeamStepState = typeof teamStepStates[number]

const step = z.object({
  id: z.string().regex(/^teamstep_[0-9a-f]{32}$/), request_id: z.string().min(1).max(128), role_id: roleId, handoff_id: roleId.nullable(),
  session_id: z.string().regex(/^ses_[0-9a-f]{16}$/), task_id: z.string().min(1).max(128), state: z.enum(teamStepStates), created_at: z.number().finite().nonnegative(),
}).strict()
const modelCall = z.object({
  id: z.string().min(1).max(128), step_id: z.string().regex(/^teamstep_[0-9a-f]{32}$/), provider: z.string().max(80), requested_model: z.string().max(200),
  actual_model: z.string().max(200).nullable(), state: z.enum(['running', 'complete', 'unknown']),
  input_tokens: count.nullable(), output_tokens: count.nullable(), cost_usd: z.number().finite().nonnegative().nullable(), latency_ms: count.nullable(),
}).strict()
// The frozen copy of the team, read in full. Pi also keeps each role's agent profile and the chat's
// settings there; nothing here shows them, so they are not read.
const snapshot = z.object({ definition: teamDefinitionSchema, teamRevision: z.number().int().positive() }).passthrough()
const run = z.object({
  id: runId, teamId: z.string().regex(/^team_[0-9a-f]{32}$/), revision: z.number().int().positive(), state: z.enum(teamRunStates),
  rootSessionId: z.string().regex(/^ses_[0-9a-f]{16}$/), snapshot, steps: z.array(step).max(400), modelCalls: z.array(modelCall).max(1000),
  limits: z.record(z.string().max(60), z.string().max(300)),
}).strict()
export type GatewayTeamRun = z.infer<typeof run>
export type GatewayTeamRunStep = z.infer<typeof step>

/** What Pi's Step and Finish bodies carry; src/lib/api/pi-wire.check.ts binds both to pi.d.ts. */
export const stepBody = z.object({
  request_id: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/), expected_revision: z.number().int().positive(), roleId: z.string().min(1).max(64),
  handoffId: z.string().min(1).max(64).nullable().optional(), conditionReviewed: z.boolean(), background: z.boolean(),
}).strict()
export const finishBody = z.object({ expected_revision: z.number().int().positive(), state: z.enum(['completed', 'cancelled']) }).strict()
export type TeamRunStepBody = z.infer<typeof stepBody>
export type TeamRunFinishBody = z.infer<typeof finishBody>

function parse<T>(schema: z.ZodType<T>, value: unknown, input = false): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new GatewayError(input ? 'validation' : 'invalid-response')
  return result.data
}

const refusals: Record<TeamRunErrorCode, string> = {
  spending_cap_off: 'The daily spending cap is off, so this run cannot go on. Turn the cap back on first.',
  spending_cap_unavailable: 'Conker could not read the daily spending cap, so it did not go on. Try again in a moment.',
  revision_conflict: 'This run changed since you opened it. It was reloaded; look again before you decide.',
  request_conflict: 'That request was already used with different words. Nothing was sent again.',
  not_found: 'This run is not here. It may belong to a chat that was deleted.',
  run_blocked: 'This run is not between roles right now, so no role can start.',
  unknown_role: 'That role is not in this run’s saved team.',
  handoff_required: 'Starting this role needs a permitted handoff from the last role, marked as read.',
  handoff_limit: 'That handoff has been used as often as the team allows.',
  turn_limit: 'This team has used all the turns it was given.',
  usage_unknown: 'Conker cannot tell what the last answer used, so it will not run another role. You can end the run.',
  token_stop: 'The run reached its token limit, so no further role runs. You can end it.',
  cost_stop: 'The run reached its cost limit, so no further role runs. You can end it.',
  input_limit: 'The text this role would read is too long (over 16,000 characters). Nothing was cut.',
  source_unavailable: 'A chat this role needs was deleted or is in the Trash, so it cannot run.',
  result_unavailable: 'The last role has no finished answer to hand on.',
  unresolved_run: 'A role is still working or waiting for your approval. Check it again first; a cut-off run can only be ended as cancelled.',
  blocked_run: 'A stopped run cannot be marked completed. End it as cancelled.',
  team_busy: 'Other team roles are still running. Wait for one to finish, then try again.',
  initial_role: 'The first role has no handoff.',
}
export class TeamRunError extends Error {
  readonly code: TeamRunErrorCode | null
  /** The run changed elsewhere: reload it before another try. */
  readonly stale: boolean
  constructor(error: unknown) {
    const failure = error instanceof GatewayError ? error : new GatewayError('network')
    const code = failure.code && teamRunErrorCodes.includes(failure.code as TeamRunErrorCode) ? failure.code as TeamRunErrorCode : null
    super(code ? refusals[code] : failure.message)
    this.name = 'TeamRunError'; this.code = code; this.stale = code === 'revision_conflict'
  }
}

function requestId(kind: string) { return `ui_${kind}_${crypto.randomUUID().replaceAll('-', '')}` }

export function createTeamRunsClient(auth: Pick<GatewayAuthClient, 'request'>) {
  const base = '/api/control/pi/team-runs'
  const send = async (path: string, body: Record<string, unknown> | undefined, id: string, signal?: AbortSignal): Promise<GatewayTeamRun> => {
    try {
      const value = parse(run, await auth.request(path, { method: 'POST', body: body ?? {}, signal }))
      if (value.id !== id) throw new GatewayError('invalid-response')
      return value
    } catch (error) { throw new TeamRunError(error) }
  }
  return {
    async get(id: string, signal?: AbortSignal): Promise<GatewayTeamRun> {
      const selected = parse(runId, id, true)
      const value = parse(run, await auth.request(`${base}/${selected}`, { signal }))
      if (value.id !== selected) throw new GatewayError('invalid-response')
      return value
    },
    /** Runs one role in the background (Pi answers at once and the run reads `running` until it ends). */
    step(current: GatewayTeamRun, choice: { roleId: string; handoffId?: string; reviewed?: boolean }, signal?: AbortSignal) {
      const body = parse(stepBody, {
        request_id: requestId('step'), expected_revision: current.revision, roleId: choice.roleId, conditionReviewed: choice.reviewed === true, background: true,
        ...(choice.handoffId ? { handoffId: choice.handoffId } : {}),
      }, true)
      return send(`${base}/${current.id}/steps`, body, current.id, signal)
    },
    finish(current: GatewayTeamRun, state: 'completed' | 'cancelled', signal?: AbortSignal) {
      return send(`${base}/${current.id}/finish`, parse(finishBody, { expected_revision: current.revision, state }, true), current.id, signal)
    },
    /** Reads where a held or running step stands. It never resumes anything or sends anything again. */
    reconcile(id: string, signal?: AbortSignal) { return send(`${base}/${parse(runId, id, true)}/reconcile`, undefined, id, signal) },
  }
}
export type TeamRunsClient = ReturnType<typeof createTeamRunsClient>
