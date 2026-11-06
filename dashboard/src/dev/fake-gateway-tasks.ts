/**
 * Development-only tasks for the preview Activity list: a few recorded tasks in every state, one
 * archived, and archive/restore guarded by the expected revision like Pi.
 */
type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST' | 'PUT'; body?: Json; query?: Record<string, string | number | boolean | readonly string[]> }

const SEED: [string, string, string, number, boolean][] = [
  ['Plan the week around the judo tournament', 'in_progress', `ses_${'1'.repeat(16)}`, 3600, false],
  ['Book the dentist before the school trip', 'planned', `ses_${'2'.repeat(16)}`, 7200, false],
  ['Find a training partner for Thursdays', 'blocked', `ses_${'3'.repeat(16)}`, 20000, false],
  ['Send the science project outline', 'completed', `ses_${'1'.repeat(16)}`, 90000, false],
  ['Compare two running shoes', 'cancelled', `ses_${'2'.repeat(16)}`, 180000, false],
  ['Renew the library card', 'completed', `ses_${'3'.repeat(16)}`, 400000, true],
]

export function createFakeTasks(now: () => number, fail: (status: number) => never) {
  const tasks: Json[] = SEED.map(([outcome, status, sessionId, age, archived], index) => {
    const id = `task_preview_${index + 1}`, at = now() - age
    return { id, outcome, criteria: [{ id: `crit_${index + 1}`, text: 'The owner says it is done.' }], session_id: sessionId, agent_id: 'companion',
      parent_task_id: null, run_ids: [], status, status_source: 'owner', provenance: 'recorded', revision: 1, created_at: at - 600, updated_at: at,
      archived_at: archived ? at : null, status_note: '', completed_criterion_ids: status === 'completed' ? [`crit_${index + 1}`] : [],
      content_status: 'available', changes: [], changes_truncated: false }
  })
  return function handle(path: string, method: 'GET' | 'POST' | 'PUT', options: Request): Json | undefined {
    let match: RegExpMatchArray | null
    if (path === '/api/pi/tasks' && method === 'GET') {
      const session = options.query?.session_id
      return { results: tasks.filter(task => session === undefined || task.session_id === session), next_cursor: null }
    }
    if ((match = path.match(/^\/api\/pi\/tasks\/([^/]+)$/)) && method === 'GET') return tasks.find(task => task.id === match![1]) ?? fail(404)
    if ((match = path.match(/^\/api\/pi\/tasks\/([^/]+)\/archive$/)) && method === 'POST') {
      const task = tasks.find(item => item.id === match![1]) ?? fail(404)
      if (options.body?.expected_revision !== task.revision) fail(409)
      const archived = options.body?.archived === true
      Object.assign(task, { revision: Number(task.revision) + 1, archived_at: archived ? now() : null, updated_at: now() })
      return task
    }
    return undefined
  }
}
