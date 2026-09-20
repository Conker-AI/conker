import { useEffect, useState } from "react"
import { Dialog } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConfirmationDialog, FormActions, OverlayBody, TaskDialogContent } from "@/components/design-system"
import { SearchableSelect } from "@/app/activity/searchable-select"
import { emptyArtifactContent } from "@/components/artifacts/content"
import { useConkerStore } from "@/lib/api/store"
import type { ArtifactContent } from "@/lib/api/artifact-types"
import { artifactKindLabels, type ArtifactScreenProps } from "./format"
import { takeMutationError } from "./feedback"

type CreationDraft = { title: string; kind: ArtifactContent["kind"]; taskId: string }
let retained: CreationDraft | null = null
export function CreateArtifact({ client, tasks, sessions, onClose, onCreated }: ArtifactScreenProps & { onClose: () => void; onCreated: () => void }) {
  const [value, setValue] = useState<CreationDraft>(() => retained ?? { title: "", kind: "markdown", taskId: "none" })
  const [error, setError] = useState("")
  const [discarding, setDiscarding] = useState(false)
  const { pending, mutate } = useConkerStore()
  const dirty = !!value.title || value.kind !== "markdown" || value.taskId !== "none"
  useEffect(() => { retained = dirty ? value : null }, [value, dirty])
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn) }, [dirty])
  const close = () => { if (pending) return; if (dirty) setDiscarding(true); else onClose() }
  const taskOptions = tasks.filter(task => !task.archivedAt && sessions.some(session => session.id === task.sessionId && !session.archived)).map(task => ({ value: task.id, label: task.outcome }))
  return <><Dialog open onOpenChange={open => { if (!open) close() }}><TaskDialogContent title="New artifact" description="Create an empty document, code file, table, chart, diagram or media reference. Open it to add content; versions stay local to this preview." showCloseButton={!pending} onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (pending) event.preventDefault() }}>
    <form className="flex min-h-0 flex-col" onSubmit={event => { event.preventDefault(); if (pending) return; void (async () => { const saved = await mutate(() => client.create({ title: value.title, content: emptyArtifactContent(value.kind), ...(value.taskId === "none" ? {} : { taskId: value.taskId }) }), "Artifact created. Open it and add content in Source."); if (saved) { retained = null; onCreated() } else setError(takeMutationError()) })() }}><OverlayBody><fieldset disabled={pending} className="space-y-4">
      <div className="space-y-2"><Label htmlFor="new-artifact-title">Title</Label><Input id="new-artifact-title" value={value.title} onChange={event => setValue({ ...value, title: event.target.value })} maxLength={160} required placeholder="e.g. Project brief" /></div>
      <div className="space-y-2"><Label htmlFor="new-artifact-kind">Format</Label><Select value={value.kind} onValueChange={kind => setValue({ ...value, kind: kind as ArtifactContent["kind"] })}><SelectTrigger id="new-artifact-kind"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(artifactKindLabels).map(([kind, label]) => <SelectItem key={kind} value={kind}>{label}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="new-artifact-task">Linked task (optional)</Label><SearchableSelect id="new-artifact-task" label="Linked task" value={value.taskId} options={[{ value: "none", label: "No linked task" }, ...taskOptions]} onChange={taskId => setValue({ ...value, taskId })} disabled={pending} /></div>
      <p className="text-xs text-muted-foreground">Code is not executed. Charts, tables and diagrams use bounded native data. Media stores an external HTTPS reference and loads only on request. No file ingestion or generated content is implied.</p>
    </fieldset>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</OverlayBody><FormActions inset><Button variant="outline" type="button" onClick={close} disabled={pending}>Cancel</Button><Button type="submit" disabled={pending || !value.title.trim()}>{pending ? "Creating…" : "Create artifact"}</Button></FormActions></form>
  </TaskDialogContent></Dialog><ConfirmationDialog open={discarding} onOpenChange={setDiscarding} title="Discard this artifact draft?" description="Your entered title, format and task selection will be discarded." actionLabel="Discard draft" pending={false} onConfirm={() => { retained = null; onClose() }} /></>
}
