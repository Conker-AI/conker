import { useConkerStore } from "@/lib/api/store"
"use client"

import * as React from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { PageContainer } from "./page-container"
import { useSidebarConfig } from "@/hooks/use-sidebar-config"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"

interface BaseLayoutProps {
  children: React.ReactNode
  title?: string
  description?: string
}

export function BaseLayout({ children, title, description }: BaseLayoutProps) {
  const error = useConkerStore(state => state.error)
  const { config } = useSidebarConfig()

  const content = (
    <SidebarInset>
      <SiteHeader />
      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <PageContainer className="flex flex-col gap-6 py-6">
            {title && (
              <div>
                <div className="flex flex-col gap-1">
                  <h1 className="text-2xl font-semibold tracking-tight">
                    {title}
                  </h1>
                  {description && (
                    <p className="text-muted-foreground text-sm">{description}</p>
                  )}
                </div>
              </div>
            )}
            {error && <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
            {children}
          </PageContainer>
        </div>
      </div>
    </SidebarInset>
  )

  const sidebar = (
    <AppSidebar
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
      className={config.collapsible === "none" ? "sidebar-none-mode" : ""}
    >
      {config.side === "left" ? (
        <>
          {sidebar}
          {content}
        </>
      ) : (
        <>
          {content}
          {sidebar}
        </>
      )}
    </SidebarProvider>
  )
}
