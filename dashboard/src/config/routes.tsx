import { lazy } from "react"
const HomePage = lazy(() => import("@/app/home/page"))
const ChatsPage = lazy(() => import("@/app/chat/page"))
const ChatDetailPage = lazy(() => import("@/app/chat/detail-page"))
const InboxPage = lazy(() => import("@/app/inbox/page"))
const ApprovalDetailPage = lazy(() => import("@/app/inbox/detail-page"))
const MemoryPage = lazy(() => import("@/app/memory/page"))
const JournalPage = lazy(() => import("@/app/journal/page"))
const AgentsPage = lazy(() => import("@/app/agents/page"))
const ToolsPage = lazy(() => import("@/app/tools/page"))
const JobsPage = lazy(() => import("@/app/jobs/page"))
const SystemPage = lazy(() => import("@/app/system/page"))
const TerminalPage = lazy(() => import("@/app/terminal/page"))
const CharacterStudioPage = lazy(() => import("@/app/companion/page"))
const NotFound = lazy(() => import("@/app/errors/not-found/page"))

export interface RouteConfig {
  path: string
  element: React.ReactNode
  children?: RouteConfig[]
}
export const routes: RouteConfig[] = [
  { path: "/", element: <HomePage /> },
  { path: "/chat", element: <ChatsPage /> },
  { path: "/chat/:id", element: <ChatDetailPage /> },
  { path: "/inbox", element: <InboxPage /> },
  { path: "/inbox/:id", element: <ApprovalDetailPage /> },
  { path: "/memory", element: <MemoryPage /> },
  { path: "/journal", element: <JournalPage /> },
  { path: "/agents", element: <AgentsPage /> },
  { path: "/tools", element: <ToolsPage /> },
  { path: "/jobs", element: <JobsPage /> },
  { path: "/system", element: <SystemPage /> },
  { path: "/terminal", element: <TerminalPage /> },
  { path: "/companion", element: <CharacterStudioPage /> },
  { path: "*", element: <NotFound /> },
]
