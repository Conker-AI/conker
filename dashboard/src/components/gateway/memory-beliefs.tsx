import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { PageHeader, WorkspaceAction } from '@/components/design-system'
import { InlineError } from '@/components/resilience/inline-error'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { Belief, BeliefFilter, BeliefPage, MemoryBeliefsClient } from '@/lib/gateway/memory-beliefs'
import { GatewayHeader } from './header'
import { GatewayPageFrame } from './page-frame'

const filters: { id: string; label: string; value: BeliefFilter }[] = [
  { id: 'all', label: 'Everything', value: { origin: 'all', state: 'all' } },
  { id: 'stated', label: 'You told me', value: { origin: 'stated', state: 'all' } },
  { id: 'concluded', label: 'I worked it out', value: { origin: 'concluded', state: 'all' } },
  { id: 'review', label: 'Needs a look', value: { origin: 'all', state: 'needs_review' } },
]
const memoryLink = (id: string) => `/memory?view=database&kind=memory&record=${encodeURIComponent(id)}`
const day = (value: string | null) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)) : null
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

function why(belief: Belief) {
  const support = belief.origin === 'stated' ? 'You told me this.' : `I worked this out${belief.evidence.supporting ? ` from ${plural(belief.evidence.supporting, 'thing you said', 'things you said')}` : ''}.`
  const withdrawn = belief.evidence.withdrawn ? ` ${plural(belief.evidence.withdrawn, 'source was', 'sources were')} later forgotten.` : ''
  return support + withdrawn
}

/** What Conker believes about the owner: each memory, whose words it came from and when it was last used. Read-only; Fix and Forget are on the memory itself. */
export function GatewayMemoryBeliefs({ client }: { client: MemoryBeliefsClient }) {
  const [filterId, setFilterId] = useState('all')
  const [page, setPage] = useState<BeliefPage | null>(null)
  const [failed, setFailed] = useState<{ error: unknown } | null>(null)
  const [loading, setLoading] = useState(true)
  const [round, setRound] = useState(0)
  const [more, setMore] = useState(false)
  const filter = (filters.find(item => item.id === filterId) ?? filters[0]).value
  useEffect(() => {
    const controller = new AbortController()
    client.list(filter, controller.signal).then(next => { setPage(next); setFailed(null) })
      .catch(error => { if (!controller.signal.aborted) setFailed({ error }) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [client, filter, round])
  const reload = () => { setLoading(true); setRound(value => value + 1) }
  const pick = (id: string) => { setFilterId(id); setPage(null); setLoading(true) }
  const showMore = () => {
    if (!page?.nextAfter) return
    setMore(true)
    client.list({ ...filter, after: page.nextAfter }).then(next => { setPage({ ...next, items: [...page.items, ...next.items] }); setFailed(null) })
      .catch(error => setFailed({ error })).finally(() => setMore(false))
  }

  return <>
    <GatewayHeader />
    <GatewayPageFrame>
      <div className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-5">
        <PageHeader actionsOnly title="What Conker believes" actions={<WorkspaceAction iconOnly aria-label="Check again" title="Check again" disabled={loading} onClick={reload}><RefreshCw className={loading ? 'animate-spin motion-reduce:animate-none' : ''} /></WorkspaceAction>} />
        <div className="space-y-1">
          <Link to="/memory" className="inline-flex items-center gap-1 text-sm text-muted-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft className="size-4" aria-hidden="true" />Memory</Link>
          <p className="text-sm text-muted-foreground">What I hold about you, and where each thing came from. Open one to fix it or forget it.</p>
        </div>
        {page && <p className="text-sm text-muted-foreground" role="status">{plural(page.counts.stated, 'thing', 'things')} you told me · {plural(page.counts.concluded, 'thing', 'things')} I worked out · {page.counts.needsReview} to look at</p>}
        <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
          {filters.map(item => <Button key={item.id} type="button" size="sm" variant={filterId === item.id ? 'secondary' : 'outline'} aria-pressed={filterId === item.id} onClick={() => pick(item.id)}>{item.label}</Button>)}
        </div>
        {failed && !page && <InlineError error={failed.error} title="This didn’t load" onRetry={reload} />}
        {!page && !failed && <div className="space-y-3" role="status" aria-label="Loading"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>}
        {page && <>
          {failed && <p role="alert" className="text-sm text-destructive-foreground">Couldn’t update this. It shows the last result.</p>}
          {page.items.length === 0 && <p className="rounded-xl border px-4 py-4 text-sm text-muted-foreground">Nothing here.</p>}
          <ul className="flex flex-col gap-2">{page.items.map(belief => <li key={belief.id} className="space-y-1 rounded-xl border px-4 py-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="min-w-0 flex-1 text-sm">{belief.text}</span>
              <Link to={memoryLink(belief.id)} className="shrink-0 text-sm underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Open this memory to fix or forget it: ${belief.text}`}>Fix or forget</Link>
            </div>
            <p className="text-xs text-muted-foreground">{why(belief)}{belief.state === 'needs_review' ? ' Needs a look.' : ''}</p>
            <p className="text-xs text-muted-foreground">{belief.lastRecalledAt ? `Last used ${day(belief.lastRecalledAt)}.` : 'Not used in an answer yet.'}{belief.conflicts.length ? ` Disagrees with ${plural(belief.conflicts.length, 'other memory', 'other memories')}.` : ''}</p>
          </li>)}</ul>
          {page.nextAfter && <Button type="button" variant="outline" className="self-start" disabled={more} onClick={showMore}>{more ? 'Loading…' : 'Show more'}</Button>}
        </>}
      </div>
    </GatewayPageFrame>
  </>
}
