export type GatewayRoute =
  | 'today'
  | 'setup'
  | 'chat'
  | 'chats'
  | 'inbox'
  | 'projects'
  | 'artifacts'
  | 'jobs'
  | 'memory'
  | 'activity'
  | 'agents'
  | 'tools'
  | 'system'
  | 'settings'
  | 'companion-settings'

/**
 * The connected product's labels and destinations have one source of truth. Sidebar groups follow
 * the owner-approved structure (prototype v7): Overview (Home, Inbox, Chats), Workspace (Projects,
 * Memory, Agents, Tools, Cron jobs) and System (Server, Settings). `more` places stay reachable
 * through search and links on the pages that own them.
 */
export const gatewayDestinations = [
  { id: 'today', route: 'today', title: 'Home', path: '/overview', group: 'overview' },
  { id: 'inbox', route: 'inbox', title: 'Inbox', path: '/inbox', group: 'overview' },
  { id: 'chats', route: 'chats', title: 'Chats', path: '/chats', group: 'overview' },
  { id: 'projects', route: 'projects', title: 'Projects', path: '/projects', group: 'workspace' },
  { id: 'memory', route: 'memory', title: 'Memory', path: '/memory', group: 'workspace' },
  { id: 'agents', route: 'agents', title: 'Agents', path: '/agents', group: 'workspace' },
  { id: 'tools', route: 'tools', title: 'Tools', path: '/tools', group: 'workspace' },
  { id: 'jobs', route: 'jobs', title: 'Cron jobs', path: '/jobs', group: 'workspace' },
  { id: 'system', route: 'system', title: 'Server', path: '/system', group: 'system' },
  { id: 'settings', route: 'settings', title: 'Settings', path: '/settings', group: 'system' },
  { id: 'chat', route: 'chat', title: 'New chat', path: '/chat', group: 'more' },
  { id: 'tasks', route: 'activity', title: 'Tasks', path: '/activity', group: 'more' },
  { id: 'runs', route: 'activity', title: 'Runs', path: '/activity?tab=runs', group: 'more' },
  { id: 'events', route: 'activity', title: 'Activity log', path: '/activity?tab=events', group: 'more' },
  { id: 'artifacts', route: 'artifacts', title: 'Artifacts', path: '/artifacts', group: 'more' },
  { id: 'skills', route: 'agents', title: 'Skills', path: '/agents?tab=skills', group: 'more' },
  { id: 'companion', route: 'companion-settings', title: 'Companion', path: '/settings/companion', group: 'more' },
  { id: 'native-sessions', route: 'system', title: 'Native sessions', path: '/system?tab=native-sessions', group: 'more' },
  { id: 'setup', route: 'setup', title: 'Setup & readiness', path: '/setup', group: 'more' },
] as const satisfies readonly { id: string; route: GatewayRoute; title: string; path: string; group: 'overview' | 'workspace' | 'system' | 'more' }[]
export type GatewayDestination = typeof gatewayDestinations[number]
export const gatewaySidebarGroups = [
  { id: 'overview', label: 'Overview' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'system', label: 'System' },
] as const
export const gatewaySidebarDestinations = gatewayDestinations.filter(item => item.group !== 'more')
export const gatewayCommandDestinations = gatewayDestinations

const routeSections: Partial<Record<GatewayRoute, readonly (readonly [string, string])[]>> = {
  settings: [['general', 'General'], ['providers', 'Providers'], ['access', 'Access'], ['search', 'Search']],
  activity: [['tasks', 'Tasks'], ['runs', 'Runs'], ['events', 'Activity log']],
  agents: [['agents', 'Agents'], ['teams', 'Teams'], ['skills', 'Skills']],
  system: [['overview', 'Overview'], ['processes', 'Processes'], ['ports', 'Ports'], ['containers', 'Containers'], ['terminal', 'Terminal'], ['native-sessions', 'Native sessions'], ['files', 'Files']],
  'companion-settings': [['identity', 'Identity & soul'], ['speaking', 'Speaking style'], ['appearance', 'Appearance'], ['voice', 'Voice'], ['modes', 'Expression & modes'], ['harness', 'Harness']],
}

