import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { useSidebarConfig } from '@/hooks/use-sidebar-config'
import { cn } from '@/lib/utils'

/** Every appbar uses the same collapse behavior, including fixed desktop sidebars. */
export function AppbarSidebarToggle({ compact = false, separator = true }: { compact?: boolean; separator?: boolean }) {
  const { config } = useSidebarConfig()
  const visibility = config.collapsible === 'none' ? 'md:hidden' : undefined
  return <>
    <SidebarTrigger className={cn(compact ? 'size-8' : 'size-(--control-height)', 'shrink-0', visibility)} aria-label="Toggle sidebar" />
    {separator && <Separator orientation="vertical" className={cn('mx-1 shrink-0 data-[orientation=vertical]:h-4', visibility)} />}
  </>
}
