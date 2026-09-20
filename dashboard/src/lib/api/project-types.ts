import type { ConversationPrivacy } from "./conversation-types"

export type ProjectInput = { name: string; description: string; instructions: string }
export type ProjectReference =
  | { kind: "conversation"; sessionId: string }
  | { kind: "task"; taskId: string }
  | { kind: "file"; sessionId: string; fileId: string }
export type ProjectLink = {
  reference: ProjectReference
  mode: "live-reference"
  /** Identity at link time, not copied source content or a permission grant. */
  snapshot: { originSessionId: string; linkedAt: string }
}
export type ProjectRecord = ProjectInput & {
  id: string
  revision: number
  provenance: "preview"
  createdAt: string
  updatedAt: string
  archivedAt: string | null
  links: ProjectLink[]
}
export type ProjectResolvedLink = ProjectLink & {
  availability: "available" | "archived" | "unavailable" | "origin-changed"
  /** A current label only. Unavailable sources expose no cached text. */
  label: string
  labelSource: "live-source" | "unavailable"
  privacy: ConversationPrivacy | null
  incognito: boolean | null
}
export type ProjectView = Omit<ProjectRecord, "links"> & { links: ProjectResolvedLink[] }

/** The adapter supplies only references the current owner is authorized to see.
 * Files are existing conversation file references, never filesystem paths/uploads.
 * Missing conversation privacy is unavailable, never implicitly public.
 */
export type ProjectPreviewState = {
  projects: ProjectRecord[]
  sessions: { id: string; title: string; archived?: boolean; privacy?: ConversationPrivacy; incognito?: boolean }[]
  tasks: { id: string; outcome: string; sessionId: string; archivedAt: string | null }[]
  files: { id: string; name: string; sessionId: string }[]
}
export type ProjectSearchResult = {
  scope: "linked-metadata-only"
  projectId: string
  projectRevision: number
  links: ProjectResolvedLink[]
}
export type ProjectContextPreview = {
  mode: "preview"
  execution: "not-wired"
  projectId: string
  projectRevision: number
  /** Owner instructions are a distinct layer, outside compressible source history. */
  instruction: { scope: "project"; sourceId: string; text: string } | null
  references: ProjectResolvedLink[]
  excluded: { reference: ProjectReference; reason: "project-archived" | "unavailable" | "source-archived" | "origin-changed" | "origin-private" | "target-private" }[]
  contentIncluded: false
  grantsInherited: false
  memoryWritesAllowed: false
  providerAuthorization: "not-evaluated"
}
export interface ProjectClient {
  readonly mode: "preview"
  list(): Promise<ProjectView[]>
  get(id: string): Promise<ProjectView>
  create(input: ProjectInput): Promise<ProjectView>
  update(id: string, input: ProjectInput, revision: number): Promise<ProjectView>
  archive(id: string, archived: boolean, revision: number): Promise<ProjectView>
  /** Empty archived projects only; never deletes a linked source. */
  remove(id: string, revision: number): Promise<void>
  link(id: string, reference: ProjectReference, revision: number): Promise<ProjectView>
  unlink(id: string, reference: ProjectReference, revision: number): Promise<ProjectView>
  /** Owner inspection of live labels only, including private origins; never helper search. */
  search(id: string, query: string): Promise<ProjectSearchResult>
  previewContext(id: string, target: ConversationPrivacy & { incognito?: boolean }): Promise<ProjectContextPreview>
}
