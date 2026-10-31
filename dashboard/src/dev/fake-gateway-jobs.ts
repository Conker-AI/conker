/**
 * Development-only cron job for the preview: one daily job with its run history, pause and resume,
 * manual runs replayed by request id, and run recovery actions.
 */
type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST' | 'PUT'; body?: Json; query?: Record<string, string | number | boolean> }

export function createFakeJobs(now: () => number, fail: (status: number) => never, next: () => number) {
  const jobId = `job_${'4'.repeat(32)}`
  const jobs: Json[] = [{
    schemaVersion: 1, id: jobId, revision: 2, createdAt: now() - 172800, nextAt: now() + 3600,
    definition: {
      name: 'Morning calendar brief', instructionsConfigured: true, agentId: 'companion',
      timing: { kind: 'daily', time: '07:30', day: 0, hours: 24 }, timeZone: 'Asia/Jerusalem', enabled: true, state: 'enabled',
      target: { kind: 'tool', id: 'calendar.read', publishedVersion: 3, digest: '5'.repeat(64), inputsConfigured: true },
      overlap: 'skip', requireBudget: false, budgetAllowanceConfigured: false,
    },
    authority: 'none', contentIncluded: false, execution: 'not-triggered',
  }]
  const jobRuns = new Map<string, Json[]>([[jobId, [{
    schemaVersion: 1, id: `scheduled_${'5'.repeat(32)}`, jobId, jobRevision: 2, scheduledAt: now() - 82800, startedAt: now() - 82800,
    status: 'completed', manual: false, budgetBound: false, receiptRecorded: true, outcomeCode: 'COMPLETED',
    authority: 'none', contentIncluded: false, execution: 'resolved',
  }]]])
  const manualJobRequests = new Map<string, Json>()
  return { jobs, handle(path: string, method: 'GET' | 'POST' | 'PUT', options: Request): Json | undefined {
    let match: RegExpMatchArray | null
    if ((match = path.match(/^\/api\/control\/pi\/jobs\/(job_[0-9a-f]{32})$/)) && method === 'GET') return jobs.find(item => item.id === match![1]) ?? fail(404)
    if ((match = path.match(/^\/api\/control\/pi\/jobs\/(job_[0-9a-f]{32})\/runs$/)) && method === 'GET') return { schemaVersion: 1, results: jobRuns.get(match![1]) ?? [], nextCursor: null }
    if ((match = path.match(/^\/api\/control\/pi\/jobs\/(job_[0-9a-f]{32})\/state$/)) && method === 'POST') {
      const item = jobs.find(row => row.id === match![1]) ?? fail(404)
      if (item.revision !== options.body?.expected_revision) fail(409)
      const definition = item.definition as Json, enabled = options.body?.enabled === true
      definition.enabled = enabled; definition.state = enabled ? 'enabled' : 'paused'; item.revision = Number(item.revision) + 1; item.nextAt = now() + 3600
      return item
    }
    if ((match = path.match(/^\/api\/control\/pi\/jobs\/(job_[0-9a-f]{32})\/run$/)) && method === 'POST') {
      const item = jobs.find(row => row.id === match![1]) ?? fail(404), requestId = String(options.body?.request_id)
      const old = manualJobRequests.get(requestId)
      if (old) return { ...old, replayed: true }
      const run: Json = { schemaVersion: 1, id: `scheduled_${next().toString(16).padStart(32, '0')}`, jobId: item.id, jobRevision: item.revision, scheduledAt: now(), startedAt: now(), status: 'ready', manual: true, budgetBound: false, receiptRecorded: false, outcomeCode: null, authority: 'none', contentIncluded: false, execution: 'admitted-only' }
      ;(jobRuns.get(String(item.id)) ?? []).unshift(run); manualJobRequests.set(requestId, run)
      return { ...run, replayed: false }
    }
    if ((match = path.match(/^\/api\/control\/pi\/jobs\/runs\/(scheduled_[0-9a-f]{32})\/(provision-budget|cancel|resume|reconcile)$/)) && method === 'POST') {
      const run = [...jobRuns.values()].flat().find(item => item.id === match![1]) ?? fail(404), action = match[2]
      if (action === 'cancel') { run.status = 'cancelled'; run.execution = 'resolved' }
      if (action === 'provision-budget') { run.status = 'ready'; run.budgetBound = true; run.execution = 'admitted-only' }
      if (action === 'resume') { run.status = 'dispatching'; run.execution = 'dispatched' }
      if (action === 'reconcile') { run.status = 'completed'; run.execution = 'resolved'; run.receiptRecorded = true; run.outcomeCode = 'COMPLETED' }
      return action === 'cancel' ? { ...run, replayed: false } : run
    }
    return undefined
  } }
}
