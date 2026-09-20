import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ReferenceSection } from "@/components/reference-section"
import { Label } from "@/components/ui/label"
import { SearchableSelect } from "@/app/activity/searchable-select"
import type { ProjectContextPreview } from "@/lib/api/project-types"
import { resolveProjectView } from "@/lib/api/project-preview"
import { kindLabel, linkKey, sourceHref, type ProjectScreenProps } from "./format"

const reasons: Record<ProjectContextPreview["excluded"][number]["reason"], string> = {
  "project-archived": "Project is archived", unavailable: "Source or privacy metadata is unavailable", "source-archived": "Source is archived", "origin-changed": "Origin changed; relink after review", "origin-private": "Origin privacy excludes cross-chat context", "target-private": "Destination privacy excludes cross-chat context",
}
export function ProjectContext({ client, snapshot, projectId, dirty }: ProjectScreenProps & { projectId: string; dirty: boolean }) {
  const [targetId, setTargetId] = useState("")
  const [result, setResult] = useState<{ targetId: string; snapshot: ProjectScreenProps["snapshot"]; plan?: ProjectContextPreview; error?: string } | null>(null)
  const target = snapshot.sessions.find(session => session.id === targetId && !session.archived && session.privacy)
  const record = snapshot.projects.find(project => project.id === projectId)
  const references = record ? resolveProjectView(snapshot, record).links : []
  useEffect(() => {
    let active = true
    if (target?.privacy) void client.previewContext(projectId, { ...target.privacy, incognito: target.incognito }).then(plan => { if (active) setResult({ targetId, snapshot, plan }) }, error => { if (active) setResult({ targetId, snapshot, error: error instanceof Error ? error.message : "Context preview is unavailable." }) })
    return () => { active = false }
  }, [client, projectId, snapshot, target, targetId])
  const current = result?.targetId === targetId && result.snapshot === snapshot ? result : null
  return <ReferenceSection title="Context preview">
    <p className="text-sm text-muted-foreground">Review saved project guidance and eligible source references for a destination chat. No content is retrieved and nothing is injected into the conversation.</p>
    <div className="space-y-2"><Label htmlFor="project-context-target">Destination chat</Label><SearchableSelect id="project-context-target" label="Destination chat" value={targetId} onChange={setTargetId} disabled={false} options={snapshot.sessions.filter(session => !session.archived && session.privacy).map(session => ({ value: session.id, label: session.title }))} /></div>
    {dirty && <p role="status" className="text-xs text-muted-foreground">Preview uses saved instructions. Save your changes to update it.</p>}
    {targetId && !target && <p role="status" className="text-sm">This destination is unavailable. Choose another chat.</p>}
    {target && !current && <p role="status" className="text-sm">Checking source privacy…</p>}
    {current?.error && <p role="alert" className="text-sm text-destructive">{current.error}</p>}
    {current?.plan && <div className="space-y-4">
      <div className="space-y-2"><h3 className="text-sm font-medium">Saved instructions</h3><p className="whitespace-pre-wrap break-words text-sm">{current.plan.instruction?.text || "No active project instructions."}</p><p className="text-xs text-muted-foreground">Project scope, after agent guidance and before session instructions. Separate from history; inheritance is not connected.</p></div>
      <div className="space-y-2"><h3 className="text-sm font-medium">Eligible references ({current.plan.references.length})</h3>{current.plan.references.length ? <ul className="space-y-2 text-sm">{current.plan.references.map(item => <li key={linkKey(item.reference)}><Link className="underline underline-offset-4" to={sourceHref(item.reference)}>{item.label}</Link><span className="ml-2 text-xs text-muted-foreground">{kindLabel(item.reference)}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">No source references are eligible for this destination.</p>}</div>
      {!!current.plan.excluded.length && <div className="space-y-2"><h3 className="text-sm font-medium">Excluded references ({current.plan.excluded.length})</h3><ul className="space-y-2 text-xs text-muted-foreground">{current.plan.excluded.map(item => <li key={linkKey(item.reference)}><span className="font-medium text-foreground">{references.find(reference => linkKey(reference.reference) === linkKey(item.reference))?.label ?? "Unavailable reference"}</span>: {reasons[item.reason]}</li>)}</ul></div>}
      <p className="text-xs text-muted-foreground">Reference eligibility is not provider authorization. No grants are inherited and no memory writes occur.</p>
    </div>}
  </ReferenceSection>
}
