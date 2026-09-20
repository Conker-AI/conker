import { useState, type ReactNode } from "react"
import { MessageCircle, Pin } from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { useConker } from "@/lib/api/store"
import type { Session } from "@/lib/api/models"
import { BaseLayout } from "@/components/layouts/base-layout"
import {
  AgentIdentityPortrait, CollectionPanel, CollectionRow, CollectionSection,
  RouteSection,
} from "@/components/design-system"

function ConversationRow({ session, agentFirst = false }: { session: Session; agentFirst?: boolean }) {
  const profile = useConker(data => data.profile)
  const agent = useConker(data => data.agents.find(item => item.name === session.agent))
  const name = agent?.kind === "companion" ? profile.name : session.agent
  const context = agentFirst ? session.title : name
  return <CollectionRow to={`/chat/${session.id}`} title={agentFirst ? name : session.title}
    leading={<AgentIdentityPortrait name={session.agent} />} trailing={session.updated}
    descriptionTitle={`${context} · ${session.subtitle}`} description={<>
      <span className={agentFirst ? "max-w-[60%] shrink-0 truncate" : "max-w-24 shrink-0 truncate"}>{context}</span>
      <span aria-hidden="true">·</span><span className="min-w-0 truncate">{session.subtitle}</span>
    </>} />
}

function ConversationGroup({ title, sessions, pinned = false, agentFirst = false }: { title: string; sessions: Session[]; pinned?: boolean; agentFirst?: boolean }) {
  if (!sessions.length) return null
  return <CollectionSection title={title} icon={pinned ? <Pin className="size-3.5" aria-hidden="true" /> : undefined}>
    {sessions.map(session => <ConversationRow key={session.id} session={session} agentFirst={agentFirst} />)}
  </CollectionSection>
}

function ChatListPanel({ agentView = false, archived = false, query, onQueryChange, count, children }: {
  agentView?: boolean; archived?: boolean; query: string; onQueryChange: (query: string) => void; count: number; children: ReactNode
}) {
  const searching = Boolean(query.trim())
  return <CollectionPanel query={query} onQueryChange={onQueryChange} count={count}
    label={agentView ? "Search agents and latest sessions" : "Search conversations"}
    placeholder={agentView ? "Search agents or sessions" : "Search your conversations"}
    unit={agentView ? "agent sessions" : count === 1 ? "conversation" : "conversations"}
    icon={<MessageCircle />}
    emptyTitle={searching ? agentView ? "No agent sessions found" : "No conversations found" : archived ? "No archived conversations" : agentView ? "Your agent sessions will appear here" : "Your conversations will appear here"}
    emptyDescription={searching ? "Try a different title, topic, or agent name." : archived ? "Archive a conversation from its menu to keep it here." : agentView ? "Agents appear here after their first conversation." : "Start a conversation with your companion or choose another agent."}
    emptyAction={!archived && <Button asChild><Link to={agentView ? "/agents" : "/chat/new"}>{agentView ? "Choose an agent" : "New chat"}</Link></Button>}>
    {children}
  </CollectionPanel>
}

export default function ChatsPage() {
  const allSessions = useConker(data => data.sessions)
  const companionId = useConker(data => data.companionSessionId)
  const savedSessions = allSessions.filter(session => session.id !== companionId && !session.isDraft)
  const sessions = savedSessions.filter(session => !session.archived)
  const agents = useConker(data => data.agents)
  const profile = useConker(data => data.profile)
  const [query, setQuery] = useState("")
  const [agentQuery, setAgentQuery] = useState("")
  const [archiveQuery, setArchiveQuery] = useState("")
  const orderedSessions = [...sessions].sort((a, b) => a.minutesAgo - b.minutesAgo)
  const matches = (session: Session, search: string) => {
    const agent = agents.find(item => item.name === session.agent)
    const name = agent?.kind === "companion" ? profile.name : session.agent
    return `${session.title} ${session.subtitle} ${session.agent} ${name}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  }
  const archived = savedSessions.filter(session => session.archived && matches(session, archiveQuery))
  const filtered = orderedSessions.filter(session => matches(session, query))
  const pinned = filtered.filter(session => session.pinned)
  const recent = filtered.filter(session => !session.pinned)
  // Select latest before searching so an older match cannot replace it.
  const latestByAgent = new Map<string, Session>()
  for (const session of orderedSessions) {
    if (!latestByAgent.has(session.agent)) latestByAgent.set(session.agent, session)
  }
  const latestAgentSessions = [...latestByAgent.values()].filter(session => matches(session, agentQuery))
  const unusedAgents = agents.filter(agent => !agent.archivedAt && !latestByAgent.has(agent.name) && `${agent.name} ${agent.role}`.toLocaleLowerCase().includes(agentQuery.trim().toLocaleLowerCase()))

  return <BaseLayout variant="collection" title="Chats" description="A space for each topic. Start fresh or pick up where you left off.">
      <RouteSection value="sessions">
        <ChatListPanel query={query} onQueryChange={setQuery} count={filtered.length}>
          <div className="space-y-4">
            <ConversationGroup title="Pinned" sessions={pinned} pinned />
            <ConversationGroup title="Recent" sessions={recent} />
          </div>
        </ChatListPanel>
      </RouteSection>
      <RouteSection value="agents">
        <ChatListPanel agentView query={agentQuery} onQueryChange={setAgentQuery} count={latestAgentSessions.length + unusedAgents.length}>
          <ConversationGroup title="Latest sessions" sessions={latestAgentSessions} agentFirst />
          {unusedAgents.length > 0 && <CollectionSection title="Start a conversation">{unusedAgents.map(agent => <CollectionRow key={agent.id} to={`/chat/new?agent=${encodeURIComponent(agent.id)}`} title={agent.kind === "companion" ? profile.name : agent.name} description={agent.role} leading={<AgentIdentityPortrait name={agent.name} />} trailing="New chat" />)}</CollectionSection>}
        </ChatListPanel>
      </RouteSection>
      <RouteSection value="archived"><ChatListPanel archived query={archiveQuery} onQueryChange={setArchiveQuery} count={archived.length}><ConversationGroup title="Archived conversations" sessions={archived} /></ChatListPanel></RouteSection>
  </BaseLayout>
}
