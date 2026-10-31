import { useId, useState, type ReactNode } from 'react'
import { ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/** One line under "Advanced": a label and its value (when it came, from whom, which chat). */
export type InboxFact = readonly [label: string, value: ReactNode]

/**
 * One Inbox item (owner, 31 October; Willow-style). Folded, it is one glance: the mark, a short
 * title, a muted "source · subject" line, the one answer that settles it (`primary`) and an X for
 * "not now". Tapping it opens the item in place: the main thing first (`summary`, then `children`),
 * every answer (`actions`), and last an "Advanced ›" fold with the record (`facts`, `advanced`) that
 * nobody needs to decide. Every kind of item uses this one layout, never a side window.
 */
export function InboxCard({ icon, title, source, primary, openLabel, summary, actions, facts = [], advanced, onLater, laterLabel = 'Later', defaultExpanded = false, children, footer, className }: {
  icon: ReactNode; title: string; source: ReactNode; primary?: ReactNode; openLabel?: string; summary?: ReactNode; actions?: ReactNode
  facts?: readonly InboxFact[]; advanced?: ReactNode; onLater?: () => void; laterLabel?: string; defaultExpanded?: boolean
  children?: ReactNode; footer?: ReactNode; className?: string
}) {
  const [expanded, setExpanded] = useState(defaultExpanded), [more, setMore] = useState(false)
  const body = useId(), record = useId()
  // Folded, the one answer sits beside the title; `openLabel` is an answer that needs the card open (typing a reply).
  const answer = primary ?? (openLabel && <Button type="button" size="sm" variant="outline" onClick={() => setExpanded(true)}>{openLabel}</Button>)
  return <Card render={<article aria-label={title} />} className={cn('min-w-0 gap-0 p-0', className)}>
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 p-3 sm:flex-nowrap">
      <button type="button" className="flex min-w-0 flex-1 basis-48 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-expanded={expanded} aria-controls={body} onClick={() => setExpanded(value => !value)}>
        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground [&_svg]:size-4">{icon}</span>
        <span className="min-w-0 flex-1">
          <h3 className={cn('font-medium leading-5 [overflow-wrap:anywhere]', !expanded && 'line-clamp-2')}>{title}</h3>
          <span className="mt-0.5 block truncate text-xs leading-5 text-muted-foreground">{source}</span>
        </span>
      </button>
      {!expanded && answer && <div className="order-last flex w-full shrink-0 justify-end pl-12 sm:order-none sm:w-auto sm:pl-0">{answer}</div>}
      {onLater && <Button type="button" size="icon" variant="ghost" className="shrink-0 text-muted-foreground" aria-label={`${laterLabel}: ${title}`} title={laterLabel} onClick={onLater}><X /></Button>}
    </div>
    {expanded && <div id={body} className="flex min-w-0 flex-col gap-4 px-4 pb-4 text-sm leading-6 [overflow-wrap:anywhere] sm:pl-15">
      {summary && <p className="whitespace-pre-wrap">{summary}</p>}
      {children}
      {actions && <div className="flex min-w-0 flex-col gap-3">{actions}</div>}
      {(facts.length > 0 || advanced) && <div className="flex min-w-0 flex-col gap-3">
        <button type="button" className="group inline-flex w-fit items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={more} aria-controls={record} onClick={() => setMore(value => !value)}>
          Advanced<ChevronRight aria-hidden="true" className={cn('size-3.5 transition-transform motion-reduce:transition-none', more && 'rotate-90')} />
        </button>
        {more && <div id={record} className="flex min-w-0 flex-col gap-3 text-xs leading-5 text-muted-foreground">
          {facts.length > 0 && <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">{facts.map(([label, value]) => <div key={label} className="contents"><dt>{label}</dt><dd className="min-w-0 break-words text-foreground">{value}</dd></div>)}</dl>}
          {advanced}
        </div>}
      </div>}
    </div>}
    {footer && <div className="border-t px-4 py-2.5 sm:pl-15">{footer}</div>}
  </Card>
}
