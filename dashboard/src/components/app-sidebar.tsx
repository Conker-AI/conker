import { CompanionPortrait } from "@/components/companion-portrait"
import { Button } from "@/components/ui/button"

import * as React from "react"
import {
  Home,
  MessageCircle,
  Inbox,
  BookOpen,
  History,
  Bot,
  Wrench,
  Briefcase,
  Settings,
  Server,
  Terminal,
  Sprout,
} from "lucide-react"
import { Link } from "react-router-dom"
import { useConker } from "@/lib/api/store"

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
        { title: "Home", url: "/", icon: Home },
        { title: "Chats", url: "/chat", icon: MessageCircle },
        { title: "Inbox", url: "/inbox", icon: Inbox },
      ],
    },
    {
      label: "Reference",
      items: [
        { title: "Memory", url: "/memory", icon: BookOpen },
        { title: "Journal", url: "/journal", icon: History },
      ],
    },
    {
      label: "Control",
      items: [
        { title: "Agents", url: "/agents", icon: Bot },
        { title: "Tools", url: "/tools", icon: Wrench },
        { title: "Jobs", url: "/jobs", icon: Briefcase },
        { title: "System", url: "/system", icon: Server },
        { title: "Terminal", url: "/terminal", icon: Terminal },
        { title: "Settings", url: "/settings", icon: Settings },
      ],
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const profile = useConker(data => data.profile)
  const owner = useConker(data => data.auth.ownerName)
  const pendingCount = useConker((state) => state.tickets.filter((ticket) => ticket.status === "Needs you").length)
  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-1">
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Sprout className="size-5" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Conker</span>
                  <span className="truncate text-xs text-muted-foreground">
                    Your companion
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
            <Button asChild variant="ghost" size="icon" className="shrink-0 group-data-[collapsible=icon]:hidden"><Link to="/" aria-label={`Talk to ${profile.name}`} title={profile.mood}><CompanionPortrait profile={profile} className="size-8" /></Link></Button>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {data.navGroups.map((group) => (
          <NavMain key={group.label} label={group.label} items={group.items.map((item) => item.url === "/inbox" ? { ...item, badge: pendingCount } : item)} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={{ ...data.user, name: owner }} />
      </SidebarFooter>
    </Sidebar>
  )
}
