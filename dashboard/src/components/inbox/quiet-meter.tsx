import { useEffect, useState } from 'react'
import { InlineError } from '@/components/resilience/inline-error'
import { ListSkeleton } from '@/components/resilience/skeletons'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { QUIET_WEEKS, quietSummary, quietUnsupported, usefulWords, weekDetails, type QuietWeek, type QuietWeeks } from '@/lib/gateway/quiet-weeks'
import { cn } from '@/lib/utils'

export interface QuietMeterReader {
  read: (weeks?: number, signal?: AbortSignal) => Promise<QuietWeeks>
}

const OPEN_KEY = 'conker-inbox-quiet-open'
function remembered() {
  try {
    return localStorage.getItem(OPEN_KEY) === 'true'
  } catch {
    return false
  }
}
function remember(open: boolean) {
  try {
    localStorage.setItem(OPEN_KEY, String(open))
  } catch {
    /* It stays as chosen for this visit. */
  }
}

/** "Nov 16 – 22" in the owner's zone; a week ends at the next Monday 00:00, so its last day is a second before. */
function weekLabel(item: QuietWeek, timeZone: string) {
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  let format: Intl.DateTimeFormat
  try {
    format = new Intl.DateTimeFormat(undefined, { ...options, timeZone })
  } catch {
    format = new Intl.DateTimeFormat(undefined, options)
  }
  return format.formatRange(new Date(item.startsAt * 1000), new Date((item.endsAt - 1) * 1000))
}

function Week({ item, current, peak, timeZone }: { item: QuietWeek; current: boolean; peak: number; timeZone: string }) {
  const useful = usefulWords(item.usefulShare),
    details = weekDetails(item)
  return (
    <li className="py-2.5">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 text-sm text-foreground">
        <span className="min-w-0">{current ? 'This week, so far' : weekLabel(item, timeZone)}</span>
        <span className="shrink-0 tabular-nums">
          {item.asks} {item.asks === 1 ? 'ask' : 'asks'}
          {useful && <span className="text-muted-foreground"> · {useful}</span>}
        </span>
      </div>
      <div aria-hidden="true" className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full', current ? 'bg-muted-foreground' : 'bg-foreground/70')} style={{ width: `${peak ? Math.round((item.asks / peak) * 100) : 0}%` }} />
      </div>
      {details && <p className="mt-1 text-xs tabular-nums text-muted-foreground">{details}</p>}
    </li>
  )
}

function Weeks({ page }: { page: QuietWeeks }) {
  const peak = Math.max(0, ...page.weeks.map(item => item.asks))
  const newest = page.weeks.map((item, index) => ({ item, current: index === page.weeks.length - 1 })).reverse()
  return (
    <>
      <p className="max-w-prose leading-6">
        Is Conker getting quieter? The last {page.weeks.length} weeks, Monday to Sunday ({page.timeZone}).
      </p>
      <ul aria-label="Asks per week" className="mt-1 flex max-w-prose flex-col divide-y">
        {newest.map(({ item, current }) => (
          <Week key={item.week} item={item} current={current} peak={peak} timeZone={page.timeZone} />
        ))}
      </ul>
      <p className="mt-2 max-w-prose text-xs leading-5">Asks: the suggestions, questions, requests and notes Conker raised, plus approvals. Useful: how many you acted on, of the suggestions, questions and requests you could act on.</p>
    </>
  )
}

/**
 * Is Conker getting quieter? One line on the Inbox (the last full week against the one before), and
 * the last 8 weeks underneath. Read only, every number from Pi's GET /insights/quiet/weeks.
 */
export function QuietMeter({ client, active }: { client: QuietMeterReader; active: boolean }) {
  const [page, setPage] = useState<QuietWeeks | null>(null),
    [error, setError] = useState<unknown>(null),
    [attempt, setAttempt] = useState(0),
    [open, setOpen] = useState(remembered)
  useEffect(() => {
    if (!active) return
    const abort = new AbortController()
    client.read(QUIET_WEEKS, abort.signal).then(
      value => {
        if (abort.signal.aborted) return
        setPage(value)
        setError(null)
      },
      cause => {
        if (!abort.signal.aborted) setError(cause)
      },
    )
    return () => abort.abort()
  }, [client, active, attempt])
  const retry = () => {
    setError(null)
    setPage(null)
    setAttempt(value => value + 1)
  }
  const unsupported = error !== null && quietUnsupported(error)
  const summary = page ? quietSummary(page) : null
  const line = unsupported
    ? 'Asks per week: needs the next Conker update'
    : error !== null
      ? 'Asks per week didn’t load'
      : !summary
        ? 'Asks per week: loading…'
        : summary.state === 'empty'
          ? 'Asks per week: not enough weeks yet'
          : summary.line
  return (
    <Accordion
      value={open ? ['quiet'] : []}
      onValueChange={value => {
        const next = value.includes('quiet')
        setOpen(next)
        remember(next)
      }}
    >
      <AccordionItem value="quiet" className="border-b last:border-b">
        <AccordionTrigger>
          <span className={cn('min-w-0', !summary && !error && 'font-normal text-muted-foreground')}>{line}</span>
        </AccordionTrigger>
        <AccordionContent>
          {unsupported ? (
            <p className="max-w-prose leading-6">Your server runs a Conker that doesn’t count asks per week yet. These counts appear after the next update.</p>
          ) : error !== null ? (
            <InlineError error={error} title="Asks per week didn’t load" onRetry={retry} />
          ) : !page ? (
            <ListSkeleton rows={3} label="Loading asks per week…" />
          ) : (
            <>
              {summary?.state === 'empty' && <p className="mb-2 max-w-prose leading-6">Conker needs a full week with asks before it can compare one week with the next.</p>}
              <Weeks page={page} />
            </>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
