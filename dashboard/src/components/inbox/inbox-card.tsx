import { useId, useState, type ReactNode } from 'react'
import { ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { shownTime } from '@/lib/shown-time'
import { useTimeStyle } from '@/components/use-time-style'
import { useServerSetting } from '@/settings/server-setting'

/** One line under "Advanced": a label and its value (when it came, from whom, which chat). */
export type InboxFact = readonly [label: string, value: ReactNode]

/**
 * One Inbox item (owner, 31 October; Willow-style). Folded, it is one glance: the mark, a short
 * title, a muted "source · subject" line, the one answer that settles it (`primary`) and an X for
 * "not now". Tapping it opens the item in place: the main thing first (`summary`, then `children`),
 * every answer (`actions`), and last an "Advanced ›" fold with the record (`facts`, `advanced`) that
 * nobody needs to decide. Every kind of item uses this one layout, never a side window. `came` adds
 * when it arrived to the source line, as Settings > Appearance > Times shows times (or not at all).
 */
export function InboxCard({
  icon,
  title,
  source,
  came,
  primary,
  openLabel,
  summary,
  actions,
  facts = [],
  advanced,
  onLater,
  laterLabel = 'Later',
  defaultExpanded = false,
  children,
  footer,
  className,
}: {
  icon: ReactNode
  title: string
  source: ReactNode
  came?: { at: number; now: number }
  primary?: ReactNode
  openLabel?: string
  summary?: ReactNode
  actions?: ReactNode
  facts?: readonly InboxFact[]
  advanced?: ReactNode
  onLater?: () => void
  laterLabel?: string
  defaultExpanded?: boolean
  children?: ReactNode
  footer?: ReactNode
  className?: string
}) {
  // Settings > Inbox > Exact details open: every card starts open, its details and every answer in view.
  // Until he opens or folds a card himself, it follows the setting, also when the setting arrives late.
  const detailsOpen = useServerSetting('inbox.details_open', false)
  const [chosen, setExpanded] = useState<boolean | null>(null),
    expanded = chosen ?? (defaultExpanded || detailsOpen),
    [more, setMore] = useState(false)
  const body = useId(),
    record = useId()
  const style = useTimeStyle()
  const arrived = came ? shownTime(came.at, came.now, style) : null
  // Folded, the one answer sits beside the title; `openLabel` is an answer that needs the card open (typing a reply).
  const answer =
    primary ??
    (openLabel && (
      <Button type="button" size="sm" variant="outline" onClick={() => setExpanded(true)}>
        {openLabel}
      </Button>
    ))
  return (
    <Card render={<article aria-label={title} />} className={cn('min-w-0 gap-0 p-0', className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 p-3 sm:flex-nowrap">
        <button
          type="button"
          className="flex min-h-11 min-w-0 flex-1 basis-48 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={expanded}
          aria-controls={body}
          onClick={() => setExpanded(!expanded)}
        >
          <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground [&_svg]:size-4">
            {icon}
          </span>
          <span className="min-w-0 flex-1">
            <h3 className={cn('font-medium leading-5 [overflow-wrap:anywhere]', !expanded && 'line-clamp-2')}>{title}</h3>
            <span className="mt-0.5 block truncate text-xs leading-5 text-muted-foreground">
              {source}
              {arrived && <> · {arrived}</>}
            </span>
          </span>
        </button>
        {!expanded && answer && <div className="order-last flex w-full shrink-0 justify-end pl-12 sm:order-none sm:w-auto sm:pl-0">{answer}</div>}
        {onLater && (
          <Button type="button" size="icon" variant="ghost" className="shrink-0 text-muted-foreground" aria-label={`${laterLabel}: ${title}`} title={laterLabel} onClick={onLater}>
            <X />
          </Button>
        )}
      </div>
      {expanded && (
        <div id={body} className="flex min-w-0 flex-col gap-4 px-4 pb-4 text-sm leading-6 [overflow-wrap:anywhere] sm:pl-15">
          {summary && <p className="whitespace-pre-wrap">{summary}</p>}
          {children}
          {actions && <div className="flex min-w-0 flex-col gap-3">{actions}</div>}
          {(facts.length > 0 || advanced) && (
            <div className="flex min-w-0 flex-col gap-3">
              <button
                type="button"
                className="tap-44 group inline-flex w-fit items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                aria-expanded={more}
                aria-controls={record}
                onClick={() => setMore(value => !value)}
              >
                Advanced
                <ChevronRight aria-hidden="true" className={cn('size-3.5 transition-transform motion-reduce:transition-none', more && 'rotate-90')} />
              </button>
              {more && (
                <div id={record} className="flex min-w-0 flex-col gap-3 text-xs leading-5 text-muted-foreground">
                  {facts.length > 0 && (
                    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
                      {facts.map(([label, value]) => (
                        <div key={label} className="contents">
                          <dt>{label}</dt>
                          <dd className="min-w-0 break-words text-foreground">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {advanced}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {footer && <div className="border-t px-4 py-2.5 sm:pl-15">{footer}</div>}
    </Card>
  )
}
