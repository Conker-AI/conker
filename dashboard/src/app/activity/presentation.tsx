import { Link } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/status-badge"
import { formatActivityRecord } from "@/lib/conversation-activity"
import { safeActivityHref } from "@/lib/api/activity-projection"
import type { ActivityOutput, ActivityProvenance, TaskStatus } from "@/lib/api/task-types"
import { taskLabels } from "./format"

export function TaskStatusBadge({ status }: { status: TaskStatus }) { return <StatusBadge tone={status === "blocked" ? "warning" : "neutral"}>{taskLabels[status]}</StatusBadge> }
export function Provenance({ value }: { value: ActivityProvenance }) { return <Badge variant="outline" className="font-normal">{value === "sample" ? "Sample" : value === "preview" ? "Preview" : value === "recorded" ? "Recorded" : "Live"}</Badge> }
export function SourceLink({ href, children = "Open source" }: { href?: string; children?: React.ReactNode }) {
  const safe = safeActivityHref(href)
  if (!safe) return null
  return <Button asChild size="sm" variant="outline">{safe.startsWith("/") ? <Link to={safe}>{children}</Link> : <a href={safe} target="_blank" rel="noopener noreferrer">{children}</a>}</Button>
}
export function Output({ output }: { output: ActivityOutput }) {
  return <div className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium">{output.label}</span><SourceLink href={output.href}>Open {output.kind}</SourceLink></div>{output.value !== undefined && <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs leading-5 whitespace-pre-wrap break-words">{formatActivityRecord({ output: output.value })}</pre>}{output.kind !== "value" && !output.href && <p className="text-xs text-muted-foreground">This source has no available asset link.</p>}</div>
}
