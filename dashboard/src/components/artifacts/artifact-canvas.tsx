import { useEffect, useMemo, useState, type ReactNode, type Ref } from "react"
import { Link } from "react-router-dom"
import { Download, Info, MoreHorizontal, X } from "lucide-react"
import { DetailPanel, FormActions, OverlayBody, RecordItem } from "@/components/design-system"
import { ReferenceSection } from "@/components/reference-section"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useConkerStore } from "@/lib/api/store"
import { downloadAnswerFile } from "@/lib/rich-answer"
import { cn } from "@/lib/utils"
import type { ArtifactClient, ArtifactVersion, ArtifactView } from "@/lib/api/artifact-types"
import { artifactSource, parseArtifactSource } from "./content"
import { ArtifactPreview } from "./native-preview"

type ArtifactCanvasProps = {
  artifact: ArtifactView; client: ArtifactClient; initialVersion?: number
  onVersionChange?: (version: number | undefined) => void
  /** Embed pane-specific full-page/close controls in the canvas's single title row. */
  headerActions?: ReactNode
  headingRef?: Ref<HTMLHeadingElement>
  onClose?: () => void; readOnly?: boolean; className?: string
}
type Draft = { title: string; source: string; language: string; note: string; revision: number; base: string }
const retainedDrafts = new Map<string, Draft>()
const readable = (artifact: ArtifactView) => artifact.availability === "available" || artifact.availability === "source-archived"
function versionDraft(version: ArtifactVersion, revision: number): Draft {
  const value = { title: version.title, source: artifactSource(version.content), language: version.content.kind === "code" ? version.content.language : "", note: "" }
  return { ...value, revision, base: JSON.stringify(value) }
}
function isDirty(draft: Draft) { return JSON.stringify({ title: draft.title, source: draft.source, language: draft.language, note: draft.note }) !== draft.base }
function takeError() { const error = useConkerStore.getState().error; useConkerStore.setState({ error: "" }); return error }

function ArtifactDetails({ artifact, open, onClose }: { artifact: ArtifactView; open: boolean; onClose: () => void }) {
  const sourceHref = artifact.source ? `/chat/${encodeURIComponent(artifact.source.sessionId)}#${encodeURIComponent(artifact.source.messageId)}` : null
  return <DetailPanel open={open} onOpenChange={value => { if (!value) onClose() }} title="Artifact details" description="Origin, version history and source privacy">
    <OverlayBody><ReferenceSection title="Origin"><p className="text-sm">{artifact.origin === "owner-authored" ? "Created by the owner." : "Explicit copy of a completed assistant response. Editing this artifact never rewrites that response."}</p>{sourceHref && <Button asChild variant="outline"><Link to={sourceHref}>Open original response</Link></Button>}</ReferenceSection>
      <ReferenceSection title="Task">{artifact.task && (artifact.taskAvailability === "available" || artifact.taskAvailability === "archived") ? <Button asChild variant="outline"><Link to={`/activity?tab=tasks&task=${encodeURIComponent(artifact.task.taskId)}`}>Open linked task{artifact.taskAvailability === "archived" ? " (archived)" : ""}</Link></Button> : <p className="text-sm text-muted-foreground">{artifact.taskAvailability === "none" ? "No linked task." : "The original task is unavailable or moved to a different conversation."}</p>}</ReferenceSection>
      <ReferenceSection title="Privacy"><p className="text-sm">{artifact.privateOrigin === null ? "Source privacy is unavailable. All content and exports are blocked." : artifact.privateOrigin ? "Private origin. Owner inspection and explicit export are available; no content is sent to helpers or shared." : "No source privacy restriction reported. Export is an explicit owner action."}</p><p className="text-xs text-muted-foreground">Artifacts do not inherit grants or write memory.</p></ReferenceSection>
      <ReferenceSection title="Record"><p className="text-sm">{artifact.versionCount} immutable versions. Revision {artifact.revision}.</p><p className="text-xs text-muted-foreground">Local preview; changes reset on reload. Code and HTML remain inert source text.</p></ReferenceSection>
    </OverlayBody>
  </DetailPanel>
}

