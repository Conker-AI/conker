import { useState } from "react"
import { Folder, Plus } from "lucide-react"
import { BaseLayout } from "@/components/layouts/base-layout"
import { CollectionPanel, CollectionRow, CollectionSection } from "@/components/design-system"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useConkerStore } from "@/lib/api/store"
import { CreateProject } from "./create-project"
import type { ProjectScreenProps } from "./format"

export default function ProjectsPage({ client, snapshot }: ProjectScreenProps) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("active")
  const [creating, setCreating] = useState(false)
  const { notice, pending } = useConkerStore()
  const projects = snapshot.projects.filter(project => (filter === "all" || Boolean(project.archivedAt) === (filter === "archived")) && `${project.name} ${project.description}`.toLowerCase().includes(query.trim().toLowerCase()))
  return <BaseLayout variant="collection" title="Projects" description="Keep related chats, tasks and file references together." status={<Badge variant="outline">Preview</Badge>} actions={<Button onClick={() => setCreating(true)} disabled={pending}><Plus />New project</Button>}>
    <p className="text-xs leading-5 text-muted-foreground">Grouping preserves the original records. Memory scopes and permissions stay separate. Changes reset on reload.</p>
    {notice && <p role="status" className="text-sm">{notice}</p>}
    <Select value={filter} onValueChange={setFilter}><SelectTrigger aria-label="Filter projects" className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active projects</SelectItem><SelectItem value="archived">Archived projects</SelectItem><SelectItem value="all">All projects</SelectItem></SelectContent></Select>
    <CollectionPanel query={query} onQueryChange={setQuery} label="Search projects" placeholder="Search project names and descriptions" count={projects.length} unit="projects" emptyTitle={query ? "No matching projects" : filter === "archived" ? "No archived projects" : "Group related work"} emptyDescription={query ? "Try a different project name or description." : filter === "archived" ? "Archived projects retain their links and can be restored here." : "Create a project, then link the chats, tasks and file references that belong together."} emptyAction={filter === "archived" ? <Button variant="outline" onClick={() => setFilter("active")}>Show active projects</Button> : <Button onClick={() => setCreating(true)}><Plus />Create a project</Button>} icon={<Folder />}>
      <CollectionSection title={filter === "archived" ? "Archived projects" : filter === "all" ? "All projects" : "Active projects"}>{projects.map(project => <CollectionRow key={project.id} to={`/projects/${encodeURIComponent(project.id)}`} title={project.name} description={<span className="truncate">{project.description || "Open to add instructions and link existing work."}</span>} leading={<Folder className="size-5 text-muted-foreground" />} trailing={<><span>{project.links.length} references</span>{project.archivedAt && <span>Archived</span>}</>} />)}</CollectionSection>
    </CollectionPanel>
    {creating && <CreateProject client={client} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); setFilter("active"); setQuery("") }} />}
  </BaseLayout>
}
