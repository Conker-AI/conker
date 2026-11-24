import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { InlineError } from '@/components/resilience/inline-error'
import { ListSkeleton } from '@/components/resilience/skeletons'
import type { GatewayControlClient } from '@/lib/gateway/control'
import { tomorrowReason, type Tomorrow, type TomorrowRun } from '@/lib/gateway/tomorrow'

function at(seconds: number, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(seconds * 1000))
}

function Line({ item, timeZone }: { item: TomorrowRun; timeZone: string }) {
  const when = item.at === null ? `Every ${item.everyMinutes} min` : at(item.at, timeZone)
  const name = item.jobId ? (
    <Link to={`/jobs/${item.jobId}`} className="font-medium underline-offset-4 hover:underline">
      {item.name}
    </Link>
  ) : (
    <span className="font-medium">{item.name}</span>
  )
  return (
    <li className="flex min-w-0 items-baseline gap-3 px-4 py-2.5 text-sm">
      <span className="w-24 shrink-0 tabular-nums text-muted-foreground">{when}</span>
      <span className="min-w-0 flex-1 break-words">
        {name}
        {item.kind === 'watch' && <span className="text-muted-foreground"> · when its tool has something new</span>}
        <span className={`block text-xs ${item.wouldRun ? 'text-muted-foreground' : 'text-foreground'}`}>{item.wouldRun ? 'Runs' : `Held: ${tomorrowReason(item.reason)}`}</span>
      </span>
    </li>
  )
}

/** What Conker will do on its own in the next 24 hours, and what would hold each start back. Read only. */
export function JobsTomorrow({ control }: { control: GatewayControlClient }) {
  const [page, setPage] = useState<Tomorrow | null>(null),
    [error, setError] = useState<unknown>(null),
    [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const abort = new AbortController()
    control.tomorrow.read(abort.signal).then(setPage, cause => {
      if (!abort.signal.aborted) setError(cause)
    })
    return () => abort.abort()
  }, [control, attempt])
  return (
    <section aria-labelledby="jobs-tomorrow-heading" className="space-y-3 pt-2">
      <div>
        <h2 id="jobs-tomorrow-heading" className="text-base font-semibold">
          Tomorrow
        </h2>
        <p className="mt-1 max-w-prose text-sm leading-6 text-muted-foreground">What Conker will start on its own in the next 24 hours{page ? ` (${page.timeZone})` : ''}, and what would hold a start back.</p>
      </div>
      {error ? (
        <InlineError
          error={error}
          title="Tomorrow didn’t load"
          onRetry={() => {
            setError(null)
            setPage(null)
            setAttempt(value => value + 1)
          }}
        />
      ) : !page ? (
        <ListSkeleton rows={2} label="Loading tomorrow…" />
      ) : (
        <Card className="min-w-0 gap-0 overflow-hidden p-0">
          {page.runs.length ? (
            <ul className="flex flex-col divide-y">
              {page.runs.map((item, index) => (
                <Line key={`${item.kind}-${item.jobId ?? ''}-${item.at ?? index}`} item={item} timeZone={page.timeZone} />
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-sm text-muted-foreground">Nothing planned for the next 24 hours.</p>
          )}
        </Card>
      )}
    </section>
  )
}
