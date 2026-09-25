import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar'

/** The sidebar toggle belongs on the canvas only while the sidebar is hidden (always on phones). */
export function CanvasToggle() {
  const { isMobile, state } = useSidebar()
  return isMobile || state === 'collapsed' ? <SidebarTrigger className="size-9 text-muted-foreground" aria-label="Open sidebar" /> : null
}
