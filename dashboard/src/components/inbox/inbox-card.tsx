import { useId, useState, type ReactNode } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * One Inbox item (owner, 24 October; Willow-style): a full-sentence title, a muted sub-line, its
 * answers as one row under the title (`actions`: yes, no and Change, all one tap away) and an X for
 * "not now". Every kind of item uses this one layout. Details open in place under the card, never
 * in a side window.
 */
export function InboxCard({ icon, title, summary, meta, actions, onLater, laterLabel = 'Later', expanded: controlled, defaultExpanded = false, children, footer, className }: {
  icon: ReactNode; title: string; summary?: ReactNode; meta: ReactNode; actions?: ReactNode
  onLater?: () => void; laterLabel?: string; expanded?: boolean; defaultExpanded?: boolean
  children?: ReactNode; footer?: ReactNode; className?: string
}) {
  const [open, setOpen] = useState(defaultExpanded)
  const expanded = controlled ?? open
  const body = useId()
  return <Card render={<article aria-label={title} />} className={cn('min-w-0 gap-0 p-0', className)}>
    <div className={cn('flex min-w-0 items-start gap-3 p-4', actions && 'pb-3')}>
      <span aria-hidden="true" className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground [&_svg]:size-4">{icon}</span>
      <button type="button" className="group min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-expanded={expanded} aria-controls={children ? body : undefined} onClick={() => { if (children && controlled === undefined) setOpen(value => !value) }}>
        <h3 className="break-words font-medium leading-6 [overflow-wrap:anywhere]">{title}</h3>
        {summary && <p className={cn('mt-0.5 text-sm leading-5 text-foreground', !expanded && 'line-clamp-2')}>{summary}</p>}
        <span className="mt-1 block overflow-hidden"><span className="-ml-3 flex flex-wrap items-center text-xs leading-5 text-muted-foreground [&>*]:before:inline-block [&>*]:before:w-3 [&>*]:before:text-center [&>*]:before:content-['·']">{meta}
          {children && controlled === undefined && <span className="inline-flex items-center gap-0.5 group-hover:text-foreground">{expanded ? 'Less' : 'Details'}<ChevronDown className={cn('size-3.5 transition-transform motion-reduce:transition-none', expanded && 'rotate-180')} /></span>}
        </span></span>
      </button>
      {onLater && <Button type="button" size="icon" variant="ghost" className="shrink-0 text-muted-foreground" aria-label={`${laterLabel}: ${title}`} title={laterLabel} onClick={onLater}><X /></Button>}
    </div>
    {actions && <div className="flex min-w-0 flex-col gap-3 px-4 pb-4 sm:pl-15">{actions}</div>}
    {children && expanded && <div id={body} className="flex min-w-0 flex-col gap-4 border-t px-4 py-4 text-sm leading-6 [overflow-wrap:anywhere] sm:pl-15">{children}</div>}
    {footer && <div className="border-t px-4 py-2.5 sm:pl-15">{footer}</div>}
  </Card>
}
