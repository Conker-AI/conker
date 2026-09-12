import { lazy } from "react"

const PlaceholderPage = lazy(() => import("@/app/_conker/placeholder-page"))
const AgentsPage = lazy(() => import("@/app/agents/page"))
const InboxPage = lazy(() => import("@/app/inbox/page"))
const ApprovalDetailPage = lazy(() => import("@/app/inbox/detail-page"))

// Error pages (kept from the template shell)
const NotFound = lazy(() => import("@/app/errors/not-found/page"))

export interface RouteConfig {
  path: string
  element: React.ReactNode
  children?: RouteConfig[]
}

const screen = (title: string, description?: string) => (
  <PlaceholderPage title={title} description={description} />
)

export const routes: RouteConfig[] = [
  // Daily loop
  { path: "/", element: screen("Home", "Your companion.") },
  { path: "/chat", element: screen("Chats", "Find any conversation.") },
  { path: "/inbox", element: <InboxPage /> },
  { path: "/inbox/:id", element: <ApprovalDetailPage /> },

  // Reference
  { path: "/memory", element: screen("Memory", "What Conker thinks it knows.") },
  { path: "/journal", element: screen("Journal", "Everything Conker did, in order.") },

  // Control
  { path: "/agents", element: <AgentsPage /> },
  { path: "/tools", element: screen("Tools", "What each tool can do, and who is scoped to it.") },
  { path: "/jobs", element: screen("Jobs", "What runs on its own.") },
  { path: "/system", element: screen("System", "A clear picture of the machine.") },
  { path: "/terminal", element: screen("Terminal", "Your server, when you need to work directly.") },

  // Catch-all
  { path: "*", element: <NotFound /> },
]
