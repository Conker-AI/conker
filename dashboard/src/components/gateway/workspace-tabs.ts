import { resolveGatewayRoute } from './navigation'

export type WorkspaceTab = { id: string; href: string; title: string; sessionId: string | null; pinned: boolean }

/** Navigation metadata only. Never retain titles or content in browser storage. */
export function workspaceTab(pathname: string, search: string): WorkspaceTab | null {
  const route = resolveGatewayRoute(pathname)
  if (!route) return null
  const params = new URLSearchParams(search)
  const identity = new URLSearchParams()
  const keys = route === 'chat' ? ['session'] : route === 'tools' ? ['draft', 'view'] : ['tab']
  for (const key of keys) { const value = params.get(key); if (value) identity.set(key, value) }
  const href = pathname + (identity.size ? `?${identity}` : '')
  const names: Record<string, string> = { today: 'Today', setup: 'Setup', chat: params.has('session') ? 'Conversation' : 'New conversation', chats: 'Conversations', inbox: 'Inbox', projects: 'Projects', artifacts: 'Artifacts', jobs: 'Schedules', memory: 'Memory', activity: 'Activity', agents: 'Agents', tools: params.has('draft') ? 'Workflow' : 'Tools & workflows', system: 'System', settings: 'Settings', 'companion-settings': 'Companion' }
  const section = params.get('tab')
  const title = section && ['providers', 'search', 'teams', 'harness', 'files', 'processes', 'ports', 'containers'].includes(section) ? section[0].toUpperCase() + section.slice(1) : names[route]
  return { id: href, href, title, sessionId: route === 'chat' ? params.get('session') : null, pinned: false }
}

export function visitTab(tabs: WorkspaceTab[], incoming: WorkspaceTab): WorkspaceTab[] {
  if (tabs.some(tab => tab.id === incoming.id)) return tabs
  const next = [...tabs, incoming]
  if (next.length > 24) {
    const removable = next.findIndex(tab => !tab.pinned && tab.id !== incoming.id)
    if (removable >= 0) next.splice(removable, 1)
  }
  return next
}

export function closeTab(tabs: WorkspaceTab[], id: string, active: string): { tabs: WorkspaceTab[]; next: string | null } {
  const index = tabs.findIndex(tab => tab.id === id)
  if (index < 0 || tabs[index].pinned) return { tabs, next: null }
  const remaining = tabs.filter(tab => tab.id !== id)
  return { tabs: remaining, next: id === active ? remaining[Math.min(index, remaining.length - 1)]?.href ?? '/' : null }
}

export function moveTab(tabs: WorkspaceTab[], from: string, to: string): WorkspaceTab[] {
  const source = tabs.find(tab => tab.id === from), index = tabs.findIndex(tab => tab.id === to)
  if (!source || index < 0 || from === to) return tabs
  const next = tabs.filter(tab => tab.id !== from)
  next.splice(index, 0, source)
  return next
}