export function gatewayPageNavigation(pathname: string, search: string) {
  const route = resolveGatewayRoute(pathname)
  const params = new URLSearchParams(search)
  const definitions = route ? routeSections[route] ?? [] : []
  const activeSection = definitions.find(([value]) => value === params.get('tab'))?.[0] ?? definitions[0]?.[0]
  const destination = gatewayDestinations.find(item => item.route === route && new URLSearchParams(item.path.split('?')[1]).get('tab') === activeSection)
    ?? gatewayDestinations.find(item => item.route === route)
  const title = route === 'chat' ? params.has('session') ? 'Chat' : 'New chat'
    : route === 'agents' && normalizedPath(pathname) !== '/agents' ? 'Edit agent'
      : route === 'tools' && params.has('draft') ? 'Workflow'
        : route === 'tools' && params.get('view') === 'mcp' ? 'MCP servers'
          : destination?.title ?? 'Conker'
  const sections = definitions.map(([value, label], index) => {
    const next = new URLSearchParams(search)
    if (index === 0) next.delete('tab'); else next.set('tab', value)
    return { value, label, to: `${gatewayDestinations.find(item => item.route === route)!.path.split('?')[0]}${next.size ? `?${next}` : ''}`, badge: undefined }
  })
  return { route, destination, title, activeSection, sections }
}

export function gatewayViewTitle(pathname: string, search: string): string {
  const page = gatewayPageNavigation(pathname, search)
  const requested = new URLSearchParams(search).get('tab')
  return page.sections.find(section => section.value === requested)?.label ?? page.title
}

const exactRoutes: Readonly<Record<string, GatewayRoute>> = {
  '/': 'today',
  '/overview': 'today',
  '/setup': 'setup',
  '/chat': 'chat',
  '/chats': 'chats',
  '/companion': 'chat',
  '/inbox': 'inbox',
  '/projects': 'projects',
  '/artifacts': 'artifacts',
  '/jobs': 'jobs',
  '/memory': 'memory',
  '/activity': 'activity',
  '/agents': 'agents',
  '/tools': 'tools',
  '/system': 'system',
  '/settings': 'settings',
  '/settings/companion': 'companion-settings',
}

const detailRoutes: readonly [RegExp, GatewayRoute][] = [
  [/^\/projects\/project_[0-9a-f]{32}$/, 'projects'],
  [/^\/artifacts\/artifact_[0-9a-f]{32}$/, 'artifacts'],
  [/^\/jobs\/job_[0-9a-f]{32}$/, 'jobs'],
  [/^\/agents\/agent_[0-9a-f]{32}\/edit$/, 'agents'],
]

function normalizedPath(pathname: string) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
}

export function resolveGatewayRoute(pathname: string): GatewayRoute | null {
  const path = normalizedPath(pathname)
  return exactRoutes[path] ?? detailRoutes.find(([pattern]) => pattern.test(path))?.[1] ?? null
}

export function gatewayConversationLink(sessionId: string, messageId?: string): string {
  const conversation = `/chat?session=${encodeURIComponent(sessionId)}`
  return messageId ? `${conversation}&message=${encodeURIComponent(messageId)}` : conversation
}

export const gatewaySystemSections = ['overview', 'processes', 'ports', 'containers', 'terminal', 'native-sessions', 'files'] as const
export type GatewaySystemSection = typeof gatewaySystemSections[number]

export function gatewaySystemSection(search: string): GatewaySystemSection {
  const requested = new URLSearchParams(search).get('tab')
  return gatewaySystemSections.find(section => section === requested) ?? 'overview'
}

export function gatewayAgentSection(search: string): 'agents' | 'teams' | 'skills' {
  const tab = new URLSearchParams(search).get('tab')
  return tab === 'teams' || tab === 'skills' ? tab : 'agents'
}
