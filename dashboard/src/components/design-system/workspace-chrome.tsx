import { Children, Fragment, cloneElement, isValidElement, useEffect, useRef, useState, type ComponentProps, type ReactElement, type ReactNode } from 'react'
import { Menu, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar'
import { WorkspaceChromeContext, useInboxAttention, useWorkspaceChrome } from '@/lib/workspace-chrome'
import { splitActionLabel } from '@/lib/route-actions'
import { cn } from '@/lib/utils'

type WorkspaceActionProps = Omit<ComponentProps<typeof Button>, 'size' | 'variant'> & {
  emphasis?: 'quiet' | 'primary'; iconOnly?: boolean; menuItem?: boolean
  /** The page's main action: it stays in the phone top bar instead of the "…" menu. */
  keepVisible?: boolean
}

/** Routine toolbar commands are quiet; only an explicit commitment earns primary emphasis. */
export function WorkspaceAction({ emphasis = 'quiet', iconOnly = false, menuItem = false, keepVisible, className, ...props }: WorkspaceActionProps) {
  return <Button {...props} data-slot="workspace-action" data-keep-visible={keepVisible || undefined} size={iconOnly && !menuItem ? 'icon' : 'sm'}
    variant={iconOnly || menuItem ? 'ghost' : emphasis === 'primary' ? 'default' : 'outline'}
    className={cn(emphasis === 'quiet' && 'shadow-none', !menuItem && (iconOnly ? 'size-(--control-height-sm) max-sm:size-(--control-height)' : 'max-sm:min-h-(--control-height)'), menuItem && 'h-auto min-h-(--control-height-sm) w-full justify-start whitespace-normal text-left shadow-none', className)} />
}

/** Choices keep native Select behavior inline and real menu items in overflow. */
export function WorkspaceChoice({ label, value, options, onValueChange, disabled, menuItem = false, mobileMenu = false }: {
  label: string; value: string; options: readonly { value: string; label: string }[]; onValueChange: (value: string) => void; disabled?: boolean; menuItem?: boolean; mobileMenu?: boolean
}) {
  if (menuItem && mobileMenu) return <><DropdownMenuLabel>{label}</DropdownMenuLabel><DropdownMenuRadioGroup aria-label={label} value={value} onValueChange={onValueChange}>{options.map(option => <DropdownMenuRadioItem key={option.value} value={option.value} disabled={disabled}>{option.label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup><DropdownMenuSeparator /></>
  if (menuItem) return <DropdownMenuSub><DropdownMenuSubTrigger disabled={disabled}>{label}: {options.find(option => option.value === value)?.label ?? value}</DropdownMenuSubTrigger><DropdownMenuSubContent><DropdownMenuRadioGroup value={value} onValueChange={onValueChange}>{options.map(option => <DropdownMenuRadioItem key={option.value} value={option.value}>{option.label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuSubContent></DropdownMenuSub>
  return <Select value={value} onValueChange={value => { if (value !== null) onValueChange(value) }} disabled={disabled} items={[...options.map((option) => ({ value: option.value, label: option.label }))]}><SelectTrigger aria-label={label} size="sm"><SelectValue /></SelectTrigger><SelectContent>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>
}

export function WorkspaceChromeProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<HTMLDivElement | null>(null)
  const [search, setSearch] = useState<HTMLDivElement | null>(null)
  const [summary, setSummary] = useState<HTMLDivElement | null>(null)
  const [searchOwner, setSearchOwner] = useState<string | null>(null)
  const [compactSearch, setCompactSearch] = useState(false)
  return <WorkspaceChromeContext.Provider value={{ actions, setActions, search, setSearch, summary, setSummary, searchOwner, setSearchOwner, compactSearch, setCompactSearch }}>{children}</WorkspaceChromeContext.Provider>
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
  useEffect(() => {
    const container = group.current?.closest('.workspace-appbar-actions')
    if (!container) return
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(entry.contentRect.width))
    observer.observe(container)
    return () => observer.disconnect()
  }, [])
  const compact = isMobile || items.length > 2 || availableWidth === null || availableWidth < 224
  // On a phone only the page's main action stays out of the menu, so the page name keeps its room.
  const keptRaw = isMobile ? items.filter(item => isValidElement<{ keepVisible?: boolean; emphasis?: string }>(item) && (item.props.keepVisible || item.props.emphasis === 'primary')).slice(-1) : items.slice(-1)
  // On a phone the kept action shows its icon and keeps its words as the accessible name.
  const kept = keptRaw.map(item => {
    if (!isMobile || !isValidElement<{ children?: ReactNode; 'aria-label'?: string }>(item)) return item
    const { label, icons } = splitActionLabel(item.props.children)
    if (!icons.length) return item
    const name = item.props['aria-label'] || label
    return cloneElement(item as ReactElement<WorkspaceActionProps>, { iconOnly: true, 'aria-label': name, title: name, children: icons })
  })
  const menu = items.filter(item => !keptRaw.includes(item))
  return <div ref={group} className="flex shrink-0 items-center gap-1">{items.length < 2 || !compact ? children : <>{kept}<DropdownMenu><DropdownMenuTrigger render={<WorkspaceAction iconOnly aria-label="More workspace actions" title="More workspace actions" />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end" aria-label="More workspace actions">
    {menu.map((item, index) => isValidElement<{ className?: string; disabled?: boolean; children?: ReactNode; 'aria-label'?: string; menuItem?: boolean; mobileMenu?: boolean }>(item) ? item.type === WorkspaceChoice ? cloneElement(item, { key: index, menuItem: true, mobileMenu: isMobile }) : <DropdownMenuItem key={index} disabled={item.props.disabled} render={cloneElement(item, { ...(item.type === WorkspaceAction ? { menuItem: true } : {}), className: 'w-full justify-start whitespace-normal text-left', children: item.props['aria-label'] ? <>{item.props.children}<span>{item.props['aria-label']}</span></> : item.props.children })} /> : item)}
  </DropdownMenuContent></DropdownMenu></>}</div>
}

/** One frame serves collection pages, conversations and graph workspaces. */
export function WorkspaceAppbar({ context, search, actions, sections, toolbar }: WorkspaceAppbarProps) {
  const { isMobile, state, toggleSidebar } = useSidebar()
  // Keep the mobile opener mounted behind the modal so dismissal can restore its focus.
  const showSidebarTrigger = isMobile || state === 'collapsed'
  // The phone's menu button carries the Inbox count so nothing that needs the owner hides in the drawer.
  const menuCount = useInboxAttention()
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
        {showSidebarTrigger && (isMobile
          // A phone gets the familiar menu button, carrying the Inbox count (owner, 23 October).
          ? <div className="relative shrink-0">
            <Button type="button" variant="ghost" size="icon" data-slot="sidebar-trigger" className="workspace-sidebar-trigger" aria-label={`Menu${menuCount ? `, ${menuCount} waiting for you` : ''}`} title="Menu"
              onClick={event => { if (!event.defaultPrevented) toggleSidebar(event.currentTarget) }}><Menu /></Button>
            {!!menuCount && <span aria-hidden="true" className="pointer-events-none absolute -top-1 right-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">{menuCount}</span>}
          </div>
          : <SidebarTrigger className="workspace-sidebar-trigger" aria-label="Expand the sidebar" title="Expand the sidebar" />)}
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
    {toolbar && <div className="workspace-appbar-toolbar">{toolbar}</div>}
  </header>
}
