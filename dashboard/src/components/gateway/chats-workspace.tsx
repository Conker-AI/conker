import { Link } from 'react-router-dom'
import { MessageSquare, RefreshCw, SquarePen } from 'lucide-react'
import { useStore } from 'zustand'
import { Button } from '@/components/ui/button'
import { PageHeader, WorkspaceAction } from '@/components/design-system/primitives'
import { ListCard, ListLine } from '@/components/design-system/list-card'
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

const when = (value: string) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value))

export function GatewayChatsWorkspace({ runtime, authStore, conversationState, sourcePrivacy, imports }: {
  runtime: GatewayRuntimeClient; authStore: GatewayAuthStore
  conversationState: GatewayRuntimeWorkspaceState; sourcePrivacy: GatewaySourcePrivacyState
  /** ChatGPT and Claude imports live under Chats, kept apart from Conker's own chats. */
  imports?: GatewayImportsClient
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
  const emptyContent = !directory.loaded ? error
    ? <InlineError error={null} title="Chats didn’t load" description={error} onRetry={directory.error === 'query' ? undefined : () => directory.refresh()} />
    : <ListSkeleton rows={5} label={searching ? 'Searching chats…' : 'Loading chats…'} /> : undefined
  const olderNote = directory.error === 'older' || directory.error === 'cursor' ? error : !directory.nextCursor && !directory.error ? 'You’ve reached the end of these results.' : null
  return <GatewayPageFrame>
    <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-4">
      <PageHeader actionsOnly title="Chats" description="Find a conversation or start a new one." density="compact" actions={<>
        <WorkspaceAction iconOnly aria-label={directory.pending === 'refresh' ? 'Refreshing chats' : 'Refresh chats'} title="Refresh chats" onClick={() => void directory.refresh()} disabled={busy || directory.error === 'query'}><RefreshCw aria-hidden="true" className={directory.pending === 'refresh' ? 'animate-spin motion-reduce:animate-none' : ''} /></WorkspaceAction>
        <WorkspaceAction emphasis="primary" keepVisible onClick={() => conversationState.setState({ selected: null })} render={<Link to="/chat" />}><SquarePen aria-hidden="true" />New chat</WorkspaceAction>
      </>} />
      {directory.changed && <div className="flex flex-wrap items-center gap-3"><p role="status" className="text-sm text-muted-foreground">{directory.changed === 'unverified' ? 'Refresh to check for newer chats.' : searching ? 'New chats may affect your search results.' : 'New chats are available.'}</p><Button variant="outline" size="sm" disabled={busy} onClick={() => void directory.refresh()}>{directory.changed === 'unverified' ? 'Refresh chats' : searching ? 'Refresh results' : 'Show new chats'}</Button></div>}
      {directory.loaded && error && directory.error !== 'older' && directory.error !== 'cursor' && <p role="status" className="text-sm text-muted-foreground">{error}</p>}
      <ListCard query={directory.query} onQueryChange={directory.setQuery} label="Search chats" placeholder="Search titles and summaries…" count={rows.length} unit={rows.length === 1 ? 'chat loaded' : 'chats loaded'}
        emptyTitle={searching ? 'No matching chats' : directory.nextCursor ? 'No visible chats on this page' : 'No chats yet'} emptyDescription={searching ? 'Try another title or phrase.' : directory.nextCursor ? 'Load older chats to keep browsing.' : 'Start a conversation and it will appear here.'}
        emptyContent={emptyContent} icon={<MessageSquare />} emptyAction={<Button onClick={() => conversationState.setState({ selected: null })} render={<Link to="/chat" />}>Start a chat</Button>}
        footer={directory.loaded && <>
          <Button variant="outline" size="sm" className="aria-disabled:opacity-50" aria-disabled={busy || !directory.nextCursor && directory.error !== 'cursor'} aria-busy={directory.pending === 'older'} onClick={() => { if (!busy) { if (directory.error === 'cursor') void directory.refresh(); else if (directory.nextCursor) void directory.older() } }}>{directory.pending === 'older' ? 'Loading…' : directory.error === 'cursor' ? 'Refresh chats' : directory.nextCursor ? searching ? 'Load more results' : 'Load older' : 'No more chats to load'}</Button>
          {olderNote && <p role="status" className="text-xs text-muted-foreground">{olderNote}</p>}
        </>}>
        {rows.map(session => <ListLine key={session.id} to={`/chat?session=${encodeURIComponent(session.id)}`} icon={<MessageSquare />}
          title={session.title ? `${session.title}${session.titleTruncated ? '…' : ''}` : 'Untitled chat'}
          sub={session.summaryPreview ? `${session.summaryPreview}${session.summaryTruncated ? '…' : ''}` : 'Continue this conversation'} meta={when(session.createdAt)} />)}
      </ListCard>
      {imports && <ImportedChatsLine client={imports} />}
      <p className="text-xs text-muted-foreground">{snapshot}</p>
    </div>
  </GatewayPageFrame>
}
