import { useMemo, useRef, useState } from 'react'
import { Brain, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmationDialog } from '@/components/design-system/overlays'
import { ListCard, ListLine } from '@/components/design-system/list-card'
import { useListSelection } from '@/components/design-system/list-selection'
import { byName, useListView } from '@/components/design-system/list-view'
import { notifyDone, notifyFailure } from '@/components/resilience/notify'
import type { GatewayControlClient, MemoryForgetPreview, MemoryLibrary, MemoryObjectCard } from '@/lib/gateway/control'
import { memoryForgetFailure } from '@/lib/gateway/memory-forget-state'

type Row = MemoryLibrary['objects'][number]
const key = (value: MemoryObjectCard) => `${value.type}:${value.id}`
const connections = (item: Row) => Object.values(item.connections).reduce((sum, count) => sum + count, 0)
const memories = (count: number) => `${count} ${count === 1 ? 'memory' : 'memories'}`

/**
 * Memory as a list: sort the loaded records, open one in the inspector, select memories and
 * forget them together. Forgetting reads each memory's current text first, so the owner confirms
 * exactly the versions Pi will remove; Pi stops at the first refusal and the rest stay.
 */
export function MemoryList({ client, page, title, kind, link, selectedKey, onOpen, onForgotten }: {
  client: GatewayControlClient; page: MemoryLibrary; title: (item: Row) => string; kind: (item: Row) => string
  link: (item: Row) => string; selectedKey: string | null; onOpen: (item: Row) => void; onForgotten: () => void
}) {
  const view = useListView(page.objects, {
    text: () => [],
    sorts: {
      loaded: { label: 'As loaded', compare: () => 0 },
      name: { label: 'Name', compare: byName(title) },
      type: { label: 'Type', compare: (a: Row, b: Row) => kind(a).localeCompare(kind(b)) || title(a).localeCompare(title(b)) },
      connected: { label: 'Most connected', compare: (a: Row, b: Row) => connections(b) - connections(a) },
    },
  })
  // Only memories can be forgotten here; people, sources and notes follow from them.
  const forgettable = useMemo(() => view.rows.filter(row => row.type === 'memory').map(row => row.id), [view.rows])
  const selection = useListSelection(forgettable)
  const [reviewed, setReviewed] = useState<MemoryForgetPreview[] | null>(null)
  const [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null)
  const requestId = useRef<string | null>(null)

  async function review() {
    if (pending || !selection.count) return
    setPending(true); setError(null)
    try {
      const ids = forgettable.filter(id => selection.has(id)).slice(0, 50)
      const read: MemoryForgetPreview[] = []
      for (const id of ids) read.push(await client.forgetPreview(id))
      requestId.current = globalThis.crypto.randomUUID(); setReviewed(read)
    } catch (failure) { notifyFailure('Couldn’t read the selected memories', memoryForgetFailure(failure).message) }
    finally { setPending(false) }
  }

  async function confirm() {
    if (!reviewed || pending || !requestId.current) return
    setPending(true); setError(null)
    try {
      // A retry after a lost reply reuses the request id, so Pi replays what it already forgot.
      const result = await client.forgetMany(reviewed.map(item => ({ memoryId: item.memoryId, revision: item.revision })), requestId.current)
      setReviewed(null); requestId.current = null; selection.stop()
      if (result.results.length) notifyDone(`Forgot ${memories(result.results.length)}`, 'The chats they came from are kept.')
      if (result.stopped) notifyFailure(`Stopped at memory ${result.stopped.index + 1}`, `${memoryForgetFailure(Object.assign(new Error(result.stopped.message), { code: result.stopped.code })).message} ${memories(reviewed.length - result.results.length)} kept.`)
      onForgotten()
    } catch (failure) {
      const problem = memoryForgetFailure(failure)
      setError(problem.message)
      if (problem.reset) { setReviewed(null); requestId.current = null; onForgotten() }
    } finally { setPending(false) }
  }

  return <>
    <ListCard count={view.rows.length} unit={`of ${page.total} loaded`} sort={view.sort} selection={forgettable.length ? selection : undefined}
      bulkActions={<Button type="button" size="sm" variant="outline" disabled={pending || !selection.count} onClick={() => void review()}><Trash2 aria-hidden="true" />{pending && !reviewed ? 'Reading…' : 'Forget…'}</Button>}
      emptyTitle="No memories" emptyDescription="Saved memories will appear here.">
      {view.rows.map(item => <ListLine key={key(item)} id={item.type === 'memory' ? item.id : undefined} selection={item.type === 'memory' ? selection : undefined}
        to={link(item)} onClick={() => onOpen(item)} icon={<Brain />} title={title(item)}
        badge={selectedKey === key(item) ? 'Open' : undefined}
        sub={`${kind(item)} · ${connections(item)} ${connections(item) === 1 ? 'connection' : 'connections'}`} />)}
    </ListCard>
    <ConfirmationDialog open={!!reviewed} onOpenChange={open => { if (!open && !pending) { setReviewed(null); setError(null); requestId.current = null } }}
      title={`Forget ${memories(reviewed?.length ?? 0)} permanently?`} actionLabel="Forget permanently" pending={pending} error={error} onConfirm={confirm}
      description="Conker removes these exact versions and their recalled copies. This can’t be undone. The chats they came from are kept.">
      <ol className="max-h-72 space-y-2 overflow-auto text-sm">
        {reviewed?.map(item => <li key={item.memoryId} className="whitespace-pre-wrap break-words border-l-2 pl-3">{item.text}</li>)}
      </ol>
    </ConfirmationDialog>
  </>
}
