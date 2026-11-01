import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Archive, Upload } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { FilterChip, ListCard, ListLine } from '@/components/design-system/list-card'
import { InlineError } from '@/components/resilience/inline-error'
import { ListSkeleton } from '@/components/resilience/skeletons'
import { Button } from '@/components/ui/button'
import { importRefusalMessage, importSourceNames, type GatewayImportsClient, type ImportedChat, type ImportedChatDetail, type ImportOffers, type ImportSource } from '@/lib/gateway/imports'
import { cn } from '@/lib/utils'
import { GatewayPageFrame } from './page-frame'

const plural = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString()} ${count === 1 ? one : many}`
const date = (seconds: number | null) => seconds === null ? null : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(seconds * 1000))
const memoryLabels = { offering: 'Waiting to be offered to memory', offered: 'Offered to memory', refused: 'Memory turned this down', not_offered: null } as const

/** How many of his imported words wait for memory, and why, in plain words (Pi's reasons are matched, not shown). */
function importOffersLine(offers: ImportOffers): string | null {
  if (offers.waiting) {
    const waiting = `${plural(offers.waiting, 'memory offer')} waiting`
    if (!offers.configured) return `${waiting}: memory isn’t connected for imports on your server yet.`
    if (offers.problem?.startsWith('MemoryGate refused the import listener')) return `${waiting}: memory turned the import connection down, so offers are paused. Check the import settings on your server.`
    if (offers.problem) return `${waiting}: memory didn’t answer, so Conker sends them again by itself.`
    return `${waiting}. Conker is offering your own imported messages to memory.`
  }
  if (offers.offered || offers.refused) return `All your imported messages were offered to memory${offers.refused ? ` (${offers.refused.toLocaleString()} turned down)` : ''}.`
  return null
}

/** Chats > Imported chats: the read-only archive of ChatGPT and Claude chats, apart from Conker's own chats. */
export function GatewayImportedChats({ client }: { client: GatewayImportsClient }) {
  const [params] = useSearchParams(), chat = params.get('chat')
  return chat && /^imp_[0-9a-f]{32}$/.test(chat) ? <ImportedChatView key={chat} client={client} id={chat} /> : <ImportedChatList client={client} />
}

function ImportedChatList({ client }: { client: GatewayImportsClient }) {
  const [filter, setFilter] = useState<'all' | ImportSource>('all')
  const [page, setPage] = useState<{ filter: string; rows: ImportedChat[]; total: number; next: number | null } | null>(null)
  const [error, setError] = useState<unknown>(null), [loadingMore, setLoadingMore] = useState(false), [offers, setOffers] = useState<ImportOffers | null>(null)
  const [totals, setTotals] = useState<Record<ImportSource, number> | null>(null)
  const fetchPage = useCallback((selected: 'all' | ImportSource, offset: number) => client.chats({ offset, ...(selected === 'all' ? {} : { source: selected }) }).then(result => {
    setError(null)
    setPage(current => ({ filter: selected, rows: offset && current?.filter === selected ? [...current.rows, ...result.chats] : result.chats, total: result.total, next: result.nextOffset }))
  }, cause => setError(cause)), [client])
  useEffect(() => { void fetchPage(filter, 0) }, [filter, fetchPage])
  useEffect(() => {
    let active = true
    client.list().then(value => { if (active) setOffers(value.memory) }).catch(() => undefined)
    // Per-source totals, so the filter chips only appear, with true counts, when both sources are here.
    Promise.all((['chatgpt', 'claude'] as const).map(source => client.chats({ limit: 1, source }))).then(([chatgpt, claude]) => { if (active) setTotals({ chatgpt: chatgpt.total, claude: claude.total }) }).catch(() => undefined)
    return () => { active = false }
  }, [client])
  const current = page?.filter === filter ? page : null
  const offersLine = offers && importOffersLine(offers)
  const chip = (value: typeof filter, label: string, count: number) => <FilterChip key={value} active={filter === value} count={count} onClick={() => setFilter(value)}>{label}</FilterChip>
  return <GatewayPageFrame><div className="flex w-full min-w-0 flex-col gap-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><Button variant="ghost" size="sm" render={<Link to="/chats" />}><ArrowLeft />Chats</Button>{!!current?.total && <Button variant="outline" size="sm" render={<Link to="/chats?view=import" />}><Upload />Import more</Button>}</div>
    <div className="space-y-1"><h2 className="text-lg font-semibold">Imported chats</h2><p className="text-sm leading-6 text-muted-foreground">Read-only copies of your ChatGPT and Claude chats. You can read them here; they can’t be continued.</p></div>
    {offersLine && <p role="status" className="text-sm leading-6">{offersLine}</p>}
    {error && !current ? <InlineError error={error} title="Imported chats didn’t load" onRetry={() => fetchPage(filter, 0)} />
      : !current ? <ListSkeleton rows={4} label="Loading imported chats…" />
        : <ListCard count={current.rows.length} unit={current.rows.length === 1 ? 'chat loaded' : 'chats loaded'}
          filters={totals && totals.chatgpt > 0 && totals.claude > 0 ? <>{chip('all', 'All', totals.chatgpt + totals.claude)}{chip('chatgpt', 'ChatGPT', totals.chatgpt)}{chip('claude', 'Claude', totals.claude)}</> : undefined}
          emptyTitle={filter === 'all' ? 'No imported chats yet' : `No chats imported from ${importSourceNames[filter]}`}
          emptyDescription={'Import your ChatGPT or Claude export to read your old chats here.'}
          emptyAction={<Button render={<Link to="/chats?view=import" />}><Upload />Import from ChatGPT or Claude</Button>} icon={<Archive />}
          footer={current.rows.length > 0 && <>
            <Button variant="outline" size="sm" disabled={loadingMore || current.next === null} onClick={async () => { if (current.next === null) return; setLoadingMore(true); await fetchPage(filter, current.next); setLoadingMore(false) }}>{loadingMore ? 'Loading…' : current.next === null ? 'No more chats to load' : 'Load more'}</Button>
            <span className="text-xs text-muted-foreground">{error ? importRefusalMessage(error) : `${current.rows.length.toLocaleString()} of ${current.total.toLocaleString()} loaded`}</span>
          </>}>
          {current.rows.map(row => <ListLine key={row.id} to={`/chats?view=imported&chat=${row.id}`} icon={<Archive />} title={row.title || 'Untitled chat'}
            sub={`${importSourceNames[row.source]} · ${plural(row.messageCount, 'message')}`} meta={date(row.updatedAt ?? row.startedAt ?? row.importedAt)} />)}
        </ListCard>}
  </div></GatewayPageFrame>
}

function ImportedChatView({ client, id }: { client: GatewayImportsClient; id: string }) {
  const [chat, setChat] = useState<ImportedChatDetail | null>(null), [error, setError] = useState<unknown>(null), [loadingMore, setLoadingMore] = useState(false)
  const load = useCallback((after = 0) => client.chat(id, after).then(result => {
    setError(null)
    setChat(current => after && current ? { ...result, messages: [...current.messages, ...result.messages] } : result)
  }, cause => setError(cause)), [client, id])
  useEffect(() => { void load() }, [load])
  const back = <Button variant="ghost" size="sm" render={<Link to="/chats?view=imported" />}><ArrowLeft />Imported chats</Button>
  if (!chat) return <GatewayPageFrame><div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-4"><div>{back}</div>
    {error ? <InlineError error={error} title="This imported chat didn’t load" description={importRefusalMessage(error)} onRetry={() => load()} /> : <ListSkeleton rows={4} label="Loading imported chat…" />}
  </div></GatewayPageFrame>
  const from = importSourceNames[chat.source], started = date(chat.startedAt)
  return <GatewayPageFrame><div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-4">
    <div>{back}</div>
    <header className="space-y-1"><h2 dir="auto" className="text-lg font-semibold [overflow-wrap:anywhere]">{chat.title || 'Untitled chat'}</h2><p className="text-sm text-muted-foreground">Imported from {from}{started ? ` · started ${started}` : ''} · {plural(chat.messageCount, 'message')}</p></header>
    <p role="note" className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-muted-foreground"><Archive className="size-4 shrink-0" />Read-only copy. It can’t be continued here.</p>
    <ol aria-label="Messages" className="flex min-w-0 flex-col gap-6">
      {chat.messages.map(message => {
        const mine = message.author === 'user', memory = message.memory ? memoryLabels[message.memory] : null
        return <li key={message.id} className={cn('flex min-w-0 flex-col gap-1', mine ? 'items-end' : 'items-start')}>
          {!mine && <span className="text-sm font-medium">{from}</span>}
          <p dir="auto" className={cn('min-w-0 max-w-full whitespace-pre-wrap text-base leading-7 [overflow-wrap:anywhere]', mine && 'max-w-[92%] rounded-2xl bg-muted px-4 py-2.5 sm:max-w-[85%]')}>{message.text}</p>
          <span className="text-xs text-muted-foreground">{[mine ? 'You' : null, date(message.createdAt), message.shortened ? 'Shortened on import' : null, memory].filter(Boolean).join(' · ')}</span>
        </li>
      })}
    </ol>
    {chat.nextAfter !== null && <div><Button variant="outline" size="sm" disabled={loadingMore} onClick={async () => { setLoadingMore(true); await load(chat.nextAfter!); setLoadingMore(false) }}>{loadingMore ? 'Loading…' : 'Load more messages'}</Button></div>}
    {!!error && <p role="alert" className="text-sm text-destructive-foreground">{importRefusalMessage(error)}</p>}
  </div></GatewayPageFrame>
}