function ReadableCanvas({ artifact, client, initialVersion, onVersionChange, headerActions, headingRef, onClose, readOnly = false, className }: ArtifactCanvasProps) {
  const [mode, setMode] = useState("preview")
  const [versionNumber, setVersionNumber] = useState<number | null>(() => artifact.versions.some(version => version.version === initialVersion) ? initialVersion! : null)
  const [draftState, setDraftState] = useState<Draft | null>(() => retainedDrafts.get(artifact.id) ?? null)
  const [details, setDetails] = useState(false)
  const [error, setError] = useState("")
  const [feedback, setFeedback] = useState(() => initialVersion !== undefined && !artifact.versions.some(version => version.version === initialVersion) ? "Requested version is unavailable. Showing the current version." : "")
  const [exporting, setExporting] = useState(false)
  const { pending, mutate } = useConkerStore()
  const latest = artifact.versions.at(-1)!
  const selected = artifact.versions.find(version => version.version === versionNumber) ?? latest
  const historical = selected.version !== latest.version
  const draft = draftState ?? versionDraft(latest, artifact.revision)
  const dirty = isDirty(draft)
  const stale = dirty && draft.revision !== artifact.revision
  const editable = !readOnly && !artifact.archivedAt && artifact.availability === "available" && !historical
  const busy = pending || exporting
  const parsed = useMemo(() => {
    if (historical || !dirty) return { content: selected.content, error: "" }
    try { return { content: parseArtifactSource(latest.content.kind, draft.source, draft.language), error: "" } }
    catch (error) { return { content: null, error: error instanceof Error ? error.message : "Invalid source." } }
  }, [historical, dirty, selected.content, latest.content.kind, draft.source, draft.language])
  useEffect(() => { if (dirty) retainedDrafts.set(artifact.id, draft); else retainedDrafts.delete(artifact.id) }, [artifact.id, draft, dirty])
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn) }, [dirty])
  const change = async (action: () => Promise<ArtifactView>, notice: string) => {
    setError(""); setFeedback("")
    const saved = await mutate(action, notice)
    if (saved) { retainedDrafts.delete(artifact.id); setDraftState(null); setVersionNumber(null); setFeedback(notice); onVersionChange?.(undefined) }
    else setError(takeError() || "Could not save this artifact.")
    return saved
  }
  const exportVersion = async () => {
    if (busy) return
    setExporting(true); setError(""); setFeedback("")
    try { const result = await client.export(artifact.id, selected.version); downloadAnswerFile(result.text, result.filename, result.mime); setFeedback(`Exported saved version ${result.version}${dirty ? "; unsaved changes are not included" : ""}.`) }
    catch (error) { setError(error instanceof Error ? error.message : "Export is unavailable.") }
    finally { setExporting(false) }
  }
  const patch = (value: Partial<Draft>) => setDraftState({ ...draft, ...value })
  const chooseVersion = (version: number | null) => { setVersionNumber(version); onVersionChange?.(version ?? undefined) }
  const sourceValue = historical ? artifactSource(selected.content) : draft.source
  return <section aria-label="Artifact canvas" className={cn("flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden", className)}>
    <header className="flex shrink-0 flex-wrap items-center gap-3 border-b p-4"><div className="min-w-0 flex-1 basis-full sm:min-w-40 sm:basis-auto"><h2 ref={headingRef} tabIndex={-1} className="break-words text-base font-semibold outline-none">{selected.title}</h2><p className="text-xs text-muted-foreground">Version {selected.version}{historical ? " · historical" : ""}{artifact.archivedAt ? " · archived" : ""} · {selected.content.kind}</p></div><Badge variant="outline">Preview</Badge><Button size="sm" variant="outline" disabled={busy} onClick={() => void exportVersion()}><Download />Export</Button><Button size="icon" variant="ghost" aria-label="Artifact details" onClick={() => setDetails(true)}><Info /></Button>{!readOnly && <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label="Artifact actions" disabled={busy || dirty}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => { void change(() => client.archive(artifact.id, !artifact.archivedAt, artifact.revision), artifact.archivedAt ? "Artifact restored." : "Artifact archived; versions retained.") }}>{artifact.archivedAt ? "Restore artifact" : "Archive artifact"}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}{headerActions}{onClose && <Button size="icon" variant="ghost" aria-label="Close artifact" onClick={onClose}><X /></Button>}</header>
    <Tabs value={mode} onValueChange={setMode} className="flex min-h-0 flex-1 flex-col gap-0">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-3"><TabsList aria-label="Artifact view"><TabsTrigger value="preview">Preview</TabsTrigger><TabsTrigger value="source">Source</TabsTrigger><TabsTrigger value="history">History</TabsTrigger></TabsList>{dirty && <span className="text-xs text-muted-foreground">Unsaved draft</span>}{historical && <Button size="sm" variant="outline" onClick={() => chooseVersion(null)}>Return to current version</Button>}</div>
      <TabsContent value="preview" className="min-h-0 flex-1 overflow-auto p-4 sm:p-6" tabIndex={0} aria-label="Artifact preview content">{parsed.error ? <p role="alert" className="text-sm text-destructive">{parsed.error} Open Source to correct the draft.</p> : parsed.content && <ArtifactPreview content={parsed.content} citations={selected.citations} />}</TabsContent>
      <TabsContent value="source" className="min-h-0 flex-1 space-y-4 overflow-auto p-4 sm:p-6">
        <p className="text-xs text-muted-foreground">{historical ? "Read-only historical source. Restore it from History to append a new current version." : editable ? "Edit source, then preview or save a new version. Earlier versions are immutable." : "Read-only source. Restore the artifact and its source conversation before editing."}</p>
        <div className="space-y-2"><Label htmlFor={`artifact-title-${artifact.id}`}>Title</Label><Input id={`artifact-title-${artifact.id}`} value={historical ? selected.title : draft.title} maxLength={160} disabled={!editable || busy} onChange={event => patch({ title: event.target.value })} /></div>
        {selected.content.kind === "code" && <div className="space-y-2"><Label htmlFor={`artifact-language-${artifact.id}`}>Language</Label><Input id={`artifact-language-${artifact.id}`} value={historical ? selected.content.language : draft.language} maxLength={40} disabled={!editable || busy} onChange={event => patch({ language: event.target.value })} /></div>}
        <div className="space-y-2"><Label htmlFor={`artifact-source-${artifact.id}`}>{selected.content.kind === "table" || selected.content.kind === "chart" ? "Structured data (JSON)" : "Source text"}</Label><Textarea id={`artifact-source-${artifact.id}`} value={sourceValue} onChange={event => patch({ source: event.target.value })} readOnly={!editable} disabled={busy} rows={16} maxLength={250000} spellCheck={selected.content.kind === "markdown"} className={selected.content.kind === "markdown" ? "" : "font-mono text-xs"} /></div>
        {(selected.content.kind === "table" || selected.content.kind === "chart") && <p className="text-xs text-muted-foreground">{selected.content.kind === "table" ? "Columns are labels; rows contain one text cell per column. Limit: 32 columns and 1,000 rows." : "Choose bar, line or area. Each row has a label and one finite numeric value per series. Limit: 8 series and 500 rows. No expressions or styling code."}</p>}
        {!historical && <div className="space-y-2"><Label htmlFor={`artifact-note-${artifact.id}`}>Version note</Label><Input id={`artifact-note-${artifact.id}`} maxLength={1000} value={draft.note} onChange={event => patch({ note: event.target.value })} disabled={!editable || busy} placeholder="What changed?" /></div>}
        {parsed.error && <p role="alert" className="text-sm text-destructive">{parsed.error}</p>}
      </TabsContent>
      <TabsContent value="history" className="min-h-0 flex-1 space-y-4 overflow-auto p-4 sm:p-6"><p className="text-sm text-muted-foreground">Restoring appends a copy as a new version. Existing versions remain unchanged.{dirty ? " Save or reset your draft before selecting history." : ""}</p><div className="divide-y rounded-xl border bg-card text-card-foreground">{artifact.versions.slice().reverse().map(version => <RecordItem key={version.version} title={`Version ${version.version}: ${version.title}`} description={version.note} meta={<><span>{new Date(version.createdAt).toLocaleString()}</span><span>{version.author === "owner" ? "Owner" : "Copied response"}</span>{version.restoredFromVersion && <span>Restored from version {version.restoredFromVersion}</span>}</>} actions={<><Button size="sm" variant="outline" disabled={busy || dirty} onClick={() => { chooseVersion(version.version); setMode("preview") }}>View version {version.version}</Button>{version.version !== latest.version && <Button size="sm" variant="outline" disabled={busy || dirty || readOnly || !!artifact.archivedAt || artifact.availability !== "available"} onClick={() => { void change(() => client.restore(artifact.id, version.version, artifact.revision), `Version ${version.version} restored as a new version.`) }}>Restore as new version</Button>}</>} />)}</div></TabsContent>
    </Tabs>
    <FormActions inset description={<span role={error ? "alert" : "status"} className={error ? "text-destructive" : undefined}>{error || feedback || (stale ? "The saved artifact changed. Reset to its current version before saving." : dirty ? "Draft kept when closing or navigating away" : artifact.privateOrigin ? "Private origin · local owner preview" : "Changes reset on reload")}</span>}>
      {dirty && <Button variant="outline" disabled={busy} onClick={() => { retainedDrafts.delete(artifact.id); setDraftState(null); setError(""); setFeedback("") }}>Reset changes</Button>}
      {!readOnly && <Button disabled={busy || !editable || !dirty || stale || !!parsed.error || !draft.title.trim()} onClick={() => { if (parsed.content) void change(() => client.appendVersion(artifact.id, { title: draft.title, content: parsed.content!, ...(draft.note.trim() ? { note: draft.note } : {}) }, draft.revision), "Saved a new artifact version.") }}>{pending ? "Saving…" : "Save new version"}</Button>}
    </FormActions>
    <ArtifactDetails artifact={artifact} open={details} onClose={() => setDetails(false)} />
  </section>
}

