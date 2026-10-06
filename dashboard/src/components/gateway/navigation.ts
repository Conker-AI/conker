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

export const gatewaySidebarDestinations = [
  { route: 'today', title: 'Today', path: '/' },
  { route: 'chats', title: 'Chats', path: '/chats' },
  { route: 'inbox', title: 'Inbox', path: '/inbox' },
  { route: 'projects', title: 'Projects', path: '/projects' },
  { route: 'artifacts', title: 'Artifacts', path: '/artifacts' },
  { route: 'jobs', title: 'Jobs', path: '/jobs' },
  { route: 'memory', title: 'Memory', path: '/memory' },
  { route: 'activity', title: 'Activity', path: '/activity' },
  { route: 'agents', title: 'Agents', path: '/agents' },
  { route: 'tools', title: 'Tools', path: '/tools' },
  { route: 'system', title: 'System', path: '/system' },
] as const satisfies readonly { route: GatewayRoute; title: string; path: string }[]

export const gatewayCommandDestinations = [
  { title: 'Today', path: '/' },
  { title: 'New chat', path: '/chat' },
  ...gatewaySidebarDestinations.filter(item => item.route !== 'today'),
  { title: 'Companion settings', path: '/settings/companion' },
  { title: 'Model settings', path: '/settings' },
  { title: 'Setup & readiness', path: '/setup' },
] as const

const exactRoutes: Readonly<Record<string, GatewayRoute>> = {
  '/': 'today',
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

export const gatewaySystemSections = ['overview', 'processes', 'ports', 'containers', 'terminal', 'files'] as const
export type GatewaySystemSection = typeof gatewaySystemSections[number]

export function gatewaySystemSection(search: string): GatewaySystemSection {
  const requested = new URLSearchParams(search).get('tab')
  return gatewaySystemSections.find(section => section === requested) ?? 'overview'
}

export function gatewayAgentSection(search: string): 'agents' | 'teams' {
  return new URLSearchParams(search).get('tab') === 'teams' ? 'teams' : 'agents'
}
