import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { Link2 } from "lucide-react"
import { BaseLayout } from "@/components/layouts/base-layout"
import { CollectionPanel, ConfirmationDialog, FormActions, RecordItem } from "@/components/design-system"
import { ReferenceSection } from "@/components/reference-section"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useConkerStore } from "@/lib/api/store"
import { resolveProjectView } from "@/lib/api/project-preview"
import type { ProjectInput, ProjectView } from "@/lib/api/project-types"
import { ProjectContext } from "./context-preview"
import { LinkProjectReference, ProjectReferenceDetails } from "./references"
import { kindLabel, linkKey, projectInput, type ProjectScreenProps } from "./format"
import { ProjectFields } from "./shared"
import { takeMutationError } from "./feedback"

type Draft = { value: ProjectInput; base: ProjectInput; revision: number }
const drafts = new Map<string, Draft>()

function ProjectEditor({ client, snapshot, project }: ProjectScreenProps & { project: ProjectView }) {
  const navigate = useNavigate()
  const [draft, setDraft] = useState<Draft>(() => drafts.get(project.id) ?? { value: projectInput(project), base: projectInput(project), revision: project.revision })
  const [query, setQuery] = useState("")
  const [linking, setLinking] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState("")
  const [feedback, setFeedback] = useState("")
  const { pending, mutate } = useConkerStore()
  const dirty = JSON.stringify(draft.value) !== JSON.stringify(draft.base)
  const changed = project.revision !== draft.revision
  const frozen = pending || !!project.archivedAt
  const links = project.links.filter(link => `${link.label} ${kindLabel(link.reference)}`.toLowerCase().includes(query.trim().toLowerCase()))
  const selected = project.links.find(link => linkKey(link.reference) === selectedKey) ?? null
  useEffect(() => { if (dirty) drafts.set(project.id, draft); else drafts.delete(project.id) }, [dirty, draft, project.id])
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn) }, [dirty])
  const reset = (value: ProjectView) => { setDraft({ value: projectInput(value), base: projectInput(value), revision: value.revision }); drafts.delete(project.id); setError("") }
  const change = async (action: () => Promise<ProjectView>, notice: string) => {
    setError(""); setFeedback("")
    let savedProject: ProjectView | undefined
    const saved = await mutate(async () => { savedProject = await action() }, notice)
    if (saved && savedProject) { reset(savedProject); setFeedback(notice) }
    else setError(takeMutationError() || "Could not update this project. Review the current record before retrying.")
    return saved
  }
  return <>
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline"><Link to="/projects">Back to projects</Link></Button>
      <Button variant="outline" disabled={pending || dirty} onClick={() => void change(() => client.archive(project.id, !project.archivedAt, project.revision), project.archivedAt ? "Project restored in preview." : "Project archived. All source records and references are retained.")}>{project.archivedAt ? "Restore project" : "Archive project"}</Button>
      {project.archivedAt && !project.links.length && <Button variant="outline" disabled={pending} onClick={() => setDeleting(true)}>Delete empty project</Button>}
    </div>
    {project.archivedAt && <p role="status" className="text-sm text-muted-foreground">This project is archived. Restore it to edit instructions or manage links. Source records remain available independently.</p>}
    <div className="grid min-w-0 items-start gap-6 lg:grid-cols-12">
      <div className="min-w-0 space-y-6 lg:col-span-7">
        <form id="project-editor" onSubmit={event => { event.preventDefault(); if (!dirty || frozen) return; void change(() => client.update(project.id, draft.value, draft.revision), "Project saved in preview. Changes reset on reload.") }}>
          <ReferenceSection title="Project details"><fieldset disabled={frozen}><ProjectFields value={draft.value} onChange={value => setDraft({ ...draft, value })} /></fieldset></ReferenceSection>
        </form>
        <ReferenceSection title="Linked work">
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Search current names within this project. Chat contents and file contents are not indexed.</p><Button variant="outline" disabled={frozen || dirty || changed} onClick={() => setLinking(true)}><Link2 />Link existing work</Button></div>
          {dirty && <p className="text-xs text-muted-foreground">Save or reset your draft before changing links or archiving.</p>}
          <CollectionPanel query={query} onQueryChange={setQuery} label="Search project references" placeholder="Search linked names and types" count={links.length} unit="linked references" emptyTitle={query ? "No matching references" : "No linked work yet"} emptyDescription={query ? "Search a current source name or reference type." : "Link an existing chat, task or file reference. Original records stay where they are."} emptyAction={!project.archivedAt ? <Button variant="outline" disabled={frozen || dirty || changed} onClick={() => setLinking(true)}>Link existing work</Button> : undefined}>
            <div className="divide-y rounded-xl border bg-card text-card-foreground">{links.map(link => <RecordItem key={linkKey(link.reference)} title={link.label} description={kindLabel(link.reference)} meta={<><span>{link.availability === "available" ? "Live reference" : link.availability === "archived" ? "Archived source" : link.availability === "origin-changed" ? "Origin changed" : "Unavailable source"}</span>{(link.incognito || link.privacy?.memoryDisabled || link.privacy?.harnessDisabled) && <span>Private origin</span>}</>} onOpen={() => setSelectedKey(linkKey(link.reference))} />)}</div>
          </CollectionPanel>
        </ReferenceSection>
      </div>
      <div className="min-w-0 lg:col-span-5"><ProjectContext client={client} snapshot={snapshot} projectId={project.id} dirty={dirty} /></div>
    </div>
    <div className="sticky bottom-0 z-10 space-y-3 bg-background py-3">
      {error && !linking && !selected && !deleting && <p role="alert" className="text-sm text-destructive">{error}</p>}{feedback && <p role="status" className="text-sm">{feedback}</p>}
      {changed && <p role="status" className="text-sm">The saved project changed. Reset to its current version before making more changes. Your draft is retained.</p>}
      <FormActions description={dirty ? "Unsaved draft kept when navigating away" : "Preview only; changes reset on reload"}><Button variant="outline" disabled={pending || !(dirty || changed)} onClick={() => { reset(project); setFeedback("") }}>Reset changes</Button><Button type="submit" form="project-editor" disabled={frozen || !dirty || changed || !draft.value.name.trim()}>{pending ? "Saving…" : "Save preview"}</Button></FormActions>
    </div>
    {linking && <LinkProjectReference snapshot={snapshot} project={project} pending={pending} error={error} onClose={() => setLinking(false)} onLink={reference => change(() => client.link(project.id, reference, project.revision), "Reference linked in preview. Its source and privacy are unchanged.")} />}
    <ProjectReferenceDetails reference={selected} pending={pending} error={error} canUnlink={!frozen && !dirty && !changed} onClose={() => setSelectedKey(null)} onUnlink={async () => { if (selected && await change(() => client.unlink(project.id, selected.reference, project.revision), "Reference unlinked. Original record retained.")) setSelectedKey(null) }} />
    <ConfirmationDialog open={deleting} onOpenChange={setDeleting} title={`Delete ${project.name}?`} description="Only this empty archived project will be removed. Chats, tasks and file references are not deleted." actionLabel="Delete project" pending={pending} error={error} onConfirm={async () => { const saved = await mutate(() => client.remove(project.id, project.revision), "Empty preview project deleted."); if (saved) { drafts.delete(project.id); navigate("/projects") } else setError(takeMutationError()) }} />
  </>
}

export default function ProjectEditorPage({ client, snapshot }: ProjectScreenProps) {
  const { id } = useParams()
  const project = useMemo(() => { const record = snapshot.projects.find(item => item.id === id); return record ? resolveProjectView(snapshot, record) : null }, [snapshot, id])
  return <BaseLayout title={project?.name ?? "Project unavailable"} description="Manage project guidance and explicit links to existing work." status={<Badge variant="outline">Preview</Badge>}>
    {project ? <ProjectEditor key={project.id} client={client} snapshot={snapshot} project={project} /> : <p>This project is unavailable in the current preview. <Link className="underline" to="/projects">Back to projects</Link></p>}
  </BaseLayout>
}
