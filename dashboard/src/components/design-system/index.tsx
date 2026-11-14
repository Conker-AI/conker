import { usePageSection } from "@/hooks/use-page-navigation"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export { PageHeader, WorkspaceAction, WorkspaceSection, OverviewSection, CollectionSearch, WorkspaceSearch, CollectionToolbar, CollectionLoading, CollectionRow, CollectionSection, RecordItem, CollectionEmpty, CollectionPanel } from "./primitives"
export { TaskDialogContent, OverlayBody, FormActions, InlineDetails, WorkspaceInspector, ConfirmationDialog } from "./overlays"
export { FilterChip, ListCard, ListLine, ListLineMenu, type ListSort } from "./list-card"
export { WorkspaceChoice } from "./workspace-choice"

/** URL-addressed page content. Navigation is rendered once in SiteHeader. */
export function RouteSection({ value, children, variant = "page" }: { value: string; children: ReactNode; variant?: "page" | "workspace" }) {
  const active = usePageSection()
  return active === value ? <div data-slot="route-section" className={cn("min-w-0", variant === "workspace" && "flex min-h-0 flex-1 flex-col")}>{children}</div> : null
}
