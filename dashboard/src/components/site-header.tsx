"use client"

import * as React from "react"
import { useParams } from "react-router-dom"
import { useConker } from "@/lib/api/store"
import { ConversationAppbar } from "@/components/conversation-appbar"
import { AppbarSidebarToggle } from "@/components/appbar-sidebar-toggle"
import { CommandSearch, SearchTrigger } from "@/components/command-search"
import { AppbarActions, AppbarBreadcrumbs, AppbarSections } from "@/components/appbar-navigation"
import { usePageNavigation } from "@/hooks/use-page-navigation"

export function SiteHeader() {
  const navigation = usePageNavigation()
  const { id } = useParams()
  const session = useConker(data => data.sessions.find(item => item.id === (navigation.key === "companion" ? data.companionSessionId : navigation.key === "conversation" ? id : undefined)))
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
    <header data-slot="appbar" className="sticky top-0 z-20 flex shrink-0 flex-col border-b bg-background text-foreground">
      <div className="flex h-(--header-height) w-full min-w-0 items-center gap-1 px-2 sm:gap-2">
        <AppbarSidebarToggle compact={!!session} />
        {session ? <ConversationAppbar session={session} search={<SearchTrigger compact onClick={() => setSearchOpen(true)} />} /> : <><AppbarBreadcrumbs crumbs={navigation.crumbs} /><AppbarActions actions={navigation.actions} /><SearchTrigger onClick={() => setSearchOpen(true)} /></>}
      </div>
      <AppbarSections sections={navigation.sections} activeSection={navigation.activeSection} />
    </header>
    <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} />
  </>
}
