import type { ProjectClient, ProjectInput, ProjectPreviewState, ProjectReference } from "@/lib/api/project-types"

export type ProjectScreenProps = { client: ProjectClient; snapshot: ProjectPreviewState }
export const emptyProject: ProjectInput = { name: "", description: "", instructions: "" }
export const projectInput = (value: ProjectInput): ProjectInput => ({ name: value.name, description: value.description, instructions: value.instructions })
export const linkKey = (ref: ProjectReference) => JSON.stringify(ref.kind === "task" ? [ref.kind, ref.taskId] : ref.kind === "file" ? [ref.kind, ref.sessionId, ref.fileId] : [ref.kind, ref.sessionId])
export const kindLabel = (ref: ProjectReference) => ref.kind === "conversation" ? "Chat" : ref.kind === "task" ? "Task" : "File reference"
export const sourceHref = (ref: ProjectReference) => ref.kind === "task" ? `/activity?tab=tasks&task=${encodeURIComponent(ref.taskId)}` : `/chat/${encodeURIComponent(ref.sessionId)}`
