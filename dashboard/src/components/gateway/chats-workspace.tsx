import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Archive, ArchiveRestore, MessageSquare, RefreshCw, SquarePen } from 'lucide-react'
import { useStore } from 'zustand'
import { Button } from '@/components/ui/button'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { PageHeader, WorkspaceAction } from '@/components/design-system/primitives'
import { FilterChip, ListCard, ListLine, ListLineMenu } from '@/components/design-system/list-card'
import { useListSelection } from '@/components/design-system/list-selection'
import type { GatewayControlClient } from '@/lib/gateway/control'
import type { HistoryArchived, HistoryChat, HistorySort } from '@/lib/gateway/session-history'
import { archiveChats } from './chat-archive'
import { InlineError } from '@/components/resilience/inline-error'
import { ListSkeleton } from '@/components/resilience/skeletons'
import { GatewayPageFrame } from './page-frame'
import type { GatewayRuntimeClient } from '@/lib/gateway/runtime'
import type { GatewayImportsClient } from '@/lib/gateway/imports'
import { ImportedChatsLine } from './imported-chats-line'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { GatewayRuntimeWorkspaceState } from './runtime-state'
import type { GatewaySourcePrivacyState } from './source-privacy'
import { useChatDirectory } from './use-chat-directory'

const sorts = [{ value: 'newest', label: 'Newest' }, { value: 'oldest', label: 'Oldest' }, { value: 'name', label: 'Name' }] as const satisfies readonly { value: HistorySort; label: string }[]
const shows = [{ value: 'exclude', label: 'Active' }, { value: 'only', label: 'Archived' }, { value: 'include', label: 'All' }] as const satisfies readonly { value: HistoryArchived; label: string }[]
const when = (value: string) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value))

