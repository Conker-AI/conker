"use client"

import {
  Settings,
  Server,
  EllipsisVertical,
  BellDot,
  CircleUser,
} from "lucide-react"
import { Link } from "react-router-dom"
import type { ReactNode } from "react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

export function NavUser({
  user,
  footer,
}: {
  user: {
    name: string
    email: string
    avatar: string
  }
  footer?: ReactNode
}) {
  const { isMobile } = useSidebar()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton
              size="lg"
              className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground cursor-pointer" />}>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg">
                <Avatar><AvatarFallback>AL</AvatarFallback></Avatar>
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {user.email}
                </span>
              </div>
              <EllipsisVertical className="ml-auto size-4" />
            </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--anchor-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <div className="h-8 w-8 rounded-lg">
                  <Avatar><AvatarFallback>AL</AvatarFallback></Avatar>
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {user.email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem render={<Link to="/settings" />}><Settings />Settings</DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" render={<Link to="/settings/companion" />}>
                  <CircleUser />
                  Companion settings
                </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" render={<Link to="/system" />}>
                  <Server />
                  System
                </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" render={<Link to="/inbox" />}>
                  <BellDot />
                  Inbox
                </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {footer ?? <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Local fixture · no account connection</DropdownMenuLabel>}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
