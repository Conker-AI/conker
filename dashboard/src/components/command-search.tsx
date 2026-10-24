"use client"

import { appNavigation, pageSectionHref } from "@/config/navigation"
import { useNavigate } from "react-router-dom"
import {
  Search,
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
  FolderTree,
  Folder,
  Files,
  type LucideIcon,
} from "lucide-react"

import { Command, CommandCollection, CommandDialog, CommandDialogPopup, CommandEmpty, CommandGroup, CommandGroupLabel, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"

interface SearchItem {
  title: string
  url: string
  group: string
  icon?: LucideIcon
}

interface CommandSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandSearch({ open, onOpenChange }: CommandSearchProps) {
  const navigate = useNavigate()

  const searchItems: SearchItem[] = [
    { title: "New chat", url: appNavigation.newChat.path, group: "Actions", icon: MessageCircle },
    // Daily loop
    { title: "Home", url: appNavigation.home.path, group: "Daily loop", icon: Home },
    { title: "Chats", url: appNavigation.chats.path, group: "Daily loop", icon: MessageCircle },
    { title: "Companion", url: appNavigation.companion.path, group: "Daily loop", icon: Bot },
    { title: "Companion settings", url: appNavigation.companionSettings.path, group: "Control", icon: Settings },
    { title: "Inbox", url: appNavigation.inbox.path, group: "Daily loop", icon: Inbox },

    // Reference
    { title: "Projects", url: appNavigation.projects.path, group: "Reference", icon: Folder },
    { title: "Artifacts", url: appNavigation.artifacts.path, group: "Reference", icon: Files },
    { title: "Memory", url: appNavigation.memory.path, group: "Reference", icon: BookOpen },
    { title: "Activity", url: appNavigation.activity.path, group: "Control", icon: History },
    { title: "Runs", url: pageSectionHref("activity", "", "runs"), group: "Activity", icon: History },
    { title: "Events / Journal", url: pageSectionHref("activity", "", "events"), group: "Activity", icon: History },

    // Control
    { title: "Agents", url: appNavigation.agents.path, group: "Control", icon: Bot },
    { title: "Tools", url: appNavigation.tools.path, group: "Control", icon: Wrench },
    { title: "Jobs", url: appNavigation.jobs.path, group: "Control", icon: Briefcase },
    { title: "System", url: appNavigation.system.path, group: "Control", icon: Server },
    { title: "Terminal", url: pageSectionHref("system", "", "terminal"), group: "System", icon: Terminal },
    { title: "Files", url: pageSectionHref("system", "", "files"), group: "System", icon: FolderTree },
    { title: "Settings", url: appNavigation.settings.path, group: "Control", icon: Settings },
  ]

  // Base UI filters `{ value, label }` items by their label.
  const groups = Object.entries(searchItems.reduce((acc, item) => {
    (acc[item.group] ??= []).push({ value: item.url, label: item.title, icon: item.icon })
    return acc
  }, {} as Record<string, { value: string; label: string; icon?: LucideIcon }[]>)).map(([value, items]) => ({ value, items }))

  const handleSelect = (url: string) => {
    navigate(url)
    onOpenChange(false)
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandDialogPopup aria-label="Command search">
        <Command items={groups}>
          <CommandInput placeholder="What do you need?" />
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandList>
            {(group: (typeof groups)[number]) => (
              <CommandGroup key={group.value} items={group.items}>
                <CommandGroupLabel>{group.value}</CommandGroupLabel>
                <CommandCollection>
                  {(item: (typeof group.items)[number]) => {
                    const Icon = item.icon
                    return (
                      <CommandItem key={item.value} value={item} onClick={() => handleSelect(item.value)}>
                        {Icon && <Icon className="size-4" />}
                        {item.label}
                      </CommandItem>
                    )
                  }}
                </CommandCollection>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  )
}

export function SearchTrigger({ onClick, compact = false }: { onClick: () => void; compact?: boolean }) {
  return <button type="button" onClick={onClick} aria-label="Search pages" title="Search pages (Ctrl or Command + K)"
    className={cn("inline-flex size-(--control-height) shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-44 sm:justify-start sm:border sm:border-input sm:px-3", compact && "size-8 sm:w-8 sm:justify-center sm:px-0 lg:w-44 lg:justify-start lg:px-2")}>
    <Search className="size-4 shrink-0" aria-hidden="true" />
    <span className={compact ? "hidden lg:inline" : "hidden sm:inline"}>Search pages</span>
    <kbd className={cn("ml-auto hidden shrink-0 items-center gap-0.5 rounded border bg-muted px-1 font-mono text-[10px]", compact ? "lg:inline-flex" : "sm:inline-flex")} aria-hidden="true">⌘ K</kbd>
  </button>
}