export function GatewayChatsWorkspace({ runtime, authStore, conversationState, sourcePrivacy, imports, chatNames }: {
  runtime: GatewayRuntimeClient; authStore: GatewayAuthStore
  /** Archive and restore; without it the list is read-only. */
  chatNames?: GatewayControlClient['chatNames']
  conversationState: GatewayRuntimeWorkspaceState; sourcePrivacy: GatewaySourcePrivacyState
  /** ChatGPT and Claude imports live under Chats, kept apart from Conker's own chats. */
  imports?: GatewayImportsClient
}) {
  const directory = useChatDirectory(runtime, authStore, conversationState, sourcePrivacy)
  const forgotten = useStore(sourcePrivacy, value => value.sessionIds)
  const rows = directory.rows.filter(row => !row.forgotten && !forgotten.includes(row.id))
  const busy = !!directory.pending
  const selection = useListSelection(rows.map(row => row.id))
  const [writing, setWriting] = useState(false)
  const picked = rows.filter(row => selection.has(row.id))
  const toArchive = picked.filter(row => !row.archivedAt).map(row => row.id), toRestore = picked.filter(row => row.archivedAt).map(row => row.id)
  async function setArchived(ids: string[], archived: boolean) {
    if (!chatNames || writing) return
    setWriting(true)
    try { if (await archiveChats(chatNames, ids, archived, () => void directory.refresh())) selection.stop() }
    finally { setWriting(false) }
  }
  const searching = !!directory.query.trim(), archivedView = directory.archived === 'only'
  const rowMenu = (session: HistoryChat) => chatNames && <ListLineMenu label={`More actions for ${session.title || 'this chat'}`}>
    {session.archivedAt
      ? <DropdownMenuItem disabled={writing} onClick={() => void setArchived([session.id], false)}><ArchiveRestore aria-hidden="true" />Restore</DropdownMenuItem>
      : <DropdownMenuItem disabled={writing} onClick={() => void setArchived([session.id], true)}><Archive aria-hidden="true" />Archive</DropdownMenuItem>}
  </ListLineMenu>
  const error = directory.error === 'query' ? 'Use up to 200 characters in your search.'
    : directory.error === 'cursor' ? 'This page link is no longer available. Refresh chats to continue.'
    : directory.error === 'older' ? 'Older chats could not be loaded. Your loaded results are still here.'
    : directory.error === 'offline' ? directory.loaded ? 'Chat loading was paused. Refresh chats to continue.' : 'Chat loading is paused. It will resume when this page is online.'
    : directory.error ? directory.loaded ? 'Couldn’t refresh chats. Showing the last loaded results.' : 'Chats could not be loaded. Try refreshing.' : null
  const snapshot = directory.pending === 'refresh' ? 'Showing previously loaded chats while refreshing.' : 'Loaded chats are a snapshot. Refresh chats to include changes.'
  const emptyContent = !directory.loaded ? error
    ? <InlineError error={null} title="Chats didn’t load" description={error} onRetry={() => directory.refresh()} />
    : <ListSkeleton rows={5} label="Loading chats…" /> : undefined
  const olderNote = directory.error === 'older' || directory.error === 'cursor' ? error : !directory.nextCursor && !directory.error ? 'You’ve reached the end of these results.' : null
  return <GatewayPageFrame>
    <div className="flex w-full min-w-0 flex-col gap-4">
      <PageHeader actionsOnly title="Chats" description="Find a conversation or start a new one." density="compact" actions={<>
        <WorkspaceAction iconOnly aria-label={directory.pending === 'refresh' ? 'Refreshing chats' : 'Refresh chats'} title="Refresh chats" onClick={() => void directory.refresh()} disabled={busy || directory.error === 'query'}><RefreshCw aria-hidden="true" className={directory.pending === 'refresh' ? 'animate-spin motion-reduce:animate-none' : ''} /></WorkspaceAction>
        <WorkspaceAction emphasis="primary" keepVisible onClick={() => conversationState.setState({ selected: null })} render={<Link to="/chat" />}><SquarePen aria-hidden="true" />New chat</WorkspaceAction>
      </>} />
      {directory.changed && <div className="flex flex-wrap items-center gap-3"><p role="status" className="text-sm text-muted-foreground">{directory.changed === 'unverified' ? 'Refresh to check for newer chats.' : 'New chats are available.'}</p><Button variant="outline" size="sm" disabled={busy} onClick={() => void directory.refresh()}>{directory.changed === 'unverified' ? 'Refresh chats' : 'Show new chats'}</Button></div>}
      {directory.loaded && error && directory.error !== 'older' && directory.error !== 'cursor' && <p role="status" className="text-sm text-muted-foreground">{error}</p>}
      <ListCard count={rows.length} unit={rows.length === 1 ? 'chat loaded' : 'chats loaded'}
        query={directory.query} onQueryChange={directory.setQuery} label="Search chats" placeholder="Search chats"
        sort={{ value: directory.sort, options: sorts, onChange: (sort: HistorySort) => directory.setView({ sort }) }}
        filters={shows.map(show => <FilterChip key={show.value} active={directory.archived === show.value} onClick={() => directory.setView({ archived: show.value })}>{show.label}</FilterChip>)}
        selection={chatNames ? selection : undefined}
        bulkActions={<>
          {!archivedView && <Button type="button" size="sm" variant="outline" disabled={writing || !toArchive.length} onClick={() => void setArchived(toArchive, true)}><Archive aria-hidden="true" />Archive</Button>}
          {directory.archived !== 'exclude' && <Button type="button" size="sm" variant="outline" disabled={writing || !toRestore.length} onClick={() => void setArchived(toRestore, false)}><ArchiveRestore aria-hidden="true" />Restore</Button>}
        </>}
        emptyTitle={directory.nextCursor ? 'No visible chats on this page' : searching ? 'No chats match' : archivedView ? 'No archived chats' : 'No chats yet'}
        emptyDescription={directory.nextCursor ? 'Load older chats to keep browsing.' : searching ? 'Try other words, or look in Archived or All.' : archivedView ? 'Chats you archive show here. Archiving deletes nothing.' : 'Start a conversation and it will appear here.'}
        emptyContent={emptyContent} icon={archivedView ? <Archive /> : <MessageSquare />} emptyAction={!searching && !archivedView ? <Button onClick={() => conversationState.setState({ selected: null })} render={<Link to="/chat" />}>Start a chat</Button> : undefined}
        footer={directory.loaded && <>
          <Button variant="outline" size="sm" className="aria-disabled:opacity-50" aria-disabled={busy || !directory.nextCursor && directory.error !== 'cursor'} aria-busy={directory.pending === 'older'} onClick={() => { if (!busy) { if (directory.error === 'cursor') void directory.refresh(); else if (directory.nextCursor) void directory.older() } }}>{directory.pending === 'older' ? 'Loading…' : directory.error === 'cursor' ? 'Refresh chats' : directory.nextCursor ? 'Load older' : 'No more chats to load'}</Button>
          {olderNote && <p role="status" className="text-xs text-muted-foreground">{olderNote}</p>}
        </>}>
        {rows.map(session => <ListLine key={session.id} id={session.id} selection={chatNames ? selection : undefined} actions={rowMenu(session)}
          badge={session.archivedAt && directory.archived === 'include' ? 'Archived' : undefined} to={`/chat?session=${encodeURIComponent(session.id)}`} icon={<MessageSquare />}
          title={session.title ? `${session.title}${session.titleTruncated ? '…' : ''}` : 'Untitled chat'}
          sub={session.summaryPreview ? `${session.summaryPreview}${session.summaryTruncated ? '…' : ''}` : 'Continue this conversation'} meta={when(session.createdAt)} />)}
      </ListCard>
      {imports && <ImportedChatsLine client={imports} />}
      <p className="text-xs text-muted-foreground">{snapshot}</p>
    </div>
  </GatewayPageFrame>
}
