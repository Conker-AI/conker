import { type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { AppbarBreadcrumbs, AppbarSections } from '@/components/appbar-navigation'
import { WorkspaceAction, WorkspaceAppbar } from '@/components/design-system/workspace-chrome'
import { useSidebar } from '@/components/ui/sidebar'
import { UniversalSearchTrigger } from './universal-search'
import { gatewayPageNavigation } from './navigation'
import { useConnectedShell } from './workspace-shell-context'
import { ConversationViewStrip } from './conversation-views'
import { placeIcons } from './page-icons'

export function GatewayHeader({ children, toolbar, context, sections }: { children?: ReactNode; toolbar?: ReactNode; context?: ReactNode; sections?: ReactNode }) {
  const location = useLocation()
  const page = gatewayPageNavigation(location.pathname, location.search)
  const shell = useConnectedShell()
  const { isMobile, state } = useSidebar()
  const navigate = useNavigate()
  // Server's sections are sub-items in the sidebar (and the phone drawer); repeat them here only
  // while a collapsed sidebar hides them, the way Search moves here.
  const sectionsInSidebar = page.route === 'system' && (isMobile || state !== 'collapsed')
  const PageIcon = placeIcons[page.destination?.id ?? (page.route === 'chat' ? 'chats' : 'today')]
  return <><WorkspaceAppbar context={context ?? <div className="flex min-w-0 flex-1 items-center gap-2">
    {PageIcon && <span aria-hidden="true" data-slot="page-icon" className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-sidebar-accent-foreground [&_svg]:size-4"><PageIcon /></span>}
    <AppbarBreadcrumbs crumbs={[{ title: page.title, to: location.pathname }]} />
  </div>}
    search={isMobile || state === 'collapsed' ? <UniversalSearchTrigger /> : undefined}
    actions={<>{children}{shell?.showViews && <div className="conker-shell-actions">
      <ConversationViewStrip open={shell.view} onToggle={shell.toggleView} compact={isMobile} />
    </div>}{isMobile && page.route !== 'chat' && <WorkspaceAction iconOnly data-ask-conker aria-label="Ask Conker" title="Ask Conker" onClick={() => navigate('/chat')}><Plus /></WorkspaceAction>}</>}
    toolbar={toolbar} sections={<>{sections}{!sectionsInSidebar && <AppbarSections activeSection={page.activeSection} sections={page.sections} />}</>} />{shell?.panel}</>
}
