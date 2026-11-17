/**
 * Which team runs were opened in this browser, newest first. Pi has no list of runs: a run is read by
 * its id, so the ids this browser has seen are the only list there can be. Ids and times only; a run
 * shows only while Pi still answers for it. A convenience: losing it loses nothing.
 */
const KEY = 'conker.team-runs'
export const TEAM_RUN_ID = /^teamrun_[0-9a-f]{32}$/
export const TEAM_RUNS_LIMIT = 12

export type OpenedTeamRun = { id: string; at: number }

export function readOpenedTeamRuns(): OpenedTeamRun[] {
  try {
    const value: unknown = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.filter((item): item is OpenedTeamRun => !!item && typeof item === 'object' && typeof item.id === 'string' && TEAM_RUN_ID.test(item.id)
      && typeof item.at === 'number' && Number.isFinite(item.at) && item.at > 0).slice(0, TEAM_RUNS_LIMIT)
  } catch { return [] }
}

export function rememberTeamRun(id: string, at = Date.now()): OpenedTeamRun[] {
  if (!TEAM_RUN_ID.test(id)) return readOpenedTeamRuns()
  const next = [{ id, at }, ...readOpenedTeamRuns().filter(item => item.id !== id)].slice(0, TEAM_RUNS_LIMIT)
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(next)) }
  catch { /* Private windows and blocked storage: the list lasts until the page closes. */ }
  return next
}

export function forgetTeamRun(id: string): OpenedTeamRun[] {
  const next = readOpenedTeamRuns().filter(item => item.id !== id)
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(next)) }
  catch { /* Nothing to keep. */ }
  return next
}
