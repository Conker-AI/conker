import { type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { PanelRight, PanelsTopLeft } from 'lucide-react'
import { AppbarBreadcrumbs, AppbarSections } from '@/components/appbar-navigation'
import { WorkspaceAction, WorkspaceAppbar } from '@/components/design-system/workspace-chrome'
import { useSidebar } from '@/components/ui/sidebar'
import { UniversalSearchTrigger } from './universal-search'
import { gatewayPageNavigation } from './navigation'
import { useConnectedShell } from './workspace-shell-context'

export function GatewayHeader({ children, toolbar, context, sections }: { children?: ReactNode; toolbar?: ReactNode; context?: ReactNode; sections?: ReactNode }) {
  const location = useLocation()
  const page = gatewayPageNavigation(location.pathname, location.search)
  const shell = useConnectedShell()
  const { isMobile, state } = useSidebar()
  return <WorkspaceAppbar context={context ?? <AppbarBreadcrumbs crumbs={[{ title: page.title, to: location.pathname }]} />}
    search={isMobile || state === 'collapsed' ? <UniversalSearchTrigger /> : undefined}
    actions={<>{children}{shell && <div className="conker-shell-actions">
      <WorkspaceAction iconOnly aria-label="Open views" title={`Open views (${shell.openViewCount})`} aria-expanded={shell.tabsOpen} aria-controls="conker-open-views" onClick={shell.toggleTabs}><PanelsTopLeft /></WorkspaceAction>
      {shell.showContext && <WorkspaceAction iconOnly aria-label="Conversation context" title="Conversation context" aria-expanded={shell.contextOpen} aria-controls="conker-conversation-context" onClick={shell.toggleContext}><PanelRight /></WorkspaceAction>}
    </div>}</>}
    toolbar={toolbar} sections={<>{sections}<AppbarSections activeSection={page.activeSection} sections={page.sections} /></>} />
}
