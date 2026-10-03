import { Children, Fragment, cloneElement, isValidElement, useState, type ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar'
import { WorkspaceChromeContext, useWorkspaceChrome } from '@/lib/workspace-chrome'

export function WorkspaceChromeProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<HTMLDivElement | null>(null)
  return <WorkspaceChromeContext.Provider value={{ actions, setActions }}>{children}</WorkspaceChromeContext.Provider>
}

export type WorkspaceAppbarProps = {
  context: ReactNode
  search?: ReactNode
  actions?: ReactNode
  sections?: ReactNode
  toolbar?: ReactNode
}

function actionItems(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap(child => isValidElement<{ children?: ReactNode }>(child) && (child.type === Fragment || child.type === 'div') ? actionItems(child.props.children) : [child])
}

/** Keep the final primary command reachable; disclose secondary commands on phones. */
export function WorkspaceRouteActions({ children }: { children: ReactNode }) {
  const { isMobile } = useSidebar()
  const items = actionItems(children)
  if (!isMobile || items.length < 2) return children
  return <>{items[items.length - 1]}<DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="More workspace actions" title="More workspace actions"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" aria-label="More workspace actions">
    {items.slice(0, -1).map((item, index) => isValidElement<{ className?: string; disabled?: boolean; children?: ReactNode; 'aria-label'?: string }>(item) ? <DropdownMenuItem key={index} asChild disabled={item.props.disabled}>{cloneElement(item, { className: 'w-full justify-start whitespace-normal text-left', children: item.props['aria-label'] ? <>{item.props.children}<span>{item.props['aria-label']}</span></> : item.props.children })}</DropdownMenuItem> : item)}
  </DropdownMenuContent></DropdownMenu></>
}

/** One frame serves collection pages, conversations and graph workspaces. */
export function WorkspaceAppbar({ context, search, actions, sections, toolbar }: WorkspaceAppbarProps) {
  const { isMobile, openMobile, state } = useSidebar()
  const hidden = isMobile ? !openMobile : state === 'collapsed'
  const chrome = useWorkspaceChrome()
  return <header data-slot="appbar" className="workspace-appbar sticky top-0 z-20 shrink-0 border-b bg-background text-foreground">
    <div className="workspace-appbar-row">
      <div className="workspace-appbar-context">
        {hidden && <SidebarTrigger className="workspace-sidebar-trigger" aria-label="Expand sidebar" title="Expand sidebar" />}
        {context}
      </div>
      <div className="workspace-appbar-search">{search}</div>
      <div className="workspace-appbar-actions" aria-label="Workspace actions" role="toolbar">
        <div ref={chrome?.setActions} className="workspace-route-actions" />
        {actions}
      </div>
    </div>
    {sections}
    {toolbar && <div className="workspace-appbar-toolbar">{toolbar}</div>}
  </header>
}
