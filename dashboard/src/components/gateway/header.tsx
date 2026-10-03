import { type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { activePageSection, appNavigation, matchAppRoute, pageSectionHref, pageSections } from '@/config/navigation'
import { AppbarBreadcrumbs, AppbarSections } from '@/components/appbar-navigation'
import { WorkspaceAppbar } from '@/components/design-system/workspace-chrome'
import { UniversalSearchTrigger } from './universal-search'

export function GatewayHeader({ children, toolbar, context, sections }: { children?: ReactNode; toolbar?: ReactNode; context?: ReactNode; sections?: ReactNode }) {
  const location = useLocation()
  const page = matchAppRoute(location.pathname)
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
  return <WorkspaceAppbar context={context ?? <AppbarBreadcrumbs crumbs={[{ title, to: location.pathname }]} />} search={<UniversalSearchTrigger />} actions={children} toolbar={toolbar} sections={<>
      {sections}
      {location.pathname === '/activity' && <AppbarSections activeSection={tab} sections={['tasks', 'runs', 'events'].map(value => ({ value, label: value[0].toUpperCase() + value.slice(1), to: `/activity?tab=${value}`, badge: undefined }))} />}
      {studioSections.length > 0 && <AppbarSections activeSection={activePageSection('companionSettings', location.search)} sections={studioSections} />}
      {systemSections.length > 0 && <AppbarSections activeSection={activePageSection('system', location.search)} sections={systemSections} />}
      {agentSections.length > 0 && <AppbarSections activeSection={activePageSection('agents', location.search)} sections={agentSections} />}
    </>} />
}
