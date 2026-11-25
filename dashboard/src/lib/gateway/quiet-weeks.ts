import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { createPiClient, piData } from './pi-client'
import { GatewayError } from './transport'

/** What became of what Conker raised from one source in one week (Pi's Outcomes). */
const outcomes = z.object({ raised: z.number().int(), actedOn: z.number().int(), dismissed: z.number().int(), unanswered: z.number().int() }).strict()
/** One ISO week in the owner's zone, Monday to Monday (pi/agents/quiet_weeks.py defines every count). */
const week = z
  .object({
    week: z.string(),
    startsAt: z.number(),
    endsAt: z.number(),
    asks: z.number().int(),
    raised: z.number().int(),
    approvalsAsked: z.number().int(),
    pushed: z.number().int(),
    actedOn: z.number().int(),
    dismissed: z.number().int(),
    unanswered: z.number().int(),
    usefulShare: z.number().nullable(),
    suggestions: outcomes,
    questions: outcomes,
    changeRequests: outcomes,
    notices: outcomes,
  })
  .strict()
/** What Pi's GET /insights/quiet/weeks sends: oldest week first, the current (still running) week last. */
const quietWeeks = z.object({ schemaVersion: z.literal(1), timeZone: z.string(), weeks: z.array(week).max(26) }).strict()

export type QuietWeek = z.infer<typeof week>
export type QuietWeeks = z.infer<typeof quietWeeks>

/** The Inbox shows the last 8 weeks, as `conker quiet` does by default. */
export const QUIET_WEEKS = 8

/** True when the server's Pi predates the route: it answers 404 until the next Conker update. */
export const quietUnsupported = (error: unknown) => error instanceof GatewayError && error.kind === 'http' && error.status === 404

const asks = (count: number) => (count === 0 ? 'no asks' : `${count} ${count === 1 ? 'ask' : 'asks'}`)
/** "40% useful", or nothing when Pi had nothing he could act on (its share is null then). */
export const usefulWords = (share: number | null) => (share === null ? null : `${Math.round(share * 100)}% useful`)
const counted = (item: QuietWeek) => [asks(item.asks), usefulWords(item.usefulShare)].filter(Boolean).join(', ')

/**
 * The one line the Inbox shows: the last full week against the one before, in `conker quiet`'s words.
 * Empty until a full week holds an ask: Pi counts weeks before Conker ran as zeros.
 */
export function quietSummary(page: QuietWeeks): { state: 'empty' } | { state: 'ready'; line: string } {
  const full = page.weeks.slice(0, -1)
  const last = full.at(-1)
  if (!last || full.every(item => item.asks === 0)) return { state: 'empty' }
  const before = full.at(-2)
  return { state: 'ready', line: `Last full week: ${counted(last)}${before ? ` (the week before: ${counted(before)})` : ''}` }
}

/** What became of one week's asks, in plain words; counts of zero are left out. */
export function weekDetails(item: QuietWeek) {
  const parts: [number, string][] = [
    [item.actedOn, 'acted on'],
    [item.dismissed, 'dismissed'],
    [item.unanswered, 'unanswered'],
    [item.approvalsAsked, item.approvalsAsked === 1 ? 'approval' : 'approvals'],
    [item.pushed, 'sent as notifications'],
  ]
  return parts
    .filter(([count]) => count > 0)
    .map(([count, words]) => `${count} ${words}`)
    .join(' · ')
}

export function createQuietWeeksClient(auth: Pick<GatewayAuthClient, 'request'>) {
  const pi = createPiClient(auth)
  return {
    /** The last `weeks` ISO weeks (1 to 26). Read only: counts, never his words. */
    read: (weeks: number = QUIET_WEEKS, signal?: AbortSignal): Promise<QuietWeeks> => {
      if (!Number.isInteger(weeks) || weeks < 1 || weeks > 26) return Promise.reject(new GatewayError('validation'))
      return piData(pi.GET('/insights/quiet/weeks', { params: { query: { weeks } }, signal }), quietWeeks)
    },
  }
}

export type QuietWeeksClient = ReturnType<typeof createQuietWeeksClient>
