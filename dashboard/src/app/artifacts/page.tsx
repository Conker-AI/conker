import { useState } from "react"
import { Files, Plus } from "lucide-react"
import { BaseLayout } from "@/components/layouts/base-layout"
import { CollectionPanel, CollectionRow, CollectionSection } from "@/components/design-system"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useConkerStore } from "@/lib/api/store"
import { artifactKindLabels, availabilityLabels, type ArtifactScreenProps } from "./format"
import { CreateArtifact } from "./create-artifact"

export default function ArtifactsPage(props: ArtifactScreenProps) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("active")
  const [creating, setCreating] = useState(false)
  const { notice, pending } = useConkerStore()
  const artifacts = props.artifacts.filter(artifact => (filter === "all" || Boolean(artifact.archivedAt) === (filter === "archived")) && artifact.title.toLowerCase().includes(query.trim().toLowerCase()))
  return <BaseLayout variant="collection" title="Artifacts" description="Versioned documents, code, tables, charts, diagrams, media references and HTML apps." status={<Badge variant="outline">Preview</Badge>} actions={<Button onClick={() => setCreating(true)} disabled={pending}><Plus />New artifact</Button>}>
    <p className="text-xs text-muted-foreground">Save a response from its chat menu or create your own. Original responses stay unchanged. Changes reset on reload.</p>
    {notice && <p role="status" className="text-sm">{notice}</p>}
    <Select value={filter} onValueChange={setFilter}><SelectTrigger aria-label="Filter artifacts" className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active artifacts</SelectItem><SelectItem value="archived">Archived artifacts</SelectItem><SelectItem value="all">All artifacts</SelectItem></SelectContent></Select>
    <CollectionPanel query={query} onQueryChange={setQuery} label="Search artifacts" placeholder="Search artifact titles" count={artifacts.length} unit="artifacts" emptyTitle={query ? "No matching artifacts" : filter === "archived" ? "No archived artifacts" : "Keep an output you can return to"} emptyDescription={query ? "Try another title. Source contents are not indexed." : filter === "archived" ? "Archived artifacts retain all versions and can be restored." : "Create an artifact or save a completed assistant response from a chat."} emptyAction={filter === "archived" ? <Button variant="outline" onClick={() => setFilter("active")}>Show active artifacts</Button> : <Button onClick={() => setCreating(true)}>Create an artifact</Button>} icon={<Files />}>
      <CollectionSection title={filter === "archived" ? "Archived artifacts" : filter === "all" ? "All artifacts" : "Active artifacts"}>{artifacts.map(artifact => { const content = artifact.versions.at(-1)?.content; return <CollectionRow key={artifact.id} to={`/artifacts/${encodeURIComponent(artifact.id)}`} title={artifact.title} leading={<Files className="size-5 text-muted-foreground" />} description={<span className="truncate">{content ? artifactKindLabels[content.kind] : availabilityLabels[artifact.availability]}{artifact.privateOrigin ? " · Private origin" : ""}{artifact.archivedAt ? " · Archived" : ""}</span>} trailing={<span>{artifact.versionCount} versions</span>} /> })}</CollectionSection>
    </CollectionPanel>
    {creating && <CreateArtifact {...props} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); setFilter("active"); setQuery("") }} />}
  </BaseLayout>
}
