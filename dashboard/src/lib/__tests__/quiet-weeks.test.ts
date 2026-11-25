import { describe, expect, it } from 'vitest'
import { createQuietWeeksClient, quietSummary, quietUnsupported, usefulWords, weekDetails, type QuietWeek, type QuietWeeks } from '../gateway/quiet-weeks'
import { GatewayError } from '../gateway/transport'

const none = { raised: 0, actedOn: 0, dismissed: 0, unanswered: 0 }
const quietWeek = (over: Partial<QuietWeek> = {}): QuietWeek => ({
  week: '2026-W47',
  startsAt: 1763337600,
  endsAt: 1763942400,
  asks: 0,
  raised: 0,
  approvalsAsked: 0,
  pushed: 0,
  actedOn: 0,
  dismissed: 0,
  unanswered: 0,
  usefulShare: null,
  suggestions: none,
  questions: none,
  changeRequests: none,
  notices: none,
  ...over,
})
const page = (...weeks: QuietWeek[]): QuietWeeks => ({ schemaVersion: 1, timeZone: 'UTC', weeks })

function fakeAuth(answer: unknown) {
  const calls: { path: string; init: Record<string, unknown> }[] = []
  const request = async (path: string, init: Record<string, unknown> = {}) => {
    calls.push({ path, init })
    return answer
  }
  return { calls, auth: { request } as never }
}

describe('quiet weeks client', () => {
  const reply = page(quietWeek({ asks: 3, raised: 3, actedOn: 1, unanswered: 2, usefulShare: 0.5, suggestions: { raised: 2, actedOn: 1, dismissed: 0, unanswered: 1 }, notices: { raised: 1, actedOn: 0, dismissed: 0, unanswered: 1 } }))

  it('reads the weeks through the control route with the count as its query, and passes the signal on', async () => {
    const { auth, calls } = fakeAuth(reply)
    const signal = new AbortController().signal
    expect(await createQuietWeeksClient(auth).read(8, signal)).toEqual(reply)
    expect(calls).toEqual([{ path: '/api/control/pi/insights/quiet/weeks', init: { query: { weeks: 8 }, signal } }])
  })

  it('asks for 8 weeks when no count is given', async () => {
    const { auth, calls } = fakeAuth(reply)
    await createQuietWeeksClient(auth).read()
    expect(calls[0].init.query).toEqual({ weeks: 8 })
  })

  it('refuses a count Pi would refuse before anything is sent', async () => {
    const { auth, calls } = fakeAuth(reply)
    for (const weeks of [0, 27, 2.5]) await expect(createQuietWeeksClient(auth).read(weeks)).rejects.toMatchObject({ kind: 'validation' })
    expect(calls).toEqual([])
  })

  it('refuses a reply that is not what Pi sends', async () => {
    await expect(createQuietWeeksClient(fakeAuth({ ...reply, extra: true }).auth).read()).rejects.toMatchObject({ kind: 'invalid-response' })
    await expect(createQuietWeeksClient(fakeAuth(page({ ...quietWeek(), asks: 1.5 })).auth).read()).rejects.toMatchObject({ kind: 'invalid-response' })
  })

  it('knows an older server by its 404, and nothing else', () => {
    expect(quietUnsupported(new GatewayError('http', 404))).toBe(true)
    expect(quietUnsupported(new GatewayError('http', 500))).toBe(false)
    expect(quietUnsupported(new GatewayError('network'))).toBe(false)
    expect(quietUnsupported(new Error('404'))).toBe(false)
  })
})

describe('quiet summary', () => {
  const current = quietWeek({ week: '2026-W48', asks: 2 })

  it('compares the last full week with the one before, leaving out this week', () => {
    const summary = quietSummary(page(quietWeek({ asks: 15, usefulShare: 0.333 }), quietWeek({ asks: 12, usefulShare: 0.4 }), current))
    expect(summary).toEqual({ state: 'ready', line: 'Last full week: 12 asks, 40% useful (the week before: 15 asks, 33% useful)' })
  })

  it('says one ask, no asks, and leaves out "useful" when there was nothing to act on', () => {
    expect(quietSummary(page(quietWeek(), quietWeek({ asks: 1 }), current))).toEqual({ state: 'ready', line: 'Last full week: 1 ask (the week before: no asks)' })
  })

  it('has no comparison with a single full week', () => {
    expect(quietSummary(page(quietWeek({ asks: 4, usefulShare: 1 }), current))).toEqual({ state: 'ready', line: 'Last full week: 4 asks, 100% useful' })
  })

  it('is empty while no full week holds an ask, even when this week does', () => {
    expect(quietSummary(page(current))).toEqual({ state: 'empty' })
    expect(quietSummary(page(quietWeek(), quietWeek(), current))).toEqual({ state: 'empty' })
    expect(quietSummary(page())).toEqual({ state: 'empty' })
  })

  it('words a share and a week’s outcomes, leaving out zeros', () => {
    expect(usefulWords(null)).toBeNull()
    expect(usefulWords(0)).toBe('0% useful')
    expect(weekDetails(quietWeek())).toBe('')
    expect(weekDetails(quietWeek({ actedOn: 5, dismissed: 2, unanswered: 4, approvalsAsked: 3, pushed: 6 }))).toBe('5 acted on · 2 dismissed · 4 unanswered · 3 approvals · 6 sent as notifications')
    expect(weekDetails(quietWeek({ approvalsAsked: 1 }))).toBe('1 approval')
  })
})
