import { useConkerStore } from "@/lib/api/store"

import * as React from "react"
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
  variant?: "page" | "conversation"
}

export function BaseLayout({ children, title, description, actions, variant = "page" }: BaseLayoutProps) {
  const error = useConkerStore(state => state.error)
  const { config } = useSidebarConfig()
  const conversation = variant === "conversation"

  const content = (
    <SidebarInset key="content" className={conversation ? "min-h-0 overflow-clip" : undefined}>
      <SiteHeader />
      {conversation ? <div className="flex min-h-0 flex-1 flex-col">
        {error && <p role="alert" className="shrink-0 border-b border-destructive/40 px-4 py-3 text-sm text-destructive">{error}</p>}
        {children}
      </div> : <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <PageContainer className="flex flex-col gap-(--page-section-gap) py-6 pb-8 sm:pt-10">
            {title && <PageHeader title={title} description={description} actions={actions} />}
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
      className={cn(config.side === "right" && "flex-row-reverse", conversation && "h-dvh min-h-0 overflow-clip")}
    >
      {sidebar}
      {content}
    </SidebarProvider>
  )
}
