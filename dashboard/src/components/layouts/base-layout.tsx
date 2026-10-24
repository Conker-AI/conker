import { useConkerStore } from "@/lib/api/store"

import * as React from "react"
import { useLocation } from "react-router-dom"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { useSidebarConfig } from "@/hooks/use-sidebar-config"
import { LayoutFrame, type LayoutFrameProps } from "./layout-frame"

type BaseLayoutProps = Omit<LayoutFrameProps, "header" | "sidebar" | "error"> & {
  header?: React.ReactNode
  sidebar?: React.ReactNode
}

/** Fixture-mode pages: the preview sidebar, header and store feedback around the shared frame. */
export function BaseLayout({ header, sidebar, ...props }: BaseLayoutProps) {
  const error = useConkerStore(state => state.error)
  const { config } = useSidebarConfig()
  const { pathname } = useLocation()

  React.useEffect(() => {
    // Mutation feedback belongs to the page where the operation happened.
    useConkerStore.setState({ error: "", notice: "" })
  }, [pathname])

  return <LayoutFrame {...props} error={error}
    header={header ?? <SiteHeader />}
    sidebar={sidebar ?? <AppSidebar key="sidebar" variant={config.variant} collapsible={config.collapsible} side={config.side} />} />
}
