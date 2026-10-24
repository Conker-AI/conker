import { Link } from 'react-router-dom'
import { MessageSquare, RefreshCw, SquarePen } from 'lucide-react'
import { useStore } from 'zustand'
import { Button } from '@/components/ui/button'
import { CollectionLoading, CollectionPanel, CollectionRow, CollectionSection, PageHeader, WorkspaceAction } from '@/components/design-system/primitives'
import { GatewayPageFrame } from './page-frame'
import type { GatewayRuntimeClient } from '@/lib/gateway/runtime'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { GatewayRuntimeWorkspaceState } from './runtime-state'
import type { GatewaySourcePrivacyState } from './source-privacy'
import { useChatDirectory } from './use-chat-directory'

const when = (value: string) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value))

export function GatewayChatsWorkspace({ runtime, authStore, conversationState, sourcePrivacy }: {
  runtime: GatewayRuntimeClient; authStore: GatewayAuthStore
  conversationState: GatewayRuntimeWorkspaceState; sourcePrivacy: GatewaySourcePrivacyState
}) {
  const directory = useChatDirectory(runtime, authStore, conversationState, sourcePrivacy)
  const forgotten = useStore(sourcePrivacy, value => value.sessionIds)
  const rows = directory.rows.filter(row => !row.forgotten && !forgotten.includes(row.id))
  const searching = !!directory.query.trim(), busy = !!directory.pending
  const error = directory.error === 'query' ? 'Use up to 200 characters in your search.'
    : directory.error === 'cursor' ? 'This page link is no longer available. Refresh chats to continue.'
    : directory.error === 'older' ? 'Older chats could not be loaded. Your loaded results are still here.'
    : directory.error === 'offline' ? directory.loaded ? 'Chat loading was paused. Refresh chats to continue.' : 'Chat loading is paused. It will resume when this page is online.'
    : directory.error ? directory.loaded ? 'Couldn’t refresh chats. Showing the last loaded results.' : 'Chats could not be loaded. Try refreshing.' : null
  const snapshot = directory.pending === 'refresh' ? 'Showing previously loaded chats while refreshing.' : 'Loaded chats are a snapshot. Refresh chats to include changes.'
  const emptyContent = !directory.loaded ? error ? <p role="status" className="text-sm text-muted-foreground">{error}</p> : <CollectionLoading label={searching ? 'Searching chats…' : 'Loading chats…'} /> : undefined
  return <div className="flex min-h-0 flex-1 flex-col">
    {(directory.changed || directory.loaded && error && directory.error !== 'older' && directory.error !== 'cursor') && <div className="shrink-0 space-y-2 px-4 pt-4 sm:px-6">
      {directory.changed && <div className="flex flex-wrap items-center gap-3"><p role="status" className="text-sm text-muted-foreground">{directory.changed === 'unverified' ? 'Refresh to check for newer chats.' : searching ? 'New chats may affect your search results.' : 'New chats are available.'}</p><Button variant="outline" size="sm" disabled={busy} onClick={() => void directory.refresh()}>{directory.changed === 'unverified' ? 'Refresh chats' : searching ? 'Refresh results' : 'Show new chats'}</Button></div>}
      {directory.loaded && error && directory.error !== 'older' && directory.error !== 'cursor' && <p role="status" className="text-sm text-muted-foreground">{error}</p>}
    </div>}
    <GatewayPageFrame>
    <div className="w-full space-y-6">
      <PageHeader actionsOnly title="Chats" description="Find a conversation or start a new one." density="compact" actions={<>
        <WorkspaceAction onClick={() => void directory.refresh()} disabled={busy || directory.error === 'query'}><RefreshCw aria-hidden="true" />{directory.pending === 'refresh' ? 'Refreshing…' : 'Refresh chats'}</WorkspaceAction>
        <WorkspaceAction onClick={() => conversationState.setState({ selected: null })} render={<Link to="/chat" />}><SquarePen aria-hidden="true" />New chat</WorkspaceAction>
      </>} />
      <CollectionPanel query={directory.query} onQueryChange={directory.setQuery} label="Search chats" placeholder="Search titles and summaries…" count={rows.length} unit={rows.length === 1 ? 'chat loaded' : 'chats loaded'} emptyTitle={searching ? 'No matching chats' : directory.nextCursor ? 'No visible chats on this page' : 'No chats yet'} emptyDescription={searching ? 'Try another title or phrase.' : directory.nextCursor ? 'Load older chats to keep browsing.' : 'Start a conversation and it will appear here.'} emptyContent={emptyContent} emptyAction={<Button onClick={() => conversationState.setState({ selected: null })} render={<Link to="/chat" />}>Start a chat</Button>} icon={<MessageSquare />} hint={<>{snapshot} Search checks full titles and summaries; the rows show previews.</>}>
        <CollectionSection title={searching ? 'Search results' : 'Saved chats'}>{rows.map(session => <CollectionRow key={session.id} to={`/chat?session=${encodeURIComponent(session.id)}`} title={session.title ? `${session.title}${session.titleTruncated ? '…' : ''}` : 'Untitled chat'} description={session.summaryPreview ? `${session.summaryPreview}${session.summaryTruncated ? '…' : ''}` : 'Continue this conversation'} trailing={when(session.createdAt)} />)}</CollectionSection>
      </CollectionPanel>
      {directory.loaded && <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" className="aria-disabled:opacity-50" aria-disabled={busy || !directory.nextCursor && directory.error !== 'cursor'} aria-busy={directory.pending === 'older'} onClick={() => { if (!busy) { if (directory.error === 'cursor') void directory.refresh(); else if (directory.nextCursor) void directory.older() } }}>{directory.pending === 'older' ? 'Loading…' : directory.error === 'cursor' ? 'Refresh chats' : directory.nextCursor ? searching ? 'Load more results' : 'Load older' : 'No more chats to load'}</Button>
        {(directory.error === 'older' || directory.error === 'cursor') && <p role="status" className="text-sm text-muted-foreground">{error}</p>}
        {!directory.nextCursor && !directory.error && <p role="status" className="text-xs text-muted-foreground">You’ve reached the end of these results.</p>}
      </div>}
    </div>
    </GatewayPageFrame>
  </div>
}
