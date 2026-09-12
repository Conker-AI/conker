"use client"

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
  Server,
  Terminal,
  Sprout,
} from "lucide-react"
import { Link } from "react-router-dom"

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
      ],
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
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
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {data.navGroups.map((group) => (
          <NavMain key={group.label} label={group.label} items={group.items} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
