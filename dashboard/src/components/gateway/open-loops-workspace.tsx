import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { PageHeader, WorkspaceAction } from '@/components/design-system'
import { InlineError } from '@/components/resilience/inline-error'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { dueLabel } from '@/lib/due-date'
import type { OpenLoop, OpenLoopFilter, OpenLoopPage, OpenLoopsClient } from '@/lib/gateway/open-loops'
import { gatewayConversationLink } from './navigation'
import { GatewayPageFrame } from './page-frame'

const filters: { id: OpenLoopFilter; label: string }[] = [{ id: 'open', label: 'Still open' }, { id: 'done', label: 'Done' }]

function details(loop: OpenLoop) {
  const who = loop.promisedBy === 'owner' ? 'You promised' : 'Conker promised'
  return `${who} · ${loop.dueOn ? `due ${dueLabel(loop.dueOn)}` : 'no day set'}`
}

/** What was promised, by you and by Conker, across every chat. Read only: changes are made with `conker loops`. */
export function GatewayOpenLoops({ client }: { client: OpenLoopsClient }) {
  const [filter, setFilter] = useState<OpenLoopFilter>('open')
  const [page, setPage] = useState<OpenLoopPage | null>(null)
  const [failed, setFailed] = useState<{ error: unknown } | null>(null)
  const [loading, setLoading] = useState(true)
  const [round, setRound] = useState(0)
  const [more, setMore] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    client.list(filter, null, controller.signal).then(next => { setPage(next); setFailed(null) })
      .catch(error => { if (!controller.signal.aborted) setFailed({ error }) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [client, filter, round])
  const reload = () => { setLoading(true); setRound(value => value + 1) }
  const pick = (next: OpenLoopFilter) => { setFilter(next); setPage(null); setFailed(null); setLoading(true) }
  const showMore = () => {
    if (!page?.nextAfter) return
    setMore(true)
    client.list(filter, page.nextAfter).then(next => { setPage({ ...next, items: [...page.items, ...next.items] }); setFailed(null) })
      .catch(error => setFailed({ error })).finally(() => setMore(false))
  }

  return <>
    <GatewayPageFrame>
      <div className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-5">
        <PageHeader actionsOnly title="Open loops" actions={<WorkspaceAction iconOnly aria-label="Check again" title="Check again" disabled={loading} onClick={reload}><RefreshCw className={loading ? 'animate-spin motion-reduce:animate-none' : undefined} /></WorkspaceAction>} />
        <p className="text-sm text-muted-foreground">Things you or Conker said you would do, from all your chats. To add, finish or drop one, use <code className="rounded bg-muted px-1 py-0.5 text-xs">conker loops add</code>, <code className="rounded bg-muted px-1 py-0.5 text-xs">conker loops done</code> or <code className="rounded bg-muted px-1 py-0.5 text-xs">conker loops drop</code>.</p>
        <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
          {filters.map(item => <Button key={item.id} type="button" size="sm" variant={filter === item.id ? 'secondary' : 'outline'} aria-pressed={filter === item.id} onClick={() => pick(item.id)}>{item.label}</Button>)}
        </div>
        {failed && !page && <InlineError error={failed.error} title="This didn’t load" onRetry={reload} />}
        {!page && !failed && <div className="space-y-3" role="status" aria-label="Loading"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>}
        {page && <>
          {failed && <p role="alert" className="text-sm text-destructive-foreground">Couldn’t update this. It shows the last result.</p>}
          {page.items.length === 0 && <p className="rounded-xl border px-4 py-4 text-sm text-muted-foreground">{filter === 'open' ? 'Nothing is waiting on a promise.' : 'Nothing is marked done yet.'}</p>}
          <ul className="flex flex-col gap-2">{page.items.map(loop => <li key={loop.id} className="space-y-1 rounded-xl border px-4 py-3">
            <p className="min-w-0 text-sm">{loop.text}</p>
            <p className="text-xs text-muted-foreground">{details(loop)}{loop.overdue && <> · <span className="font-medium text-destructive-foreground">Overdue</span></>}</p>
            <p className="text-xs text-muted-foreground">In <Link to={gatewayConversationLink(loop.sessionId, loop.messageId ?? undefined)} className="underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">{loop.sessionTitle || 'a chat'}</Link></p>
          </li>)}</ul>
          {page.nextAfter && <Button type="button" variant="outline" className="self-start" disabled={more} onClick={showMore}>{more ? 'Loading…' : 'Show more'}</Button>}
        </>}
      </div>
    </GatewayPageFrame>
  </>
}
