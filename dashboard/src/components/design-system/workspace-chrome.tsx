import { useState, type ReactNode } from 'react'
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
