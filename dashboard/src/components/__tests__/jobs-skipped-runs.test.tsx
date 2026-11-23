import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GatewayJobsWorkspace } from '@/components/gateway/jobs-workspace'
import type { GatewayControlClient } from '@/lib/gateway/control'
import type { GatewayJob, GatewayScheduledRun } from '@/lib/gateway/jobs'
import { skippedRunLabel } from '@/lib/gateway/job-run-words'

afterEach(() => cleanup())

const CHECK_IN = 'job_beca06ba345a8b3170a4d8e2473fe00f'
const job: GatewayJob = {
  schemaVersion: 1,
  id: CHECK_IN,
  revision: 1,
  createdAt: 1,
  nextAt: 2,
  authority: 'none',
  contentIncluded: false,
  execution: 'not-triggered',
  definition: {
    name: 'Morning check-in',
    instructionsConfigured: true,
    agentId: 'companion',
    createdBy: 'conker',
    timing: { kind: 'daily', time: '08:00', day: 0, hours: 24 },
    timeZone: 'UTC',
    enabled: true,
    state: 'enabled',
    target: { kind: 'agent', sessionId: null },
    overlap: 'skip',
    requireBudget: false,
    budgetAllowanceConfigured: false,
  },
}
const run = (id: string, startedAt: number, status: GatewayScheduledRun['status'], outcomeCode: string | null): GatewayScheduledRun => ({
  schemaVersion: 1,
  id: `scheduled_${id.repeat(32)}`,
  jobId: CHECK_IN,
  jobRevision: 1,
  scheduledAt: startedAt,
  startedAt,
  status,
  manual: false,
  budgetBound: false,
  receiptRecorded: true,
  outcomeCode,
  authority: 'none',
  contentIncluded: false,
  execution: 'resolved',
})

function show(runs: GatewayScheduledRun[]) {
  const jobs = { list: vi.fn().mockResolvedValue({ schemaVersion: 1, results: [job], nextCursor: null }), get: vi.fn().mockResolvedValue(job), runs: vi.fn().mockResolvedValue({ schemaVersion: 1, results: runs, nextCursor: null }) }
  render(
    <MemoryRouter initialEntries={[`/jobs/${CHECK_IN}`]}>
      <GatewayJobsWorkspace control={{ jobs } as unknown as GatewayControlClient} />
    </MemoryRouter>,
  )
}

describe('skipped job runs', () => {
  it('names the limit that held a run back, and is never a failure', async () => {
    show([run('a', 300, 'skipped', 'QUIET_HOURS'), run('b', 200, 'skipped', 'OVER_BUDGET'), run('c', 100, 'skipped', 'PROACTIVITY_OFF')])
    expect(await screen.findByText('Skipped: quiet hours')).not.toBeNull()
    expect(screen.getByText('Skipped: daily limit reached')).not.toBeNull()
    expect(screen.getByText('Skipped: proactive work off')).not.toBeNull()
    expect(screen.queryByText('The last run failed')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText('QUIET_HOURS')).toBeNull()
  })

  it('still says so when the newest run did fail', async () => {
    show([run('a', 300, 'failed', null), run('b', 200, 'skipped', 'QUIET_HOURS')])
    expect(await screen.findByText('The last run failed')).not.toBeNull()
  })

  it('says in one line what the built-in Morning check-in does, beside its Pause', async () => {
    show([])
    expect(await screen.findByText(/Built in: daily at 08:00, Conker looks at what needs you today.*quiet hours/)).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Pause schedule' })).not.toBeNull()
  })

  it('falls back to plain words for a code it does not know', () => {
    expect(skippedRunLabel('SOMETHING_NEW')).toBe('Skipped: your limits')
    expect(skippedRunLabel(null)).toBe('Skipped: your limits')
  })
})
