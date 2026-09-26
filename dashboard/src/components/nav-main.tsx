"use client"

import type { LucideIcon } from "lucide-react"
import { NavLink, useLocation } from "react-router-dom"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

export function NavMain({ label, items }: {
  label: string
  items: { title: string; url: string; icon?: LucideIcon; badge?: number }[]
}) {
  const location = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()
  const closeMobile = () => { if (isMobile) setOpenMobile(false) }
  const active = (url: string) => location.pathname === url
    || (url === "/chat" && location.pathname === "/chats")
    || (url !== "/" && location.pathname.startsWith(url + "/"))

  return <SidebarGroup>
    <SidebarGroupLabel>{label}</SidebarGroupLabel>
    <SidebarMenu>
      {items.map(item => <SidebarMenuItem key={item.url}>
        <SidebarMenuButton asChild tooltip={item.title} className="cursor-pointer" isActive={active(item.url)}>
          <NavLink to={item.url} end={item.url === "/"} onClick={closeMobile}>
            {item.icon && <item.icon />}
            <span>{item.title}</span>
          </NavLink>
        </SidebarMenuButton>
        {item.badge !== undefined && item.badge > 0 && <SidebarMenuBadge aria-label={`${item.badge} requests need you`}>{item.badge}</SidebarMenuBadge>}
      </SidebarMenuItem>)}
    </SidebarMenu>
  </SidebarGroup>
}