/** Shared by library and conversation/call panes. Never renders raw ArtifactRecord bodies. */
export function ArtifactCanvas({ artifact, headingRef, ...props }: ArtifactCanvasProps) {
  const available = readable(artifact) && artifact.versions.length > 0
  useEffect(() => { if (!available) retainedDrafts.delete(artifact.id) }, [available, artifact.id])
  if (available) return <ReadableCanvas key={`${artifact.id}:${props.initialVersion ?? "current"}`} artifact={artifact} headingRef={headingRef} {...props} />
  return <UnavailableCanvas artifact={artifact} headingRef={headingRef} {...props} />
}

function UnavailableCanvas({ artifact, client, headingRef, headerActions, onClose, readOnly, className }: ArtifactCanvasProps) {
  const [error, setError] = useState("")
  const { pending, mutate } = useConkerStore()
  return <section aria-label="Artifact canvas" className={cn("flex min-h-0 min-w-0 flex-1 flex-col overflow-auto p-5", className)}>
    <div className="flex flex-wrap items-start gap-3"><h2 ref={headingRef} tabIndex={-1} className="min-w-0 flex-1 break-words text-base font-semibold outline-none">{artifact.title}</h2>{headerActions}{onClose && <Button variant="ghost" size="icon" aria-label="Close artifact" onClick={onClose}><X /></Button>}</div>
    <p role="status" className="mt-4 text-sm">Artifact content is unavailable because its source changed, was redacted or removed, or its privacy could not be verified. Preview, drafts, history bodies and export are blocked.</p>
    <div className="mt-4 flex flex-wrap gap-2">{artifact.source && <Button asChild variant="outline"><Link to={`/chat/${encodeURIComponent(artifact.source.sessionId)}`}>Open source chat</Link></Button>}{!readOnly && <Button variant="outline" disabled={pending} onClick={async () => { const saved = await mutate(() => client.archive(artifact.id, !artifact.archivedAt, artifact.revision)); setError(saved ? "" : takeError()) }}>{pending ? "Saving…" : artifact.archivedAt ? "Restore artifact" : "Archive artifact"}</Button>}</div>
    <p className="mt-3 text-xs text-muted-foreground">{artifact.archivedAt ? "Artifact archived." : "Artifact active."} Archiving or restoring changes metadata only and cannot restore source access.</p>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
  </section>
}
