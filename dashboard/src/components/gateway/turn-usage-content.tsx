import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { usageFields, type TurnUsage, type UsageAttempt, type UsageField, type UsageLane } from '@/lib/gateway/turn-usage'
import type { TurnUsageProps } from './turn-usage-disclosure'
import { startTurnUsageRead, type UsageRead } from './turn-usage-read'

const labels: Record<UsageField, string> = { input_tokens: 'Input tokens', output_tokens: 'Output tokens', cached_tokens: 'Cached tokens', cost_usd: 'Reported cost', summed_call_ms: 'Summed call time' }
const roles: Record<UsageAttempt['role'], string> = { answer: 'Answer', thinking: 'Thinking', routing: 'Model selection', 'context-selection': 'Context selection', summarization: 'Summarization', 'memory-ranking': 'Memory ranking', 'search-ranking': 'Search ranking', proposals: 'Proposals' }
const failures: Record<NonNullable<UsageAttempt['failure_kind']>, string> = { provider_error: 'Provider error', cancelled: 'Canceled', timeout: 'Timed out', preempted: 'Yielded capacity', interrupted: 'Interrupted' }
function duration(value: number) { return value < 1000 ? `${value.toLocaleString()} ms` : `${(value / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} s` }
function amount(field: UsageField, value: number | null) {
  if (value === null) return 'Not reported'
  if (field === 'summed_call_ms') return duration(value)
  if (field === 'cost_usd') return value > 0 && value < 0.0001 ? '< $0.0001' : `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
  return value.toLocaleString()
}
function Lane({ name, summary, attempts }: { name: string; summary: UsageLane; attempts: UsageAttempt[] }) {
  return <section className="min-w-0 space-y-3 border-t pt-3" aria-label={`${name} usage`}>
    <div><h4 className="font-medium text-foreground">{name}</h4><p className="text-muted-foreground">{summary.attempt_count ? `${summary.attempt_count} recorded ${summary.attempt_count === 1 ? 'call' : 'calls'}${summary.pending_count ? ` · ${summary.pending_count} awaiting report` : ''}${summary.failed_count ? ` · ${summary.failed_count} failed` : ''}` : 'No recorded calls'}</p></div>
    {summary.attempt_count > 0 && <>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">{usageFields.map(field => {
        const known = summary.attempt_count > summary.unknown_counts[field], complete = summary.complete[field]
        const overflow = summary.known_subtotal[field] === null
        return <div key={field} className="min-w-0"><dt className="text-muted-foreground">{labels[field]}{complete ? ' · total' : known && !overflow ? ' · known subtotal' : ''}</dt><dd className="break-words font-medium tabular-nums text-foreground">{overflow ? 'Unavailable' : amount(field, complete ? summary.totals[field] : known ? summary.known_subtotal[field] : null)}</dd>{overflow && <dd className="text-muted-foreground">Recorded values exceed display limits</dd>}{summary.unknown_counts[field] > 0 && <dd className="text-muted-foreground">{summary.unknown_counts[field]} {summary.unknown_counts[field] === 1 ? 'call did' : 'calls did'} not report this</dd>}</div>
      })}</dl>
      <ol className="space-y-2">{attempts.map(row => <li key={row.id}><details className="min-w-0 rounded-md border px-3 py-2"><summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ring"><span className="break-words font-medium text-foreground">{roles[row.role]} · {row.actual_model ?? `${row.model} (requested)`}</span><span className="mt-1 block text-muted-foreground">{row.status === 'pending' ? 'Outcome unrecorded' : row.status === 'failed' ? row.failure_kind ? failures[row.failure_kind] : 'Failed' : 'Result reported'} · {row.elapsed_ms === null ? 'Duration not reported' : duration(row.elapsed_ms)}</span></summary>
        <dl className="mt-3 space-y-2 border-t pt-3">{[
          ['Configured provider / model', `${row.provider_id ?? 'Not recorded'} / ${row.model_id ?? 'Not recorded'}`],
          ['Requested adapter / route', `${row.provider} / ${row.model}`],
          ['Reported provider / model', `${row.actual_provider ?? 'Not reported'} / ${row.actual_model ?? 'Not reported'}`],
          ['Input / output tokens', `${amount('input_tokens', row.input_tokens)} / ${amount('output_tokens', row.output_tokens)}`],
          ['Cached tokens', amount('cached_tokens', row.cached_tokens)], ['Reported cost', amount('cost_usd', row.cost_usd)],
        ].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="break-words text-foreground">{value}</dd></div>)}</dl>
      </details></li>)}</ol>
    </>}
  </section>
}

export function TurnUsageReport({ usage }: { usage: TurnUsage }) {
  return <div className="min-w-0 space-y-4">
    {usage.coverage === 'legacy_partial' && <p className="text-muted-foreground">Older work has incomplete call records. Known subtotals do not cover the full turn.</p>}
    <Lane name="Conversation" summary={usage.foreground} attempts={usage.attempts.filter(row => row.lane === 'foreground')} />
    <Lane name="Background thinking" summary={usage.thinking} attempts={usage.attempts.filter(row => row.lane === 'thinking')} />
    <p className="text-muted-foreground">Time is summed across provider calls, which may overlap. Costs are provider-reported; missing values are not estimated. A reported result does not confirm that an answer was published.</p>
    <p className="text-muted-foreground">These records cover calls after the turn starts. Earlier context preparation, fork summaries and work outside this turn are excluded.</p>
    {usage.attempts_truncated && <p className="text-muted-foreground">Showing the latest 100 calls. Summaries cover all recorded calls.</p>}
  </div>
}

export function TurnUsageContent({ client, turnId, sessionId, sourcePrivacy, refreshKey }: TurnUsageProps) {
  const [read, setRead] = useState<UsageRead>({ status: 'loading' }), [revision, setRevision] = useState(0)
  useEffect(() => {
    const request = startTurnUsageRead(client, turnId, sessionId, () => !sourcePrivacy.getState().sessionIds.includes(sessionId), setRead)
    return request.cancel
  }, [client, turnId, sessionId, sourcePrivacy, refreshKey, revision])
  return <div className="min-w-0 space-y-3 py-3 text-xs">
    {read.status === 'loading' ? <p role="status" className="text-muted-foreground">Loading usage…</p> : read.status === 'error' ? <p role="alert" className="text-muted-foreground">{read.message}</p> : <TurnUsageReport usage={read.usage} />}
    {read.status !== 'loading' && !(read.status === 'error' && read.unavailable) && <Button variant="outline" size="sm" onClick={() => setRevision(value => value + 1)}>{read.status === 'error' ? 'Retry usage read' : 'Refresh usage'}</Button>}
  </div>
}
