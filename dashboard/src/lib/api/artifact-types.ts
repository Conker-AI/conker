import type { ConversationCitation, ConversationPrivacy } from "./conversation-types"

/** Native data only. Code is inert text; chart data never contains expressions. */
export type ArtifactContent =
  | { kind: "media"; mediaType: "image" | "audio" | "video"; url: string; description: string }
  | { kind: "markdown"; text: string }
  | { kind: "code"; text: string; language: string }
  | { kind: "table"; columns: string[]; rows: string[][] }
  | { kind: "diagram"; nodes: { id: string; label: string; description?: string; x: number; y: number }[]; edges: { id: string; source: string; target: string; label?: string }[] }
  | { kind: "chart"; chartType: "bar" | "line" | "area"; xLabel: string; series: { label: string }[]; rows: { label: string; values: number[] }[] }
export type ArtifactVersion = {
  version: number; title: string; content: ArtifactContent; note: string; createdAt: string
  author: "owner" | "source-copy"
  /** Supplied source evidence, never independently verified. Hidden with the version body. */
  citations?: ConversationCitation[]
  restoredFromVersion?: number
}
export type ArtifactSource = { sessionId: string; messageId: string }
/** Internal storage. Consumers must use resolved views, not raw records. */
export type ArtifactRecord = {
  id: string; title: string; revision: number; createdAt: string; updatedAt: string; archivedAt: string | null
  provenance: "preview"; origin: "owner-authored" | "conversation-copy"
  source: ArtifactSource | null
  /** Exact comparison prevents source edits from exposing a stale copy. Never returned in a view. */
  sourceTextAtCreation: string | null
  task: { taskId: string; originSessionId: string } | null
  versions: ArtifactVersion[]
}
export type ArtifactAvailability = "available" | "source-archived" | "source-unavailable" | "source-redacted" | "source-changed" | "privacy-unknown"
export type ArtifactView = Omit<ArtifactRecord, "sourceTextAtCreation" | "versions"> & {
  availability: ArtifactAvailability
  /** Empty when the source is unavailable, redacted, changed, or its privacy is unknown. */
  versions: ArtifactVersion[]
  versionCount: number
  currentVersion: number
  privateOrigin: boolean | null
  privacy: ConversationPrivacy | null
  taskAvailability: "none" | "available" | "archived" | "unavailable" | "origin-changed"
  execution: "not-wired"
}
export type ArtifactInput = { title: string; content: ArtifactContent; taskId?: string }
export type ArtifactMessageInput = ArtifactSource & { title: string; taskId?: string }
export type ArtifactVersionInput = {
  content: ArtifactContent; title?: string; note?: string
  /** Markdown edits retain the latest version's citations by default; false explicitly removes them.
   * Non-Markdown edits never carry citations. Restoring copies the selected historical version. */
  preserveCitations?: boolean
}
export type ArtifactExport = {
  artifactId: string; version: number; filename: string; mime: string; text: string
  provenance: "preview"; privateOrigin: boolean; execution: "not-wired"
}
export type ArtifactPreviewState = {
  artifacts: ArtifactRecord[]
  sessions: { id: string; archived?: boolean; privacy?: ConversationPrivacy; incognito?: boolean }[]
  messages: { sessionId: string; id: string; role: "user" | "assistant"; text: string; status?: "complete" | "stopped" | "failed"; redacted?: boolean; citations?: ConversationCitation[] }[]
  tasks: { id: string; sessionId: string; archivedAt: string | null }[]
}
export interface ArtifactClient {
  readonly mode: "preview"
  list(): Promise<ArtifactView[]>
  get(id: string): Promise<ArtifactView>
  /** Owner-authored only. Source provenance cannot be supplied through this method. */
  create(input: ArtifactInput): Promise<ArtifactView>
  /** Copies the current exact completed assistant response, without invoking a model. */
  createFromMessage(input: ArtifactMessageInput): Promise<ArtifactView>
  appendVersion(id: string, input: ArtifactVersionInput, revision: number): Promise<ArtifactView>
  restore(id: string, version: number, revision: number): Promise<ArtifactView>
  archive(id: string, archived: boolean, revision: number): Promise<ArtifactView>
  /** Owner-triggered inert bytes only; no upload, execution, or network access. */
  export(id: string, version?: number): Promise<ArtifactExport>
}
