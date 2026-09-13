"use client"

import * as React from "react"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { CommandSearch, SearchTrigger } from "@/components/command-search"
import { AppbarActions, AppbarBreadcrumbs, AppbarSections } from "@/components/appbar-navigation"
import { useSidebarConfig } from "@/hooks/use-sidebar-config"
import { usePageNavigation } from "@/hooks/use-page-navigation"

export function SiteHeader() {
  const { config } = useSidebarConfig()
  const navigation = usePageNavigation()
  const [searchOpen, setSearchOpen] = React.useState(false)

  React.useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setSearchOpen(open => !open)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  return <>
    <header data-slot="appbar" className="sticky top-0 z-20 flex shrink-0 flex-col border-b bg-background">
      <div className="flex h-(--header-height) w-full min-w-0 items-center gap-1 px-2 sm:gap-2">
        <SidebarTrigger className={config.collapsible === "none" ? "size-(--control-height) shrink-0 md:hidden" : "size-(--control-height) shrink-0"} />
        <Separator orientation="vertical" className={`mx-1 shrink-0 data-[orientation=vertical]:h-4 ${config.collapsible === "none" ? "md:hidden" : ""}`} />
        <AppbarBreadcrumbs crumbs={navigation.crumbs} />
        <AppbarActions actions={navigation.actions} />
        <SearchTrigger onClick={() => setSearchOpen(true)} />
      </div>
      <AppbarSections sections={navigation.sections} activeSection={navigation.activeSection} />
    </header>
    <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} />
  </>
}
