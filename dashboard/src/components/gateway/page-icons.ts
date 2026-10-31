import { Bot, BookOpen, Clock3, Folder, House, Inbox, MessagesSquare, Server, Settings2, Wrench, type LucideIcon } from 'lucide-react'
import type { GatewayDestination } from './navigation'

/** One icon per place, shared by the sidebar and the page header so both point at the same thing. */
export const placeIcons: Partial<Record<GatewayDestination['id'], LucideIcon>> = {
  today: House, inbox: Inbox, chats: MessagesSquare, projects: Folder, memory: BookOpen, agents: Bot, tools: Wrench,
  jobs: Clock3, system: Server, settings: Settings2,
}
