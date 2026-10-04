import { Children, Fragment, cloneElement, isValidElement, useEffect, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar'
import { WorkspaceChromeContext, useWorkspaceChrome } from '@/lib/workspace-chrome'
import { cn } from '@/lib/utils'

type WorkspaceActionProps = Omit<ComponentProps<typeof Button>, 'size' | 'variant'> & {
  emphasis?: 'quiet' | 'primary'; iconOnly?: boolean; menuItem?: boolean
}

/** Routine toolbar commands are quiet; only an explicit commitment earns primary emphasis. */
export function WorkspaceAction({ emphasis = 'quiet', iconOnly = false, menuItem = false, className, ...props }: WorkspaceActionProps) {
  return <Button {...props} data-slot="workspace-action" size={iconOnly && !menuItem ? 'icon' : 'sm'}
    variant={iconOnly || menuItem ? 'ghost' : emphasis === 'primary' ? 'default' : 'outline'}
    className={cn(emphasis === 'quiet' && 'shadow-none', !menuItem && (iconOnly ? 'size-(--control-height-sm) max-sm:size-(--control-height)' : 'max-sm:min-h-(--control-height)'), menuItem && 'h-auto min-h-(--control-height-sm) w-full justify-start whitespace-normal text-left shadow-none', className)} />
}

export function WorkspaceChromeProvider({ children, appearance = 'original' }: { children: ReactNode; appearance?: 'original' | 'technical' }) {
  const [actions, setActions] = useState<HTMLDivElement | null>(null)
  const [search, setSearch] = useState<HTMLDivElement | null>(null)
  const [summary, setSummary] = useState<HTMLDivElement | null>(null)
  const [searchOwner, setSearchOwner] = useState<string | null>(null)
  const [compactSearch, setCompactSearch] = useState(false)
  const [documentTitle, setDocumentTitle] = useState<string | null>(null)
  const [controls, setControls] = useState<HTMLDivElement | null>(null)
  return <WorkspaceChromeContext.Provider value={{ appearance, documentTitle, setDocumentTitle, controls, setControls, actions, setActions, search, setSearch, summary, setSummary, searchOwner, setSearchOwner, compactSearch, setCompactSearch }}>{children}</WorkspaceChromeContext.Provider>
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

/** Keep primary work reachable even when the sidebar leaves a narrow action column. */
export function WorkspaceRouteActions({ children }: { children: ReactNode }) {
  const { isMobile } = useSidebar()
  const items = actionItems(children)
  const group = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState<number | null>(null)
  useLayoutEffect(() => {
    const container = group.current?.closest('.workspace-appbar-actions')
    if (!container) return
    setAvailableWidth(container.getBoundingClientRect().width)
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(entry.contentRect.width))
    observer.observe(container)
    return () => observer.disconnect()
  }, [])
  const compact = isMobile || items.length > 2 || availableWidth === null || availableWidth < 224
  return <div ref={group}>{items.length < 2 || !compact ? children : <>{items[items.length - 1]}<DropdownMenu><DropdownMenuTrigger asChild><WorkspaceAction iconOnly aria-label="More workspace actions" title="More workspace actions"><MoreHorizontal /></WorkspaceAction></DropdownMenuTrigger><DropdownMenuContent align="end" aria-label="More workspace actions">
    {items.slice(0, -1).map((item, index) => isValidElement<{ className?: string; disabled?: boolean; children?: ReactNode; 'aria-label'?: string; menuItem?: boolean }>(item) ? <DropdownMenuItem key={index} asChild disabled={item.props.disabled}>{cloneElement(item, { ...(item.type === WorkspaceAction ? { menuItem: true } : {}), className: 'w-full justify-start whitespace-normal text-left', children: item.props['aria-label'] ? <>{item.props.children}<span>{item.props['aria-label']}</span></> : item.props.children })}</DropdownMenuItem> : item)}
  </DropdownMenuContent></DropdownMenu></>}</div>
}

/** One frame serves collection pages, conversations and graph workspaces. */
export function WorkspaceAppbar({ context, search, actions, sections, toolbar }: WorkspaceAppbarProps) {
  const { isMobile, openMobile, state } = useSidebar()
  const hidden = isMobile ? !openMobile : state === 'collapsed'
  const chrome = useWorkspaceChrome()
  const header = useRef<HTMLElement>(null)
  const setCompactSearch = chrome?.setCompactSearch
  useEffect(() => {
    if (!header.current || !setCompactSearch) return
    const node = header.current
    const update = () => setCompactSearch(window.innerWidth < 1024 || node.getBoundingClientRect().width <= 900)
    const observer = new ResizeObserver(update)
    observer.observe(node)
    window.addEventListener('resize', update)
    update()
    return () => { observer.disconnect(); window.removeEventListener('resize', update) }
  }, [setCompactSearch])
  return <header ref={header} data-slot="appbar" className="workspace-appbar sticky top-0 z-20 shrink-0 border-b bg-background text-foreground">
    <div className="workspace-appbar-row">
      <div className="workspace-appbar-context">
        {hidden && <SidebarTrigger className="workspace-sidebar-trigger" aria-label="Expand sidebar" title="Expand sidebar" />}
        {context}
        <div ref={chrome?.setSummary} className="workspace-appbar-summary shrink-0" />
      </div>
      <div ref={chrome?.setSearch} className="workspace-appbar-search">{search}</div>
      <div className="workspace-appbar-actions" aria-label="Workspace actions" role="toolbar">
        <div ref={chrome?.setActions} className="workspace-route-actions" />
        {actions}
      </div>
    </div>
    {sections}
    <div ref={chrome?.setControls} className="workspace-document-controls" />
    {toolbar && <div className="workspace-appbar-toolbar">{toolbar}</div>}
  </header>
}
