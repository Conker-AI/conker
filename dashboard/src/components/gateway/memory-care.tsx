import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CheckCheck, RefreshCw } from 'lucide-react'
import { PageHeader, WorkspaceAction } from '@/components/design-system'
import { InlineError } from '@/components/resilience/inline-error'
import { Skeleton } from '@/components/ui/skeleton'
import type { MemoryCareClient, MemoryUpkeepGroup, MemoryUpkeepPage } from '@/lib/gateway/memory-care'
import { GatewayHeader } from './header'
import { GatewayPageFrame } from './page-frame'

/** The five groups in the order they matter: a disagreement can make Conker wrong, a memory nobody uses only takes room. */
const groups: { key: MemoryUpkeepGroup; title: string; hint: string }[] = [
  { key: 'contradictions', title: 'Memories that disagree', hint: 'Only one of them can be right.' },
  { key: 'exactDuplicates', title: 'Saved twice', hint: 'The same words, kept more than once.' },
  { key: 'nearDuplicates', title: 'Almost the same', hint: 'Different words, the same thing.' },
  { key: 'expired', title: 'Past their date', hint: 'These were only true for a while.' },
  { key: 'notRecalled', title: 'Not used for a while', hint: 'Conker has not needed these lately.' },
]
const memoryLink = (id: string) => `/memory?view=database&kind=memory&record=${encodeURIComponent(id)}`

/** Memory care: what is worth tidying, read-only. Fix and Forget happen on the memory itself, in Memory. */
export function GatewayMemoryCare({ client }: { client: MemoryCareClient }) {
  const [page, setPage] = useState<MemoryUpkeepPage | null>(null)
  const [failed, setFailed] = useState<{ error: unknown } | null>(null)
  const [loading, setLoading] = useState(true)
  const [round, setRound] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    client.upkeep(controller.signal).then(next => { setPage(next); setFailed(null) })
      .catch(error => { if (!controller.signal.aborted) setFailed({ error }) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [client, round])
  const load = () => { setLoading(true); setRound(value => value + 1) }

  const total = page ? groups.reduce((sum, group) => sum + page[group.key].items.length, 0) : 0
  return <>
    <GatewayHeader />
    <GatewayPageFrame>
      <div className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-5">
        <PageHeader actionsOnly title="Memory care" actions={<WorkspaceAction iconOnly aria-label="Check memory again" title="Check memory again" disabled={loading} onClick={load}><RefreshCw className={loading ? 'animate-spin motion-reduce:animate-none' : ''} /></WorkspaceAction>} />
        <div className="space-y-1">
          <Link to="/memory" className="inline-flex items-center gap-1 text-sm text-muted-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft className="size-4" aria-hidden="true" />Memory</Link>
          <p className="text-sm text-muted-foreground">Memories worth a look. Nothing here changes by itself: open one to fix it or forget it.</p>
        </div>
        {failed && !page && <InlineError error={failed.error} title="Memory care didn’t load" onRetry={load} />}
        {!page && !failed && <div className="space-y-3" role="status" aria-label="Checking memory"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>}
        {page && <>
          <p className="text-sm text-muted-foreground" role="status">
            Checked {page.memoriesChecked} {page.memoriesChecked === 1 ? 'memory' : 'memories'}{page.truncated ? ' (the newest ones only)' : ''} · {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(page.checkedAt))}
          </p>
          {failed && <p role="alert" className="text-sm text-destructive-foreground">Couldn’t check again. This is the last result.</p>}
          {total === 0 && <div className="flex items-center gap-3 rounded-xl border px-4 py-4 text-sm text-muted-foreground"><CheckCheck className="size-5 shrink-0 text-success-foreground" aria-hidden="true" />Nothing to tidy up right now.</div>}
          {groups.filter(group => page[group.key].items.length).map(group => <section key={group.key} aria-label={group.title} className="space-y-2">
            <div className="flex items-baseline gap-2"><h2 className="text-sm font-semibold">{group.title}</h2><span className="text-xs tabular-nums text-muted-foreground">{page[group.key].total}</span></div>
            <p className="text-xs text-muted-foreground">{group.hint}</p>
            <ul className="flex flex-col gap-2">{page[group.key].items.map((item, index) => <li key={`${item.ids.join('+')}:${index}`} className="rounded-xl border px-4 py-3">
              <ul className="divide-y">{item.ids.map(id => {
                const memory = page.memories?.[id]
                return <li key={id} className="flex min-w-0 items-start gap-3 py-2 first:pt-0 last:pb-0">
                  <span className="min-w-0 flex-1 text-sm">{memory ? memory.text : 'This memory is not shown here.'}{memory?.state === 'needs_review' && <span className="ml-2 text-xs text-muted-foreground">Needs a look</span>}</span>
                  <Link to={memoryLink(id)} className="shrink-0 text-sm underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Open this memory to fix or forget it: ${memory?.text ?? id}`}>Fix or forget</Link>
                </li>
              })}</ul>
              {item.reason && <p className="mt-2 text-xs text-muted-foreground">{item.reason}</p>}
            </li>)}</ul>
          </section>)}
        </>}
      </div>
    </GatewayPageFrame>
  </>
}
