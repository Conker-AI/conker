import { z } from "zod"
import type { ProjectClient, ProjectContextPreview, ProjectInput, ProjectLink, ProjectPreviewState, ProjectRecord, ProjectReference, ProjectResolvedLink, ProjectView } from "./project-types"

const identity = z.string().trim().min(1).max(200)
const inputSchema = z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(2000), instructions: z.string().max(16000) }).strict()
const referenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("conversation"), sessionId: identity }).strict(),
  z.object({ kind: z.literal("task"), taskId: identity }).strict(),
  z.object({ kind: z.literal("file"), sessionId: identity, fileId: identity }).strict(),
])
const privacySchema = z.object({ memoryDisabled: z.boolean(), harnessDisabled: z.boolean(), incognito: z.boolean().optional() }).strict()
function referenceKey(reference: ProjectReference) {
  return JSON.stringify(reference.kind === "task" ? [reference.kind, reference.taskId] : reference.kind === "file" ? [reference.kind, reference.sessionId, reference.fileId] : [reference.kind, reference.sessionId])
}
function source(state: ProjectPreviewState, reference: ProjectReference) {
  const task = reference.kind === "task" ? state.tasks.find(item => item.id === reference.taskId) : undefined
  const sessionId = reference.kind === "task" ? task?.sessionId : reference.sessionId
  const session = state.sessions.find(item => item.id === sessionId)
  const file = reference.kind === "file" ? state.files.find(item => item.id === reference.fileId && item.sessionId === reference.sessionId) : undefined
  if (!session || !session.privacy || typeof session.privacy.memoryDisabled !== "boolean" || typeof session.privacy.harnessDisabled !== "boolean" || (reference.kind === "task" && !task) || (reference.kind === "file" && !file)) return null
  return {
    originSessionId: session.id, label: task?.outcome ?? file?.name ?? session.title,
    archived: Boolean(session.archived || task?.archivedAt), privacy: { ...session.privacy }, incognito: session.incognito === true,
  }
}
function resolve(state: ProjectPreviewState, link: ProjectLink): ProjectResolvedLink {
  const current = source(state, link.reference)
  if (!current || current.originSessionId !== link.snapshot.originSessionId) return {
    ...link, availability: current ? "origin-changed" : "unavailable", label: "Unavailable reference", labelSource: "unavailable", privacy: null, incognito: null,
  }
  return { ...link, availability: current.archived ? "archived" : "available", label: current.label, labelSource: "live-source", privacy: current.privacy, incognito: current.incognito }
}
export function resolveProjectView(state: ProjectPreviewState, project: ProjectRecord): ProjectView {
  return structuredClone({ ...project, links: project.links.map(link => resolve(state, link)) })
}
const view = resolveProjectView

/** Current, owner-visible link choices only. This catalog does not retrieve content. */
export function projectLinkCandidates(state: ProjectPreviewState): { reference: ProjectReference; label: string; originLabel: string; privateOrigin: boolean }[] {
  const references: ProjectReference[] = [
    ...state.sessions.map(item => ({ kind: "conversation" as const, sessionId: item.id })),
    ...state.tasks.map(item => ({ kind: "task" as const, taskId: item.id })),
    ...state.files.map(item => ({ kind: "file" as const, sessionId: item.sessionId, fileId: item.id })),
  ]
  return references.flatMap(reference => {
    const current = source(state, reference)
    return current && !current.archived ? [{ reference, label: current.label, originLabel: state.sessions.find(item => item.id === current.originSessionId)!.title, privateOrigin: current.incognito || current.privacy.memoryDisabled || current.privacy.harnessDisabled }] : []
  })
}

