import { matchPath } from "react-router-dom"
import type { Snapshot } from "@/lib/api/client"

type RouteDefinition = { path: string; title: string; parent?: string }

/** Sidebar destinations are independent roots. Home is the landing page at /. */
export const appNavigation = {
  home: { path: "/", title: "Home" },
  companion: { path: "/companion", title: "Companion" },
  chats: { path: "/chat", title: "Chats" },
  newChat: { path: "/chat/new", title: "New chat", parent: "chats" },
  conversation: { path: "/chat/:id", title: "Conversation", parent: "chats" },
  inbox: { path: "/inbox", title: "Inbox" },
  request: { path: "/inbox/:id", title: "Request", parent: "inbox" },
  memory: { path: "/memory", title: "Memory" },
  projects: { path: "/projects", title: "Projects" },
  project: { path: "/projects/:id", title: "Project", parent: "projects" },
  journal: { path: "/journal", title: "Journal" },
  activity: { path: "/activity", title: "Activity" },
  agents: { path: "/agents", title: "Agents" },
  editAgent: { path: "/agents/:id/edit", title: "Edit agent", parent: "agents" },
  tools: { path: "/tools", title: "Tools" },
  jobs: { path: "/jobs", title: "Jobs" },
  system: { path: "/system", title: "System" },
  settings: { path: "/settings", title: "Settings" },
  companionSettings: { path: "/settings/companion", title: "Character Studio", parent: "settings" },
  setup: { path: "/setup", title: "Setup" },
  login: { path: "/login", title: "Login" },
  notFound: { path: "*", title: "Page not found" },
} as const satisfies Record<string, RouteDefinition>

export type AppRoute = keyof typeof appNavigation
export type PageSection = { value: string; label: string; count?: "pending" }

export const pageSections: Partial<Record<AppRoute, readonly PageSection[]>> = {
  agents: [{ value: "agents", label: "Agents" }, { value: "teams", label: "Teams" }, { value: "templates", label: "Templates" }],
  activity: [{ value: "tasks", label: "Tasks" }, { value: "runs", label: "Runs" }, { value: "events", label: "Events" }],
  chats: [{ value: "sessions", label: "Conversations" }, { value: "agents", label: "Agents" }, { value: "archived", label: "Archived" }],
  inbox: [{ value: "pending", label: "Needs you", count: "pending" }, { value: "history", label: "Decision history" }],
  system: [{ value: "overview", label: "Overview" }, { value: "terminal", label: "Terminal" }, { value: "files", label: "Files" }],
  companionSettings: [{ value: "identity", label: "Identity & soul" }, { value: "speaking", label: "Speaking style" }, { value: "appearance", label: "Appearance" }, { value: "voice", label: "Voice" }, { value: "modes", label: "Expression & modes" }],
  settings: [
    { value: "appearance", label: "Appearance" },
    { value: "layout", label: "Layout" },
    { value: "models", label: "Models / Providers" },
    { value: "connections", label: "Connections" },
    { value: "account", label: "Account" },
  ],
}

export function matchAppRoute(pathname: string): { key: AppRoute; params: Readonly<Record<string, string | undefined>> } {
  for (const [key, definition] of Object.entries(appNavigation)) {
    const match = matchPath(definition.path, pathname)
    if (match) return { key: key as AppRoute, params: match.params }
  }
  return { key: "notFound" as const, params: {} }
}

export function activePageSection(key: AppRoute, search: string) {
  const sections = pageSections[key] || []
  const requested = new URLSearchParams(search).get("tab")
  return sections.find(section => section.value === requested)?.value || sections[0]?.value
}

/** Keep unrelated filters when switching views; the default has a clean URL. */
export function pageSectionHref(key: AppRoute, search: string, value: string) {
  const sections = pageSections[key] || []
  const valid = sections.some(section => section.value === value) ? value : sections[0]?.value
  const params = new URLSearchParams(search)
  if (!valid || valid === sections[0]?.value) params.delete("tab")
  else params.set("tab", valid)
  const query = params.toString()
  return `${appNavigation[key].path}${query ? `?${query}` : ""}`
}

export type AppbarAction = { to: string; label: string; icon: "message" | "settings" | "new-chat" }
export type RouteCrumb = { title: string; to: string }

export function getPageNavigation(pathname: string, search: string, data: Snapshot) {
  const { key, params } = matchAppRoute(pathname)
  const definition: RouteDefinition = appNavigation[key]
  const session = key === "conversation" ? data.sessions.find(item => item.id === params.id) : undefined
  const ticket = key === "request" ? data.tickets.find(item => item.id === params.id) : undefined
  const project = key === "project" ? data.projects.find(item => item.id === params.id) : undefined
  const name = data.profile.name || "Conker"
  const title = key === "conversation" ? session?.title || "Conversation not found"
    : key === "request" ? ticket?.request || "Request not found"
    : key === "project" ? project?.name || "Project not found" : definition.title
  const crumbs: RouteCrumb[] = [{ title, to: pathname }]
  let parent = definition.parent as AppRoute | undefined
  while (parent) {
    const ancestor: RouteDefinition = appNavigation[parent]
    const to = parent === "inbox" && ticket && ticket.status !== "Needs you"
      ? pageSectionHref("inbox", "", "history") : ancestor.path
    crumbs.unshift({ title: ancestor.title, to })
    parent = ancestor.parent as AppRoute | undefined
  }
  const actions: AppbarAction[] = []
  if (key === "chats" || key === "agents") actions.push({ to: appNavigation.newChat.path, label: "New chat", icon: "new-chat" })
  if (key === "home" || key === "companionSettings") {
    actions.push({ to: appNavigation.companion.path, label: `Talk to ${name}`, icon: "message" })
  }
  if (key === "settings") {
    actions.push({ to: appNavigation.companionSettings.path, label: "Companion settings", icon: "settings" })
  }
  return {
    key, title, crumbs, actions,
    activeSection: activePageSection(key, search),
    sections: (pageSections[key] || []).map(section => ({
      ...section,
      to: pageSectionHref(key, search, section.value),
      badge: section.count === "pending" ? data.tickets.filter(item => item.status === "Needs you").length : undefined,
    })),
  }
}
