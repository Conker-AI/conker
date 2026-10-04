import { type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { activePageSection, appNavigation, matchAppRoute, pageSectionHref, pageSections } from '@/config/navigation'
import { AppbarBreadcrumbs, AppbarSections } from '@/components/appbar-navigation'
import { WorkspaceAction, WorkspaceAppbar } from '@/components/design-system/workspace-chrome'
import { UniversalSearchTrigger } from './universal-search'
import { useWorkspaceChrome } from '@/lib/workspace-chrome'
import { Activity, ArrowLeft, Bot, Brain, CalendarClock, FileText, Folder, Inbox, LayoutDashboard, MessageSquare, Settings2, ShieldCheck, SlidersHorizontal, Wrench } from 'lucide-react'

const routeIcons = { home: LayoutDashboard, chats: MessageSquare, inbox: Inbox, request: Inbox, memory: Brain, projects: Folder, project: Folder, artifacts: FileText, artifact: FileText, activity: Activity, agents: Bot, editAgent: Bot, tools: Wrench, jobs: CalendarClock, job: CalendarClock, system: SlidersHorizontal, settings: Settings2, companionSettings: Bot, setup: ShieldCheck }
const documentParents = { project: { to: '/projects', label: 'projects' }, artifact: { to: '/artifacts', label: 'artifacts' }, editAgent: { to: '/agents', label: 'agents' }, job: { to: '/jobs', label: 'jobs' } }

export function GatewayHeader({ children, toolbar, context, sections }: { children?: ReactNode; toolbar?: ReactNode; context?: ReactNode; sections?: ReactNode }) {
  const location = useLocation()
  const page = matchAppRoute(location.pathname)
  const chrome = useWorkspaceChrome()
  const Icon = routeIcons[page.key as keyof typeof routeIcons] ?? MessageSquare
  const parent = chrome?.documentTitle ? documentParents[page.key as keyof typeof documentParents] : undefined
  const title = location.pathname === '/' ? 'Today' : location.pathname === '/chats' ? 'Chats' : location.pathname === '/setup' ? 'Setup'
    : location.pathname === '/settings/companion' ? 'Companion'
    : /^\/agents\/agent_[0-9a-f]{32}\/edit$/.test(location.pathname) ? 'Edit agent' : appNavigation[page.key].title
  const params = new URLSearchParams(location.search)
  const tab = params.get('tab') ?? 'tasks'
  const studioSections = page.key === 'companionSettings' ? (pageSections.companionSettings ?? []).map(section => ({
    ...section, to: pageSectionHref('companionSettings', location.search, section.value), badge: undefined,
  })) : []
  const systemSections = page.key === 'system' ? (pageSections.system ?? []).filter(section => ['overview', 'processes', 'ports', 'containers', 'terminal', 'files'].includes(section.value)).map(section => ({
    ...section, to: pageSectionHref('system', location.search, section.value), badge: undefined,
  })) : []
  const agentSections = page.key === 'agents' ? (pageSections.agents ?? []).filter(section => ['agents', 'teams'].includes(section.value)).map(section => ({
    ...section, to: pageSectionHref('agents', location.search, section.value), badge: undefined,
  })) : []
  return <WorkspaceAppbar context={context ?? <>{chrome?.appearance === 'technical' && (parent ? <WorkspaceAction iconOnly asChild className="workspace-context-action"><Link to={parent.to} aria-label={`Back to ${parent.label}`} title={`Back to ${parent.label}`}><ArrowLeft /></Link></WorkspaceAction> : <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />)}<AppbarBreadcrumbs crumbs={[{ title: chrome?.documentTitle ?? title, to: location.pathname }]} /></>} search={<UniversalSearchTrigger />} actions={children} toolbar={toolbar} sections={<>
      {sections}
      {location.pathname === '/settings' && <AppbarSections activeSection={params.get('tab') === 'search' ? 'search' : 'general'} sections={[{ value: 'general', label: 'General', to: '/settings', badge: undefined }, { value: 'search', label: 'Search', to: '/settings?tab=search', badge: undefined }]} />}
      {location.pathname === '/activity' && <AppbarSections activeSection={tab} sections={['tasks', 'runs', 'events'].map(value => ({ value, label: value[0].toUpperCase() + value.slice(1), to: `/activity?tab=${value}`, badge: undefined }))} />}
      {studioSections.length > 0 && <AppbarSections activeSection={activePageSection('companionSettings', location.search)} sections={studioSections} />}
      {systemSections.length > 0 && <AppbarSections activeSection={activePageSection('system', location.search)} sections={systemSections} />}
      {agentSections.length > 0 && <AppbarSections activeSection={activePageSection('agents', location.search)} sections={agentSections} />}
    </>} />
}
