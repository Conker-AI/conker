import { useConkerStore } from "@/lib/api/store"

import * as React from "react"
import { useLocation } from "react-router-dom"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { PageHeader } from "@/components/design-system"
import { PageContainer } from "./page-container"
import { cn } from "@/lib/utils"
import { useSidebarConfig } from "@/hooks/use-sidebar-config"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"

interface BaseLayoutProps {
  children: React.ReactNode
  title?: string
  description?: string
  actions?: React.ReactNode
  status?: React.ReactNode
  variant?: "page" | "collection" | "conversation" | "workspace"
}

export function BaseLayout({ children, title, description, actions, status, variant = "page" }: BaseLayoutProps) {
  const error = useConkerStore(state => state.error)
  const { config } = useSidebarConfig()
  const conversation = variant === "conversation"
  const workspace = variant === "workspace"
  const collection = variant === "collection"
  const { pathname, search } = useLocation()
  const pageScroll = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    pageScroll.current?.scrollTo(0, 0)
  }, [pathname, search])

  const content = (
    <SidebarInset key="content" className="min-h-0 overflow-clip">
      <SiteHeader />
      {conversation ? <div className="flex min-h-0 flex-1 flex-col">
        {error && <p role="alert" className="shrink-0 border-b border-destructive/40 px-4 py-3 text-sm text-destructive">{error}</p>}
        {children}
      </div> : <div ref={pageScroll} data-slot="page-scroll" role="region" aria-label={`${title ?? "Page"} content`} tabIndex={0}
        className={cn("flex min-h-0 flex-1 flex-col focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring", workspace ? "overflow-hidden" : "overflow-y-auto")}>
        <div className={cn("@container/main flex flex-1 flex-col gap-2", workspace && "min-h-0")}>
          <PageContainer className={cn("flex flex-col gap-(--page-section-gap) py-6 pb-8", collection && "gap-(--collection-section-gap)", workspace && "min-h-0 flex-1")}>
            {title && <PageHeader title={title} description={description} actions={actions} status={status} density={collection ? "compact" : "standard"} />}
            {error && <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
            {children}
          </PageContainer>
        </div>
      </div>}
    </SidebarInset>
  )

  const sidebar = (
    <AppSidebar
      key="sidebar"
      variant={config.variant}
      collapsible={config.collapsible}
      side={config.side}
    />
  )

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "16rem",
          "--sidebar-width-icon": "3rem",
          "--header-height": "calc(var(--spacing) * 14)",
        } as React.CSSProperties
      }
      className={cn("h-dvh min-h-0 overflow-clip", config.side === "right" && "flex-row-reverse")}
    >
      {sidebar}
      {content}
    </SidebarProvider>
  )
}
