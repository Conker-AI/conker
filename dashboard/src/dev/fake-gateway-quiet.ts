/**
 * Development-only weekly counts (Pi's GET /insights/quiet/weeks shape, pi/agents/quiet_weeks.py).
 * Pick a state with `?preview-quiet=`: weeks (default), empty (no asks yet), unsupported (an older
 * Pi answers 404) or failing (the read fails).
 */
type Json = Record<string, unknown>

const DAY = 86400
// Per week, oldest first, this week last: suggestions, questions, change requests and notices as
// [raised, acted on, dismissed], then approvals asked and pushes. What is left is unanswered.
const SEED: [[number, number, number], [number, number, number], [number, number, number], [number, number, number], number, number][] = [
  [[6, 2, 3], [4, 3, 0], [3, 1, 1], [5, 0, 4], 6, 9],
  [[5, 2, 2], [4, 3, 1], [2, 1, 1], [4, 0, 3], 5, 8],
  [[5, 3, 2], [3, 2, 0], [2, 2, 0], [4, 0, 4], 5, 7],
  [[4, 2, 2], [3, 3, 0], [2, 1, 0], [3, 0, 2], 4, 6],
  [[4, 3, 1], [2, 2, 0], [1, 1, 0], [3, 0, 3], 3, 5],
  [[3, 2, 1], [2, 1, 1], [1, 1, 0], [2, 0, 2], 3, 4],
  [[3, 2, 0], [2, 2, 0], [1, 1, 0], [2, 0, 1], 2, 3],
  [[1, 0, 0], [1, 1, 0], [0, 0, 0], [1, 0, 0], 1, 1],
]
const ZERO: (typeof SEED)[number] = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], 0, 0]

const outcome = ([raised, actedOn, dismissed]: [number, number, number]) => ({ raised, actedOn, dismissed, unanswered: raised - actedOn - dismissed })

/** Monday 00:00 UTC of the current week, as Pi counts weeks in the owner's zone (UTC here). */
function monday(now: number) {
  const day = Math.floor(now / DAY)
  return (day - ((day + 3) % 7)) * DAY // 1970-01-01 was a Thursday
}

function isoWeek(starts: number) {
  const thursday = new Date((starts + 3 * DAY) * 1000),
    year = thursday.getUTCFullYear()
  const number = 1 + Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / (7 * DAY * 1000))
  return `${year}-W${String(number).padStart(2, '0')}`
}

export function fakeQuietWeeks(path: string, method: string, query: Record<string, unknown> | undefined, fail: (status: number) => never): Json | undefined {
  if (path !== '/api/control/pi/insights/quiet/weeks' || method !== 'GET') return undefined
  const scenario = new URLSearchParams(globalThis.location?.search).get('preview-quiet')
  if (scenario === 'unsupported') fail(404)
  if (scenario === 'failing') fail(503)
  const count = Number(query?.weeks ?? 8),
    first = monday(Date.now() / 1000) - (count - 1) * 7 * DAY
  const weeks = Array.from({ length: count }, (_, index) => {
    const [s, q, c, n, approvalsAsked, pushed] = scenario === 'empty' && index < count - 1 ? ZERO : SEED[(index - count + 26 * SEED.length) % SEED.length]
    const sources = { suggestions: outcome(s), questions: outcome(q), changeRequests: outcome(c), notices: outcome(n) }
    const all = Object.values(sources),
      raised = all.reduce((sum, item) => sum + item.raised, 0),
      actedOn = all.reduce((sum, item) => sum + item.actedOn, 0)
    const answerable = sources.suggestions.raised + sources.questions.raised + sources.changeRequests.raised,
      startsAt = first + index * 7 * DAY
    return {
      week: isoWeek(startsAt),
      startsAt,
      endsAt: startsAt + 7 * DAY,
      asks: raised + approvalsAsked,
      raised,
      approvalsAsked,
      pushed,
      actedOn,
      dismissed: all.reduce((sum, item) => sum + item.dismissed, 0),
      unanswered: all.reduce((sum, item) => sum + item.unanswered, 0),
      usefulShare: answerable ? Math.round((actedOn / answerable) * 1000) / 1000 : null,
      ...sources,
    }
  })
  return { schemaVersion: 1, timeZone: 'UTC', weeks }
}
