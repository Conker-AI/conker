import { appNavigation, pageSectionHref } from "@/config/navigation"
import { lazy } from "react"
import { Navigate } from "react-router-dom"
const SetupPage = lazy(() => import("@/app/setup/page"))
const LoginPage = lazy(() => import("@/app/login/page"))
const SettingsPage = lazy(() => import("@/app/settings/page"))
const HomePage = lazy(() => import("@/app/home/page"))
const ChatsPage = lazy(() => import("@/app/chat/page"))
const NewChatPage = lazy(() => import("@/app/chat/new-page"))
const ChatDetailPage = lazy(() => import("@/app/chat/detail-page"))
const InboxPage = lazy(() => import("@/app/inbox/page"))
const ApprovalDetailPage = lazy(() => import("@/app/inbox/detail-page"))
const MemoryPage = lazy(() => import("@/app/memory/page"))
const JournalPage = lazy(() => import("@/app/journal/page"))
const AgentsPage = lazy(() => import("@/app/agents/page"))
const EditAgentPage = lazy(() => import("@/app/agents/edit-page"))
const ToolsPage = lazy(() => import("@/app/tools/page"))
const JobsPage = lazy(() => import("@/app/jobs/page"))
const SystemPage = lazy(() => import("@/app/system/page"))
const CompanionPage = lazy(() => import("@/app/companion/page"))
const CharacterStudioPage = lazy(() => import("@/app/settings/companion/page"))
const NotFound = lazy(() => import("@/app/errors/not-found/page"))

export interface RouteConfig {
  path: string
  element: React.ReactNode
  children?: RouteConfig[]
}
export const routes: RouteConfig[] = [
  { path: appNavigation.setup.path, element: <SetupPage /> },
  { path: appNavigation.login.path, element: <LoginPage /> },
  { path: appNavigation.settings.path, element: <SettingsPage /> },
  { path: appNavigation.home.path, element: <HomePage /> },
  { path: appNavigation.chats.path, element: <ChatsPage /> },
  { path: appNavigation.newChat.path, element: <NewChatPage /> },
  { path: appNavigation.conversation.path, element: <ChatDetailPage /> },
  { path: appNavigation.inbox.path, element: <InboxPage /> },
  { path: appNavigation.request.path, element: <ApprovalDetailPage /> },
  { path: appNavigation.memory.path, element: <MemoryPage /> },
  { path: appNavigation.journal.path, element: <JournalPage /> },
  { path: appNavigation.agents.path, element: <AgentsPage /> },
  { path: "/agents/:id/edit", element: <EditAgentPage /> },
  { path: appNavigation.tools.path, element: <ToolsPage /> },
  { path: appNavigation.jobs.path, element: <JobsPage /> },
  { path: appNavigation.system.path, element: <SystemPage /> },
  { path: "/terminal", element: <Navigate to={pageSectionHref("system", "", "terminal")} replace /> },
  { path: "/files", element: <Navigate to={pageSectionHref("system", "", "files")} replace /> },
  { path: appNavigation.companion.path, element: <CompanionPage /> },
  { path: appNavigation.companionSettings.path, element: <CharacterStudioPage /> },
  { path: appNavigation.notFound.path, element: <NotFound /> },
]
