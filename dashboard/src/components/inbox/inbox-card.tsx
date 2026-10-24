import { useId, useState, type ReactNode } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * One Inbox item (owner, 24 October; Willow-style): a full-sentence title, a muted sub-line, one
 * pill button for the likely action and an X for "not now". Details open in place under the card,
 * never in a side window.
 */
export function InboxCard({ icon, title, summary, meta, primary, onLater, laterLabel = 'Later', expanded: controlled, defaultExpanded = false, children, footer, className }: {
  icon: ReactNode; title: string; summary?: ReactNode; meta: ReactNode; primary?: ReactNode
  onLater?: () => void; laterLabel?: string; expanded?: boolean; defaultExpanded?: boolean
  children?: ReactNode; footer?: ReactNode; className?: string
}) {
  const [open, setOpen] = useState(defaultExpanded)
  const expanded = controlled ?? open
  const body = useId()
  return <Card render={<article aria-label={title} />} className={cn('min-w-0 gap-0 p-0', className)}>
    <div className="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-3 p-4 sm:flex-nowrap">
      <span aria-hidden="true" className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground [&_svg]:size-4">{icon}</span>
      <button type="button" className="group min-w-0 flex-1 basis-[calc(100%-3rem)] rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring sm:basis-auto"
        aria-expanded={expanded} aria-controls={children ? body : undefined} onClick={() => { if (children && controlled === undefined) setOpen(value => !value) }}>
        <h3 className="break-words font-medium leading-6 [overflow-wrap:anywhere]">{title}</h3>
        {summary && <p className={cn('mt-0.5 text-sm leading-5 text-foreground', !expanded && 'line-clamp-2')}>{summary}</p>}
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs leading-5 text-muted-foreground">{meta}
          {children && controlled === undefined && <span className="inline-flex items-center gap-0.5 group-hover:text-foreground">· {expanded ? 'Less' : 'Details'}<ChevronDown className={cn('size-3.5 transition-transform motion-reduce:transition-none', expanded && 'rotate-180')} /></span>}
        </p>
      </button>
      {(primary || onLater) && <div className="ml-11 flex shrink-0 items-center gap-1 sm:ml-0">
        {primary}
        {onLater && <Button type="button" size="icon" variant="ghost" className="text-muted-foreground" aria-label={`${laterLabel}: ${title}`} title={laterLabel} onClick={onLater}><X /></Button>}
      </div>}
    </div>
    {children && expanded && <div id={body} className="flex min-w-0 flex-col gap-4 border-t px-4 py-4 text-sm leading-6 [overflow-wrap:anywhere] sm:pl-15">{children}</div>}
    {footer && <div className="border-t px-4 py-2.5 sm:pl-15">{footer}</div>}
  </Card>
}
