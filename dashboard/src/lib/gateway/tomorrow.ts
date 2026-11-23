import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { createPiClient, piData } from './pi-client'

/** One start Conker would make on its own: a clock slot, a watch (checks every N minutes) or the ideas pass. */
const run = z
  .object({
    at: z.number().nullable(),
    kind: z.enum(['clock', 'watch', 'proposals']),
    jobId: z.string().nullable(),
    name: z.string(),
    everyMinutes: z.number().int().nullable(),
    wouldRun: z.boolean(),
    reason: z.string().nullable(),
  })
  .strict()
const job = z
  .object({
    id: z.string(),
    name: z.string(),
    trigger: z.enum(['clock', 'watch']),
    createdBy: z.enum(['owner', 'conker']),
    nextAt: z.number().nullable(),
    runs: z.number().int().nullable(),
    held: z.boolean(),
  })
  .strict()
const approval = z.object({ sessionId: z.string(), toolId: z.string().nullable(), expiresAt: z.number() }).strict()
/** What Pi's GET /insights/tomorrow sends (R-U10): read only, decided by the runner's own checks. */
const tomorrow = z
  .object({
    schemaVersion: z.literal(1),
    since: z.number(),
    until: z.number(),
    hours: z.number().int(),
    jobs: z.array(job).max(100),
    runsPlanned: z.number().int(),
    approvals: z.array(approval).max(100),
    timeZone: z.string(),
    runs: z.array(run).max(200),
  })
  .strict()

export type TomorrowRun = z.infer<typeof run>
export type Tomorrow = z.infer<typeof tomorrow>

/** Why a start would not run, in plain words; Pi's codes (pi/agents/tomorrow_runs.py). */
const reasons: Record<string, string> = {
  QUIET_HOURS: 'Your quiet hours',
  PROACTIVITY_OFF: 'Proactive work is off',
  URGENT_ONLY: 'Only urgent work is allowed',
  OVER_BUDGET: 'Today’s suggestion budget is used up',
  TRIGGER_OFF: 'You don’t let this trigger start jobs',
  TOO_SOON: 'Too soon after its last run',
  RUN_LIMIT: 'It already made its runs for the day',
  LAST_RUN_OPEN: 'Its last run is still open or waits for you',
  SCHEDULER_OFF: 'The job scheduler is off',
  ROLE_OFF: 'The ideas model is off',
}
export const tomorrowReason = (code: string | null) => (code ? (reasons[code] ?? 'Held back') : '')

export function createTomorrowClient(auth: Pick<GatewayAuthClient, 'request'>) {
  const pi = createPiClient(auth)
  return {
    /** The next 24 hours. Nothing is run or changed. */
    read: (signal?: AbortSignal): Promise<Tomorrow> => piData(pi.GET('/insights/tomorrow', { signal }), tomorrow),
  }
}

export type TomorrowClient = ReturnType<typeof createTomorrowClient>
