"use client"

import * as React from "react"
import { PageContainer } from "@/components/layouts/page-container"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { CommandSearch, SearchTrigger } from "@/components/command-search"
import { ModeToggle } from "@/components/mode-toggle"
import { Palette } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCustomizerPreferences } from "@/components/theme-customizer/preferences"

const ThemeCustomizer = React.lazy(() => import("@/components/theme-customizer").then((module) => ({ default: module.ThemeCustomizer })))

export function SiteHeader() {
  const [searchOpen, setSearchOpen] = React.useState(false)
  const { open: customizerOpen, setOpen: setCustomizerOpen } = useCustomizerPreferences()

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setSearchOpen((open) => !open)
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  return (
    <>
      <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
        <PageContainer className="flex items-center gap-1 py-3 lg:gap-2">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mx-2 data-[orientation=vertical]:h-4"
          />
          <div className="flex-1 max-w-sm">
            <SearchTrigger onClick={() => setSearchOpen(true)} />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="icon" aria-label="Customize theme and layout" onClick={() => setCustomizerOpen(true)}><Palette /></Button>
            <ModeToggle />
          </div>
        </PageContainer>
      </header>
      <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} />
      <React.Suspense fallback={null}><ThemeCustomizer open={customizerOpen} onOpenChange={setCustomizerOpen} /></React.Suspense>
    </>
  )
}
