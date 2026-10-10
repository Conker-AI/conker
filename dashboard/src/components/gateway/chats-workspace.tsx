import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageSquare, SquarePen } from 'lucide-react'
import { useStore } from 'zustand'
import { Button } from '@/components/ui/button'
import { CollectionLoading, CollectionPanel, CollectionRow, CollectionSection, PageHeader, WorkspaceAction } from '@/components/design-system/primitives'
import { GatewayPageFrame } from './page-frame'
import type { GatewayRuntimeWorkspaceState } from './runtime-state'
import { maskForgottenSession, type GatewaySourcePrivacyState } from './source-privacy'
import { useSessionDiscovery } from './session-discovery-context'

const when = (value: string) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value))

export function GatewayChatsWorkspace({ conversationState, sourcePrivacy }: {
  conversationState: GatewayRuntimeWorkspaceState
  sourcePrivacy: GatewaySourcePrivacyState
}) {
  const { rows: sessions, loaded, error, refresh } = useSessionDiscovery()
  const [query, setQuery] = useState('')
  const forgotten = useStore(sourcePrivacy, value => value.sessionIds)
  const rows = useMemo(() => sessions
    .map(session => forgotten.includes(session.id) ? maskForgottenSession(session) : session)
    .filter(session => session.status !== 'forgotten')
    .filter(session => `${session.title} ${session.summary ?? ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [forgotten, query, sessions])
  return <GatewayPageFrame>
    <div className="w-full space-y-6">
      <PageHeader actionsOnly title="Chats" description="Find a conversation or start a new one." density="compact" actions={<WorkspaceAction asChild onClick={() => conversationState.setState({ selected: null })}><Link to="/chat"><SquarePen aria-hidden="true" />New chat</Link></WorkspaceAction>} />
      {error && <div className="flex flex-wrap items-center gap-3"><p role="status" className="text-sm text-muted-foreground">{loaded ? 'Chat updates are delayed. Showing the last saved list.' : 'Chats could not be loaded.'}</p><Button variant="outline" size="sm" onClick={() => void refresh()}>Try again</Button></div>}
      {!loaded && !error && <CollectionLoading label="Loading chats…" />}
      {loaded && <CollectionPanel query={query} onQueryChange={setQuery} label="Search chats" placeholder="Search chats…" count={rows.length} unit={rows.length === 1 ? 'chat' : 'chats'} emptyTitle={query ? 'No matching chats' : 'No chats yet'} emptyDescription={query ? 'Try a different title or phrase.' : 'Start a conversation and it will appear here.'} emptyAction={<Button asChild onClick={() => conversationState.setState({ selected: null })}><Link to="/chat">Start a chat</Link></Button>} icon={<MessageSquare />}>
        <CollectionSection title="Recent chats">{rows.map(session => <CollectionRow key={session.id} to={`/chat?session=${encodeURIComponent(session.id)}`} title={session.title || 'New chat'} description={session.summary || 'Continue this conversation'} trailing={when(session.createdAt)} />)}</CollectionSection>
      </CollectionPanel>}
    </div>
  </GatewayPageFrame>
}
