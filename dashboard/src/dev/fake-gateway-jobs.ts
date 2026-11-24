/**
 * Development-only cron job for the preview: one daily job with its run history, pause and resume,
 * manual runs replayed by request id, and run recovery actions.
 */
import { fakeTomorrow } from './fake-gateway-tomorrow'

type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST' | 'PUT'; body?: Json; query?: Record<string, string | number | boolean | readonly string[]> }

export function createFakeJobs(now: () => number, fail: (status: number) => never, next: () => number) {
  const jobId = `job_${'4'.repeat(32)}`
  const jobs: Json[] = [
    {
      schemaVersion: 1,
      id: jobId,
      revision: 2,
      createdAt: now() - 172800,
      nextAt: now() + 3600,
      definition: {
        name: 'Morning calendar brief',
        instructionsConfigured: true,
        agentId: 'companion',
        timing: { kind: 'daily', time: '07:30', day: 0, hours: 24 },
        timeZone: 'Asia/Jerusalem',
        enabled: true,
        state: 'enabled',
        target: { kind: 'tool', id: 'calendar.read', publishedVersion: 3, digest: '5'.repeat(64), inputsConfigured: true },
        overlap: 'skip',
        requireBudget: false,
        budgetAllowanceConfigured: false,
      },
      authority: 'none',
      contentIncluded: false,
      execution: 'not-triggered',
    },
  ]
  const jobRuns = new Map<string, Json[]>([
    [
      jobId,
      [
        {
          schemaVersion: 1,
          id: `scheduled_${'5'.repeat(32)}`,
          jobId,
          jobRevision: 2,
          scheduledAt: now() - 82800,
          startedAt: now() - 82800,
          status: 'completed',
          manual: false,
          budgetBound: false,
          receiptRecorded: true,
          outcomeCode: 'COMPLETED',
          authority: 'none',
          contentIncluded: false,
          execution: 'resolved',
        },
      ],
    ],
  ])
  // `?preview-jobs=failed`: the AI job "Morning news digest" (seeded with the AI jobs) has failed runs, the newest without a code.
  if (new URLSearchParams(globalThis.location?.search).get('preview-jobs') === 'failed') {
    const failed = (hoursAgo: number, outcomeCode: string | null): Json => ({
      schemaVersion: 1,
      id: `scheduled_${(hoursAgo + 6000).toString(16).padStart(32, '0')}`,
      jobId: `job_${'a'.repeat(32)}`,
      jobRevision: 1,
      scheduledAt: now() - hoursAgo * 3600,
      startedAt: now() - hoursAgo * 3600,
      status: 'failed',
      manual: false,
      budgetBound: false,
      receiptRecorded: false,
      outcomeCode,
      authority: 'none',
      contentIncluded: false,
      execution: 'resolved',
    })
    jobRuns.set(`job_${'a'.repeat(32)}`, [failed(2, null), failed(26, 'HELD_BACK')])
  }
  // `?preview-jobs=skipped`: the built-in Morning check-in, its newest runs skipped by quiet hours and the daily limit.
  if (new URLSearchParams(globalThis.location?.search).get('preview-jobs') === 'skipped') {
    const checkIn = 'job_beca06ba345a8b3170a4d8e2473fe00f'
    jobs.push({
      ...jobs[0],
      id: checkIn,
      revision: 1,
      nextAt: now() + 7200,
      definition: {
        name: 'Morning check-in',
        instructionsConfigured: true,
        agentId: 'companion',
        createdBy: 'conker',
        adoptedAt: null,
        turnedOff: null,
        timing: { kind: 'daily', time: '08:00', day: 0, hours: 24 },
        timeZone: 'Asia/Jerusalem',
        enabled: true,
        state: 'enabled',
        target: { kind: 'agent', sessionId: `ses_${'2'.repeat(16)}` },
        overlap: 'skip',
        requireBudget: false,
        budgetAllowanceConfigured: false,
      },
    })
    const run = (hoursAgo: number, status: string, outcomeCode: string | null): Json => ({
      schemaVersion: 1,
      id: `scheduled_${(hoursAgo + 7000).toString(16).padStart(32, '0')}`,
      jobId: checkIn,
      jobRevision: 1,
      scheduledAt: now() - hoursAgo * 3600,
      startedAt: now() - hoursAgo * 3600,
      status,
      manual: hoursAgo === 2,
      budgetBound: false,
      receiptRecorded: true,
      outcomeCode,
      authority: 'none',
      contentIncluded: false,
      execution: 'resolved',
    })
    jobRuns.set(checkIn, [run(2, 'skipped', 'QUIET_HOURS'), run(26, 'skipped', 'OVER_BUDGET'), run(50, 'completed', null)])
  }
  const manualJobRequests = new Map<string, Json>()
  return {
    jobs,
    handle(path: string, method: 'GET' | 'POST' | 'PUT', options: Request): Json | undefined {
      const forecast = fakeTomorrow(path, method)
      if (forecast) return forecast
      let match: RegExpMatchArray | null
      if ((match = path.match(/^\/api\/control\/pi\/jobs\/(job_[0-9a-f]{32})$/)) && method === 'GET') return jobs.find(item => item.id === match![1]) ?? fail(404)
      if ((match = path.match(/^\/api\/control\/pi\/jobs\/(job_[0-9a-f]{32})\/runs$/)) && method === 'GET') return { schemaVersion: 1, results: jobRuns.get(match![1]) ?? [], nextCursor: null }
      if ((match = path.match(/^\/api\/control\/pi\/jobs\/(job_[0-9a-f]{32})\/state$/)) && method === 'POST') {
        const item = jobs.find(row => row.id === match![1]) ?? fail(404)
        if (item.revision !== options.body?.expected_revision) fail(409)
        const definition = item.definition as Json,
          enabled = options.body?.enabled === true
        definition.enabled = enabled
        definition.state = enabled ? 'enabled' : 'paused'
        item.revision = Number(item.revision) + 1
        item.nextAt = now() + 3600
        return item
      }
      if ((match = path.match(/^\/api\/control\/pi\/jobs\/(job_[0-9a-f]{32})\/run$/)) && method === 'POST') {
        const item = jobs.find(row => row.id === match![1]) ?? fail(404),
          requestId = String(options.body?.request_id)
        const old = manualJobRequests.get(requestId)
        if (old) return { ...old, replayed: true }
        const run: Json = {
          schemaVersion: 1,
          id: `scheduled_${next().toString(16).padStart(32, '0')}`,
          jobId: item.id,
          jobRevision: item.revision,
          scheduledAt: now(),
          startedAt: now(),
          status: 'ready',
          manual: true,
          budgetBound: false,
          receiptRecorded: false,
          outcomeCode: null,
          authority: 'none',
          contentIncluded: false,
          execution: 'admitted-only',
        }
        ;(jobRuns.get(String(item.id)) ?? []).unshift(run)
        manualJobRequests.set(requestId, run)
        return { ...run, replayed: false }
      }
      if ((match = path.match(/^\/api\/control\/pi\/jobs\/runs\/(scheduled_[0-9a-f]{32})\/(provision-budget|cancel|resume|reconcile)$/)) && method === 'POST') {
        const run = [...jobRuns.values()].flat().find(item => item.id === match![1]) ?? fail(404),
          action = match[2]
        if (action === 'cancel') {
          run.status = 'cancelled'
          run.execution = 'resolved'
        }
        if (action === 'provision-budget') {
          run.status = 'ready'
          run.budgetBound = true
          run.execution = 'admitted-only'
        }
        if (action === 'resume') {
          run.status = 'dispatching'
          run.execution = 'dispatched'
        }
        if (action === 'reconcile') {
          run.status = 'completed'
          run.execution = 'resolved'
          run.receiptRecorded = true
          run.outcomeCode = 'COMPLETED'
        }
        return action === 'cancel' ? { ...run, replayed: false } : run
      }
      return undefined
    },
  }
}
