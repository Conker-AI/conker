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
