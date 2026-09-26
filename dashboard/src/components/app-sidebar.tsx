import { appNavigation } from "@/config/navigation"
import { CompanionPortrait } from "@/components/companion-portrait"
import { ModeToggle } from "@/components/mode-toggle"

import * as React from "react"
import {
  Home,
  MessageCircle,
  Inbox,
  BookOpen,
  Folder,
  Files,
  History,
  Bot,
  Wrench,
  Briefcase,
  Settings,
  Server,
} from "lucide-react"
import { Link } from "react-router-dom"
import { useConkerStore } from "@/lib/api/store"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

const data = {
  user: {
    name: "Alexey",
    email: "On your own terms",
    avatar: "",
  },
  navGroups: [
    {
      label: "Daily loop",
      items: [
        { title: "Home", url: appNavigation.home.path, icon: Home },
        { title: "Chats", url: appNavigation.chats.path, icon: MessageCircle },
        { title: "Inbox", url: appNavigation.inbox.path, icon: Inbox },
      ],
    },
    {
      label: "Reference",
      items: [
        { title: "Projects", url: appNavigation.projects.path, icon: Folder },
        { title: "Artifacts", url: appNavigation.artifacts.path, icon: Files },
        { title: "Memory", url: appNavigation.memory.path, icon: BookOpen },
      ],
    },
    {
      label: "Control",
      items: [
        { title: "Activity", url: appNavigation.activity.path, icon: History },
        { title: "Agents", url: appNavigation.agents.path, icon: Bot },
        { title: "Tools", url: appNavigation.tools.path, icon: Wrench },
        { title: "Jobs", url: appNavigation.jobs.path, icon: Briefcase },
        { title: "System", url: appNavigation.system.path, icon: Server },
        { title: "Settings", url: appNavigation.settings.path, icon: Settings },
      ],
    },
  ],
}

export function AppSidebar({ ownerName, ownerDescription, inboxCount, accountFooter, headerActions, headerBadge, children, ...props }: React.ComponentProps<typeof Sidebar> & {
  ownerName?: string
  ownerDescription?: string
  inboxCount?: number
  accountFooter?: React.ReactNode
  headerActions?: React.ReactNode
  headerBadge?: React.ReactNode
}) {
  const { isMobile, setOpenMobile } = useSidebar()
  const profile = useConkerStore(state => state.data?.profile)
  const storedOwner = useConkerStore(state => state.data?.auth.ownerName)
  const storedCount = useConkerStore(state => state.data?.tickets.filter(ticket => ticket.status === "Needs you").length ?? 0)
  const owner = ownerName ?? storedOwner ?? "Owner"
  const pendingCount = inboxCount ?? storedCount
  return (
    <Sidebar {...props}>
      <SidebarHeader className="px-3 py-3 group-data-[collapsible=icon]:px-1 group-data-[collapsible=icon]:py-2">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2 group-data-[collapsible=icon]:flex-col">
            <SidebarMenuButton size="lg" asChild tooltip="Open companion" className="min-w-0 flex-1 gap-3 group-data-[collapsible=icon]:flex-none">
              <Link to="/companion" onClick={() => { if (isMobile) setOpenMobile(false) }} aria-label={`${profile?.name ?? 'Conker'} companion screen`}>
                <CompanionPortrait profile={profile} portrait={profile?.portrait ?? '/conker.png'} name={profile?.name ?? 'Conker'} className="size-8 rounded-lg" />
                <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate font-semibold">{profile?.name ?? 'Conker'}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    Your companion
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
            <ModeToggle />
          </SidebarMenuItem>
        </SidebarMenu>
        {headerBadge && <div className="group-data-[collapsible=icon]:hidden">{headerBadge}</div>}
        {headerActions}
      </SidebarHeader>
      <SidebarContent>
        {data.navGroups.map((group) => (
          <NavMain key={group.label} label={group.label} items={group.items.map((item) => item.url === "/inbox" ? { ...item, badge: pendingCount } : item)} />
        ))}
        {children}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={{ ...data.user, name: owner, email: ownerDescription ?? data.user.email }} footer={accountFooter} />
      </SidebarFooter>
    </Sidebar>
  )
}
