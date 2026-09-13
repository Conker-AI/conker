"use client"

import { appNavigation } from "@/config/navigation"
import * as React from "react"
import { useNavigate } from "react-router-dom"
import { Command as CommandPrimitive } from "cmdk"
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
  type LucideIcon,
} from "lucide-react"

import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      "flex h-full w-full flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground",
      className
    )}
    {...props}
  />
))
Command.displayName = CommandPrimitive.displayName

const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Input
    ref={ref}
    className={cn(
      "flex h-12 w-full border-none bg-transparent px-4 py-3 text-[17px] outline-none placeholder:text-muted-foreground border-b border-border mb-4",
      className
    )}
    {...props}
  />
))
CommandInput.displayName = CommandPrimitive.Input.displayName

const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn("max-h-[400px] overflow-y-auto overflow-x-hidden pb-2", className)}
    {...props}
  />
))
CommandList.displayName = CommandPrimitive.List.displayName

const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className="flex h-12 items-center justify-center text-sm text-muted-foreground"
    {...props}
  />
))
CommandEmpty.displayName = CommandPrimitive.Empty.displayName

const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn(
      "overflow-hidden px-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&:not(:first-child)]:mt-2",
      className
    )}
    {...props}
  />
))
CommandGroup.displayName = CommandPrimitive.Group.displayName

const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex h-12 cursor-pointer select-none items-center gap-2 rounded-lg px-4 text-sm text-popover-foreground outline-none transition-colors data-[disabled=true]:pointer-events-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50 [&+[cmdk-item]]:mt-1",
      className
    )}
    {...props}
  />
))
CommandItem.displayName = CommandPrimitive.Item.displayName

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
  const commandRef = React.useRef<HTMLDivElement>(null)

  const searchItems: SearchItem[] = [
    // Daily loop
    { title: "Home", url: appNavigation.home.path, group: "Daily loop", icon: Home },
    { title: "Chats", url: appNavigation.chats.path, group: "Daily loop", icon: MessageCircle },
    { title: "Companion", url: appNavigation.companion.path, group: "Daily loop", icon: Bot },
    { title: "Companion settings", url: appNavigation.companionSettings.path, group: "Control", icon: Settings },
    { title: "Inbox", url: appNavigation.inbox.path, group: "Daily loop", icon: Inbox },

    // Reference
    { title: "Memory", url: appNavigation.memory.path, group: "Reference", icon: BookOpen },
    { title: "Journal", url: appNavigation.journal.path, group: "Reference", icon: History },

    // Control
    { title: "Agents", url: appNavigation.agents.path, group: "Control", icon: Bot },
    { title: "Tools", url: appNavigation.tools.path, group: "Control", icon: Wrench },
    { title: "Jobs", url: appNavigation.jobs.path, group: "Control", icon: Briefcase },
    { title: "System", url: appNavigation.system.path, group: "Control", icon: Server },
    { title: "Terminal", url: appNavigation.terminal.path, group: "Control", icon: Terminal },
    { title: "Settings", url: appNavigation.settings.path, group: "Control", icon: Settings },
  ]

  const groupedItems = searchItems.reduce((acc, item) => {
    if (!acc[item.group]) {
      acc[item.group] = []
    }
    acc[item.group].push(item)
    return acc
  }, {} as Record<string, SearchItem[]>)

  const handleSelect = (url: string) => {
    navigate(url)
    onOpenChange(false)
    // Bounce effect like Vercel
    if (commandRef.current) {
      commandRef.current.style.transform = 'scale(0.96)'
      setTimeout(() => {
        if (commandRef.current) {
          commandRef.current.style.transform = ''
        }
      }, 100)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 shadow-2xl border border-border max-w-[640px]">
        <DialogTitle className="sr-only">Command Search</DialogTitle>
        <DialogDescription className="sr-only">Navigate to a Conker screen.</DialogDescription>
        <Command
          ref={commandRef}
          className="transition-transform duration-100 ease-out"
        >
          <CommandInput placeholder="What do you need?" autoFocus />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            {Object.entries(groupedItems).map(([group, items]) => (
              <CommandGroup key={group} heading={group}>
                {items.map((item) => {
                  const Icon = item.icon
                  return (
                    <CommandItem
                      key={item.url}
                      value={item.title}
                      onSelect={() => handleSelect(item.url)}
                    >
                      {Icon && <Icon className="mr-2 h-4 w-4" />}
                      {item.title}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}

export function SearchTrigger({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-label="Search pages" title="Search pages (Ctrl or Command + K)"
    className="inline-flex size-(--control-height) shrink-0 items-center justify-center gap-2 rounded-lg text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-44 sm:justify-start sm:border sm:border-input sm:px-3">
    <Search className="size-4 shrink-0" aria-hidden="true" />
    <span className="hidden sm:inline">Search pages</span>
    <kbd className="ml-auto hidden items-center gap-0.5 rounded border bg-muted px-1 font-mono text-[10px] sm:inline-flex" aria-hidden="true">⌘ K</kbd>
  </button>
}