/** Memory-only grouping. Commits replace projects only; source records are never changed. */
export function createProjectPreviewClient(options: {
  getSnapshot: () => ProjectPreviewState
  /** Synchronous fixture commit and subscriber notification; no source mutation. */
  setProjects: (projects: ProjectRecord[]) => void
  now?: () => string
  newId?: () => string
}): ProjectClient {
  const snapshot = () => structuredClone(options.getSnapshot())
  const now = options.now ?? (() => new Date().toISOString())
  const newId = options.newId ?? (() => crypto.randomUUID())
  function find(state: ProjectPreviewState, id: string, revision?: number) {
    const project = state.projects.find(item => item.id === id)
    if (!project) throw new Error("Project not found.")
    if (revision !== undefined && (!Number.isSafeInteger(revision) || revision !== project.revision)) throw new Error("This project changed. Reload it before saving.")
    return project
  }
  function checked(state: ProjectPreviewState, id: string, revision: number) {
    if (!Number.isSafeInteger(revision) || revision < 1) throw new Error("Provide the current project revision.")
    return find(state, id, revision)
  }
  function editable(project: ProjectRecord) {
    if (project.archivedAt) throw new Error("Restore the project before changing it.")
  }
  function normalize(input: ProjectInput) {
    const result = inputSchema.safeParse(input)
    if (!result.success) throw new Error("Provide a project name (1–120 characters), description (up to 2,000), and instructions (up to 16,000), with no unsupported fields.")
    return result.data
  }
  function reference(value: ProjectReference): ProjectReference {
    const result = referenceSchema.safeParse(value)
    if (!result.success) throw new Error("Choose an existing conversation, task, or conversation file reference.")
    return result.data
  }
  function save(state: ProjectPreviewState, project: ProjectRecord) {
    project.revision++
    project.updatedAt = now()
    options.setProjects(structuredClone(state.projects))
    return view(state, project)
  }
  return {
    mode: "preview",
    async list() { const state = snapshot(); return state.projects.map(project => view(state, project)) },
    async get(id) { const state = snapshot(); return view(state, find(state, id)) },
    async create(input) {
      const value = normalize(input), state = snapshot(), at = now(), id = `project_${newId()}`
      if (state.projects.some(project => project.id === id)) throw new Error("Project identity collision. Retry creation.")
      const project: ProjectRecord = { ...value, id, revision: 1, provenance: "preview", createdAt: at, updatedAt: at, archivedAt: null, links: [] }
      state.projects.push(project)
      options.setProjects(structuredClone(state.projects))
      return view(state, project)
    },
    async update(id, input, revision) {
      const state = snapshot(), project = checked(state, id, revision)
      editable(project)
      Object.assign(project, normalize(input))
      return save(state, project)
    },
    async archive(id, archived, revision) {
      const state = snapshot(), project = checked(state, id, revision)
      if (typeof archived !== "boolean") throw new Error("Specify whether to archive or restore the project.")
      if (Boolean(project.archivedAt) === archived) return view(state, project)
      project.archivedAt = archived ? now() : null
      return save(state, project)
    },
    async remove(id, revision) {
      const state = snapshot(), project = checked(state, id, revision)
      if (!project.archivedAt || project.links.length) throw new Error("Only empty archived projects can be deleted. Restore and unlink references first; source records will be retained.")
      options.setProjects(state.projects.filter(item => item.id !== id))
    },
    async link(id, input, revision) {
      const state = snapshot(), project = checked(state, id, revision), value = reference(input)
      editable(project)
      const current = source(state, value)
      if (!current || current.archived) throw new Error("Choose an available, unarchived source with known origin privacy.")
      const existing = project.links.find(item => referenceKey(item.reference) === referenceKey(value))
      if (existing) {
        if (existing.snapshot.originSessionId !== current.originSessionId) throw new Error("The source origin changed. Unlink it and review its current origin before linking again.")
        return view(state, project)
      }
      if (project.links.length >= 1000) throw new Error("A project can contain up to 1,000 references.")
      project.links.push({ reference: value, mode: "live-reference", snapshot: { originSessionId: current.originSessionId, linkedAt: now() } })
      return save(state, project)
    },
    async unlink(id, input, revision) {
      const state = snapshot(), project = checked(state, id, revision), value = reference(input)
      editable(project)
      const index = project.links.findIndex(item => referenceKey(item.reference) === referenceKey(value))
      if (index < 0) return view(state, project)
      project.links.splice(index, 1)
      return save(state, project)
    },
    async search(id, query) {
      if (typeof query !== "string" || query.length > 500) throw new Error("Search linked metadata with up to 500 characters.")
      const state = snapshot(), project = find(state, id), term = query.trim().toLowerCase()
      const links = project.links.map(link => resolve(state, link)).filter(link => link.labelSource === "live-source" && link.label.toLowerCase().includes(term))
      return structuredClone({ scope: "linked-metadata-only", projectId: id, projectRevision: project.revision, links })
    },
    async previewContext(id, target) {
      const parsed = privacySchema.safeParse(target)
      if (!parsed.success) throw new Error("Provide the target conversation's explicit memory and harness privacy flags.")
      const state = snapshot(), project = find(state, id)
      const result: ProjectContextPreview = {
        mode: "preview", execution: "not-wired", projectId: id, projectRevision: project.revision,
        instruction: !project.archivedAt && project.instructions.trim() ? { scope: "project", sourceId: id, text: project.instructions } : null,
        references: [], excluded: [], contentIncluded: false, grantsInherited: false, memoryWritesAllowed: false, providerAuthorization: "not-evaluated",
      }
      for (const link of project.links.map(item => resolve(state, item))) {
        const reason = project.archivedAt ? "project-archived" : link.availability === "unavailable" ? "unavailable" : link.availability === "origin-changed" ? "origin-changed" : link.availability === "archived" ? "source-archived" : parsed.data.incognito || parsed.data.memoryDisabled || parsed.data.harnessDisabled ? "target-private" : link.incognito || link.privacy?.memoryDisabled || link.privacy?.harnessDisabled ? "origin-private" : null
        if (reason) result.excluded.push({ reference: link.reference, reason })
        else result.references.push(link)
      }
      return structuredClone(result)
    },
  }
}
