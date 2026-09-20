import { useState } from "react"
import { Link } from "react-router-dom"
import { CollectionPanel, DetailPanel, FormActions, OverlayBody, RecordItem, TaskDialogContent } from "@/components/design-system"
import { ReferenceSection } from "@/components/reference-section"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { projectLinkCandidates } from "@/lib/api/project-preview"
import type { ProjectPreviewState, ProjectReference, ProjectResolvedLink, ProjectView } from "@/lib/api/project-types"
import { kindLabel, linkKey, sourceHref } from "./format"

export function LinkProjectReference({ snapshot, project, pending, error, onClose, onLink }: { snapshot: ProjectPreviewState; project: ProjectView; pending: boolean; error: string; onClose: () => void; onLink: (reference: ProjectReference) => Promise<boolean> }) {
  const [query, setQuery] = useState("")
  const [kind, setKind] = useState("all")
  const candidates = projectLinkCandidates(snapshot).filter(item => !project.links.some(link => linkKey(link.reference) === linkKey(item.reference)) && (kind === "all" || item.reference.kind === kind) && `${item.label} ${item.originLabel}`.toLowerCase().includes(query.trim().toLowerCase()))
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose() }}><TaskDialogContent title="Link existing work" description="References keep their original source and privacy. Linking does not copy content or grant access." size="wide" showCloseButton={!pending} onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (pending) event.preventDefault() }}>
    <OverlayBody>
      <Select value={kind} onValueChange={setKind} disabled={pending}><SelectTrigger aria-label="Reference type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All reference types</SelectItem><SelectItem value="conversation">Chats</SelectItem><SelectItem value="task">Tasks</SelectItem><SelectItem value="file">File references</SelectItem></SelectContent></Select>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <CollectionPanel query={query} onQueryChange={setQuery} label="Search available references" placeholder="Search source names and chats" count={candidates.length} unit="available references" emptyTitle="No available references" emptyDescription="Try another search or type. Already linked, archived and unavailable sources are excluded.">
        <div className="divide-y rounded-xl border bg-card text-card-foreground">{candidates.map(item => <RecordItem key={linkKey(item.reference)} title={item.label} description={`${kindLabel(item.reference)} in ${item.originLabel}`} meta={item.privateOrigin ? "Private origin: excluded from cross-chat context preview" : "Existing source; live label"} actions={<Button size="sm" variant="outline" disabled={pending} onClick={() => { void onLink(item.reference).then(saved => { if (saved) onClose() }) }}>Link {kindLabel(item.reference).toLowerCase()}</Button>} />)}</div>
      </CollectionPanel>
      <p className="text-xs text-muted-foreground">File choices are existing conversation references. No files are uploaded or ingested.</p>
    </OverlayBody><FormActions inset><Button variant="outline" onClick={onClose} disabled={pending}>Close</Button></FormActions>
  </TaskDialogContent></Dialog>
}

export function ProjectReferenceDetails({ reference, pending, error, canUnlink, onClose, onUnlink }: { reference: ProjectResolvedLink | null; pending: boolean; error: string; canUnlink: boolean; onClose: () => void; onUnlink: () => Promise<void> }) {
  const available = reference?.labelSource === "live-source"
  return <DetailPanel open={!!reference} onOpenChange={open => { if (!open) onClose() }} busy={pending} title={reference?.label ?? "Reference"} description="Live source reference; identity captured when linked">
    {reference && <><OverlayBody>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <ReferenceSection title="Source"><p>{kindLabel(reference.reference)}</p><p className="text-sm text-muted-foreground">{available ? "The label is read from the current source. Content remains in its original record." : reference.availability === "origin-changed" ? "This source moved to a different conversation. Unlink and review its current origin before linking again." : "The source or its privacy metadata is unavailable. This link retains identity only; no cached title or content is shown."}</p>{available && <Button asChild variant="outline"><Link to={sourceHref(reference.reference)}>{reference.reference.kind === "file" ? "Open source chat" : "Open source"}</Link></Button>}</ReferenceSection>
      <ReferenceSection title="Reference history"><dl className="space-y-2 text-sm"><div><dt className="text-muted-foreground">Availability</dt><dd>{reference.availability}</dd></div><div><dt className="text-muted-foreground">Linked at</dt><dd>{new Date(reference.snapshot.linkedAt).toLocaleString()}</dd></div><div><dt className="text-muted-foreground">Origin conversation</dt><dd className="break-all">{reference.snapshot.originSessionId}</dd></div></dl></ReferenceSection>
      <ReferenceSection title="Origin privacy"><p className="text-sm">{!reference.privacy ? "Unknown privacy: excluded from context preview." : `Memory ${reference.privacy.memoryDisabled ? "disabled" : "enabled"}; harness ${reference.privacy.harnessDisabled ? "disabled" : "enabled"}${reference.incognito ? "; Incognito" : ""}.`}</p><p className="text-xs text-muted-foreground">Project membership never combines memory scopes or permissions.</p></ReferenceSection>
    </OverlayBody><FormActions inset description="Unlinking keeps the original record."><Button variant="outline" onClick={onClose} disabled={pending}>Close</Button><Button variant="outline" disabled={pending || !canUnlink} onClick={() => void onUnlink()}>Unlink reference</Button></FormActions></>}
  </DetailPanel>
}
