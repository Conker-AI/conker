/** Development-only forecast (Pi's GET /insights/tomorrow): a few starts, some held, a watch and the ideas pass. `?preview-tomorrow=empty` shows an empty day. */
type Json = Record<string, unknown>

const HOUR = 3600
const SEED: [number | null, 'clock' | 'watch' | 'proposals', string | null, string, number | null, string | null][] = [
  [2, 'clock', `job_${'4'.repeat(32)}`, 'Morning calendar brief', null, null],
  [3, 'clock', `job_${'7'.repeat(32)}`, 'Watch my week', null, null],
  [5, 'clock', `job_${'7'.repeat(32)}`, 'Watch my week', null, 'RUN_LIMIT'],
  [9, 'proposals', null, 'Ideas pass', null, 'QUIET_HOURS'],
  [11, 'clock', `job_${'7'.repeat(32)}`, 'Watch my week', null, 'QUIET_HOURS'],
  [17, 'proposals', null, 'Ideas pass', null, null],
  [null, 'watch', `job_${'8'.repeat(32)}`, 'New grades on the school portal', 15, null],
]

export function fakeTomorrow(path: string, method: string): Json | undefined {
  if (path !== '/api/control/pi/insights/tomorrow' || method !== 'GET') return undefined
  const now = Math.floor(Date.now() / 1000 / HOUR) * HOUR,
    empty = new URLSearchParams(globalThis.location?.search).get('preview-tomorrow') === 'empty'
  const runs = empty ? [] : SEED.map(([offset, kind, jobId, name, everyMinutes, reason]) => ({ at: offset === null ? null : now + offset * HOUR, kind, jobId, name, everyMinutes, wouldRun: reason === null, reason }))
  return { schemaVersion: 1, since: now, until: now + 24 * HOUR, hours: 24, jobs: [], runsPlanned: runs.filter(run => run.kind === 'clock').length, approvals: [], timeZone: 'Asia/Jerusalem', runs }
}
