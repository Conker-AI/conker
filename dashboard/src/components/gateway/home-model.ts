import type { GatewayActivityRun, GatewayTask } from '@/lib/gateway/activity'
import type { GatewayJob } from '@/lib/gateway/jobs'
import type { OwnerRequest } from '@/lib/gateway/owner'
import type { PlanUsage } from '@/lib/gateway/plans'
import type { Proposal } from '@/lib/gateway/proposals'

/** Days shown in the work chart. */
export const HOME_CHART_DAYS = 14
/** At most this many items needing him (rationale ledger: Items per glance). */
export const HOME_NEEDS_LIMIT = 3

export type HomeNeed =
  | { kind: 'decision'; id: string; title: string; detail: string; at: number; href: string }
  | { kind: 'idea'; id: string; title: string; detail: string; at: number; href: string }

export type HomeSnapshot = {
  needs: HomeNeed[]
  needsTotal: number
  decidedToday: number
  runsToday: number
  runDays: { day: number; count: number }[]
  /** True when the oldest loaded run is newer than the chart's first day, so early days may be short. */
  runDaysPartial: boolean
  coming: { id: string; name: string; at: number }[]
  completed: { id: string; title: string; at: number; today: boolean }[]
}

const startOfDay = (time: number) => { const date = new Date(time); date.setHours(0, 0, 0, 0); return date.getTime() }
const dayMs = 24 * 60 * 60 * 1000
const parse = (value: string | null) => value ? Date.parse(value) : Number.NaN

/** What Home shows, computed only from records the server returned; nothing is estimated. */
export function buildHome(input: {
  requests: OwnerRequest[]; proposals: Proposal[]; tasks: GatewayTask[]; runs: GatewayActivityRun[]; jobs: GatewayJob[]; runsComplete: boolean
}, now = Date.now()): HomeSnapshot {
  const today = startOfDay(now)
  const decisions: HomeNeed[] = input.requests.filter(item => item.status === 'pending' && item.reviewable)
    .map(item => ({ kind: 'decision' as const, id: item.id, title: item.title || 'Review this action', detail: item.details || `${item.actor} is waiting for your decision.`,
      at: parse(item.updatedAt), href: `/inbox?request=${encodeURIComponent(item.id)}` }))
  const ideas: HomeNeed[] = input.proposals.filter(item => item.state === 'open')
    .map(item => ({ kind: 'idea' as const, id: item.id, title: item.title, detail: item.suggestion, at: item.createdAt * 1000, href: '/inbox' }))
  // Decisions come before ideas: a decision blocks work, an idea waits politely.
  const needs = [...decisions.sort((a, b) => b.at - a.at), ...ideas.sort((a, b) => b.at - a.at)]
  const decidedToday = input.requests.filter(item => item.decision && item.decision.status !== 'pending' && parse(item.decision.at) >= today).length
    + input.proposals.filter(item => item.decidedAt !== null && item.decidedAt * 1000 >= today).length
  const ended = input.runs.map(run => parse(run.endedAt)).filter(time => Number.isFinite(time))
  const firstDay = today - (HOME_CHART_DAYS - 1) * dayMs
  const runDays = Array.from({ length: HOME_CHART_DAYS }, (_, index) => {
    const day = firstDay + index * dayMs
    return { day, count: ended.filter(time => time >= day && time < day + dayMs).length }
  })
  const oldest = input.runs.reduce((min, run) => Math.min(min, parse(run.startedAt)), Number.POSITIVE_INFINITY)
  return {
    needs: needs.slice(0, HOME_NEEDS_LIMIT),
    needsTotal: needs.length,
    decidedToday,
    runsToday: runDays.at(-1)?.count ?? 0,
    runDays,
    runDaysPartial: !input.runsComplete && oldest > firstDay,
    coming: input.jobs.filter(job => job.definition.enabled).map(job => ({ id: job.id, name: job.definition.name, at: job.nextAt * 1000 }))
      .filter(job => Number.isFinite(job.at)).sort((a, b) => a.at - b.at).slice(0, 3),
    completed: input.tasks.filter(item => item.contentStatus === 'available' && item.archivedAt === null && item.status === 'completed')
      .map(item => ({ id: item.id, title: item.outcome, at: parse(item.updatedAt), today: parse(item.updatedAt) >= today }))
      .sort((a, b) => b.at - a.at).slice(0, 5),
  }
}

/** At or past this share used, a window is close to its limit (Pi's default alert level). */
export const PLAN_NEAR_LIMIT = 80
/** Pi checks plans every 15 minutes; a reading older than an hour may be out of date. */
export const PLAN_STALE_MS = 60 * 60 * 1000
const names = { chatgpt: 'ChatGPT', claude: 'Claude' } as const

export type PlanRow = { key: string; name: string; usedPercent: number; resetsAt: number | null; near: boolean }
export type PlanState =
  | { status: 'loading' }
  | { status: 'failed'; error: unknown }
  /** The server is older than the plan usage route. */
  | { status: 'unsupported' }
  | { status: 'ready'; rows: PlanRow[]; checkedAt: number | null; stale: boolean }

/** One row per plan window, Claude first, with the oldest check deciding whether it may be stale. */
export function summarizePlans(usage: PlanUsage, now = Date.now()): PlanState {
  const rows = usage.windows.map(item => {
    const resets = item.resetsAt === null ? Number.NaN : Date.parse(item.resetsAt)
    return {
      key: `${item.provider}:${item.window}`, name: `${names[item.provider]} ${item.label}`, usedPercent: item.usedPercent,
      resetsAt: Number.isFinite(resets) && resets > now ? resets : null, near: item.usedPercent >= PLAN_NEAR_LIMIT,
    }
  }).sort((a, b) => Number(b.key.startsWith('claude:')) - Number(a.key.startsWith('claude:')))
  const checkedAt = usage.windows.length ? Math.min(...usage.windows.map(item => item.checkedAt * 1000)) : null
  return { status: 'ready', rows, checkedAt, stale: checkedAt !== null && now - checkedAt > PLAN_STALE_MS }
}
