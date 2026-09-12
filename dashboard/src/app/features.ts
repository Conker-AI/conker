import { Home as HomeIcon, MessageCircle, Inbox, BookOpen, History, Bot, Wrench, CalendarClock, Server, TerminalSquare } from "lucide-react";
import type { Feature } from "../platform/contributions";
import { Messenger, Home } from "../features/messenger/page";
import { messengerCommands } from "../features/messenger/commands";
import { CharacterStudio } from "../features/character-studio/page";
import { TerminalWorkspace } from "../features/terminal/page";
import { InboxPage } from "../pages/inbox";
import { AgentsPage } from "../pages/agents";
import { ToolsPage } from "../pages/tools";
import { MemoryPage } from "../pages/memory";
import { JournalPage } from "../pages/journal";
import { JobsPage } from "../pages/jobs";
import { SystemPage } from "../pages/system";
import { SetupPage } from "../pages/setup";

const screens: Feature = { id: "core.screens", shipped: true, routes: [
  { id: "home", path: "/", Component: Home }, { id: "chats", path: "/chat", Component: Messenger }, { id: "session", path: "/chat/:sessionId", Component: Messenger },
  { id: "inbox", path: "/inbox/:id?", Component: InboxPage }, { id: "agents", path: "/agents/:id?", Component: AgentsPage }, { id: "tools", path: "/tools/:id?", Component: ToolsPage }, { id: "memory", path: "/memory/:id?", Component: MemoryPage }, { id: "journal", path: "/journal", Component: JournalPage }, { id: "jobs", path: "/jobs/:id?", Component: JobsPage }, { id: "system", path: "/system", Component: SystemPage }, { id: "studio", path: "/companion", Component: CharacterStudio }, { id: "terminal", path: "/terminal", Component: TerminalWorkspace }, { id: "setup", path: "/setup", Component: SetupPage, outsideShell: true },
], navigation: [
  { id: "nav.home", routeId: "home", label: "Home", to: "/", icon: HomeIcon, group: "Daily loop" }, { id: "nav.chats", routeId: "chats", label: "Chats", to: "/chat", icon: MessageCircle, group: "Daily loop" }, { id: "nav.inbox", routeId: "inbox", label: "Inbox", to: "/inbox", icon: Inbox, group: "Daily loop" },
  { id: "nav.memory", routeId: "memory", label: "Memory", to: "/memory", icon: BookOpen, group: "Reference" }, { id: "nav.journal", routeId: "journal", label: "Journal", to: "/journal", icon: History, group: "Reference" },
  { id: "nav.agents", routeId: "agents", label: "Agents", to: "/agents", icon: Bot, group: "Control" }, { id: "nav.tools", routeId: "tools", label: "Tools", to: "/tools", icon: Wrench, group: "Control" }, { id: "nav.jobs", routeId: "jobs", label: "Jobs", to: "/jobs", icon: CalendarClock, group: "Control" }, { id: "nav.system", routeId: "system", label: "System", to: "/system", icon: Server, group: "Control" }, { id: "nav.terminal", routeId: "terminal", label: "Terminal", to: "/terminal", icon: TerminalSquare, group: "Control" },
] };
export const features: Feature[] = [screens, messengerCommands];
