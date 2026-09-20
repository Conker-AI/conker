import { usePageSection } from "@/hooks/use-page-navigation"
import type { ReactNode } from "react"
import { CompanionPortrait } from "@/components/companion-portrait"
import { useConker } from "@/lib/api/store"
import { cn } from "@/lib/utils"

export { PageHeader, OverviewSection, PageTabs, PageTabsList, PageTabsTrigger, PageTabsContent, CollectionSearch, CollectionRow, CollectionSection, RecordItem, CollectionEmpty, CollectionPanel } from "./primitives"
export { TaskDialogContent, OverlayBody, FormActions, DetailPanel, WorkspaceInspector, ConfirmationDialog } from "./overlays"

/** URL-addressed page content. Navigation is rendered once in SiteHeader. */
export function RouteSection({ value, children, variant = "page" }: { value: string; children: ReactNode; variant?: "page" | "workspace" }) {
  const active = usePageSection()
  return active === value ? <div data-slot="route-section" className={cn("min-w-0", variant === "workspace" && "flex min-h-0 flex-1 flex-col")}>{children}</div> : null
}

export function AgentIdentityPortrait({ name }: { name: string }) {
  const profile = useConker(data => data.profile)
  const agent = useConker(data => data.agents.find(item => item.name === name))
  return <CompanionPortrait profile={agent?.kind === "companion" ? profile : undefined} name={name} face="round" tone="graphite" className="size-(--collection-portrait-size) rounded-lg" />
}
