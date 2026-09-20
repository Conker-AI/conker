import { z } from "zod"
import { normalizeMediaUrl } from "../artifact-media"
import type { ArtifactAvailability, ArtifactClient, ArtifactContent, ArtifactExport, ArtifactPreviewState, ArtifactRecord, ArtifactVersion, ArtifactView } from "./artifact-types"
import type { ConversationCitation } from "./conversation-types"

const idSchema = z.string().trim().min(1).max(200)
const titleSchema = z.string().trim().min(1).max(160)
const diagramId = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/)
const contentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("media"), mediaType: z.enum(["image", "audio", "video"]), url: z.string().max(2048), description: z.string().max(2000) }).strict(),
  z.object({ kind: z.literal("diagram"), nodes: z.array(z.object({ id: diagramId, label: z.string().trim().min(1).max(200), description: z.string().max(2000).optional(), x: z.number().finite().min(-10000).max(10000), y: z.number().finite().min(-10000).max(10000) }).strict()).max(100), edges: z.array(z.object({ id: diagramId, source: diagramId, target: diagramId, label: z.string().max(200).optional() }).strict()).max(200) }).strict(),
  z.object({ kind: z.literal("markdown"), text: z.string().max(200_000) }).strict(),
  z.object({ kind: z.literal("code"), text: z.string().max(200_000), language: z.string().trim().regex(/^[a-zA-Z0-9+#._-]{0,40}$/) }).strict(),
  z.object({ kind: z.literal("table"), columns: z.array(z.string().max(1000)).min(1).max(32), rows: z.array(z.array(z.string().max(10_000)).max(32)).max(1000) }).strict(),
  z.object({ kind: z.literal("chart"), chartType: z.enum(["bar", "line", "area"]), xLabel: z.string().max(1000), series: z.array(z.object({ label: z.string().min(1).max(200) }).strict()).min(1).max(8), rows: z.array(z.object({ label: z.string().max(1000), values: z.array(z.number().finite()).min(1).max(8) }).strict()).max(500) }).strict(),
])
const ownerSchema = z.object({ title: titleSchema, content: contentSchema, taskId: idSchema.optional() }).strict()
const messageSchema = z.object({ title: titleSchema, sessionId: idSchema, messageId: idSchema, taskId: idSchema.optional() }).strict()
const versionSchema = z.object({ content: contentSchema, title: titleSchema.optional(), note: z.string().trim().max(1000).optional(), preserveCitations: z.boolean().optional() }).strict()
const citationsSchema = z.array(z.object({ id: z.string().min(1).max(200), label: z.string().min(1).max(500), href: z.string().max(2048).optional(), excerpt: z.string().max(8000).optional() }).strict()).max(100)
const readable = (availability: ArtifactAvailability) => availability === "available" || availability === "source-archived"

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new Error(`Check artifact ${result.error.issues[0].path.join(".") || "fields"}: ${result.error.issues[0].message}`)
  return result.data
}
function checkedContent(value: ArtifactContent): ArtifactContent {
  if (value.kind === "media") value = { ...value, url: normalizeMediaUrl(value.url) }
  if (value.kind === "diagram") {
    const ids = new Set(value.nodes.map(node => node.id))
    if (ids.size !== value.nodes.length) throw new Error("Diagram node IDs must be distinct.")
    if (new Set(value.edges.map(edge => edge.id)).size !== value.edges.length) throw new Error("Diagram connection IDs must be distinct.")
    if (value.edges.some(edge => !ids.has(edge.source) || !ids.has(edge.target))) throw new Error("Every diagram connection must reference existing node IDs.")
    if (value.edges.some(edge => edge.source === edge.target)) throw new Error("Diagram connections must join two different nodes.")
  }
  if (JSON.stringify(value).length > 250_000) throw new Error("Artifact content must fit within 250,000 serialized characters.")
  if (value.kind === "table" && value.rows.some(row => row.length !== value.columns.length)) throw new Error("Every table row must match the column count.")
  if (value.kind === "chart") {
    if (new Set(value.series.map(series => series.label)).size !== value.series.length) throw new Error("Chart series labels must be distinct.")
    if (value.rows.some(row => row.values.length !== value.series.length)) throw new Error("Every chart row must match the series count.")
  }
  return value
}

function sourceCitations(value: unknown): ConversationCitation[] {
  const citations = parse(citationsSchema, value ?? [])
  if (new Set(citations.map(citation => citation.id)).size !== citations.length || JSON.stringify(citations).length > 100_000) throw new Error("Source citations must have unique IDs and fit within 100,000 characters.")
  return citations
}
function sameSourceCitations(current: unknown, original?: ConversationCitation[]) {
  try { return JSON.stringify(sourceCitations(current)) === JSON.stringify(sourceCitations(original)) }
  catch { return false }
}

/** Shared validation for editable native previews; rejects executable or unknown fields. */
export function normalizeArtifactContent(value: unknown): ArtifactContent {
  return checkedContent(parse(contentSchema, value))
}

/** Owner inspection only. No bodies escape when an originating message becomes unavailable. */
export function resolveArtifactView(state: ArtifactPreviewState, record: ArtifactRecord): ArtifactView {
  let availability: ArtifactAvailability = "available"
  let privacy: ArtifactView["privacy"] = null
  let privateOrigin: boolean | null = false
  if (record.source) {
    const session = state.sessions.find(item => item.id === record.source!.sessionId)
    const message = state.messages.find(item => item.sessionId === record.source!.sessionId && item.id === record.source!.messageId)
    if (!session || !message) availability = "source-unavailable"
    else if (message.redacted) availability = "source-redacted"
    else if (message.text !== record.sourceTextAtCreation || message.status !== "complete" || message.role !== "assistant" || !sameSourceCitations(message.citations, record.versions[0]?.citations)) availability = "source-changed"
    else if (!session.privacy || typeof session.privacy.memoryDisabled !== "boolean" || typeof session.privacy.harnessDisabled !== "boolean") availability = "privacy-unknown"
    else {
      privacy = { ...session.privacy }
      privateOrigin = session.incognito === true || privacy.memoryDisabled || privacy.harnessDisabled
      if (session.archived) availability = "source-archived"
    }
    if (!readable(availability)) privateOrigin = null
  }
  const task = record.task && state.tasks.find(item => item.id === record.task!.taskId)
  const taskAvailability = !record.task ? "none" : !task ? "unavailable" : task.sessionId !== record.task.originSessionId ? "origin-changed" : task.archivedAt ? "archived" : "available"
  const { sourceTextAtCreation: _sourceText, versions, ...metadata } = record
  void _sourceText
  return structuredClone({ ...metadata, title: readable(availability) ? record.title : "Unavailable artifact", availability, privacy, privateOrigin, taskAvailability,
    versions: readable(availability) ? versions : [], versionCount: versions.length, currentVersion: versions.at(-1)?.version ?? 0, execution: "not-wired" })
}

function csv(content: Extract<ArtifactContent, { kind: "table" }>) {
  return [content.columns, ...content.rows].map(row => row.map(cell => {
    let offset = 0
    while (offset < cell.length && (cell.charCodeAt(offset) < 32 || /\s/.test(cell[offset]))) offset++
    const safe = /^[=+\-@]/.test(cell.slice(offset)) || /^[\t\r\n]/.test(cell) ? `'${cell}` : cell
    return `"${safe.replaceAll('"', '""')}"`
  }).join(",")).join("\r\n")
}
function exportVersion(record: ArtifactView, version: ArtifactVersion): ArtifactExport {
  const content = version.content
  // Preserve lookup metadata offline without turning supplied links/labels into active markup.
  const sourceAppendix = content.kind === "markdown" && version.citations?.length
    ? `\n\n## Supplied source references\n\nThese references were supplied with the source response; they were not independently verified.\n\n\`\`\`json\n${JSON.stringify(version.citations, null, 2).replaceAll("`", "\\u0060")}\n\`\`\`\n`
    : ""
  const extensions: Record<string, string> = { javascript: "js", js: "js", typescript: "ts", ts: "ts", jsx: "jsx", tsx: "tsx", python: "py", py: "py", json: "json", css: "css", sql: "sql", bash: "sh", yaml: "yaml", markdown: "md", html: "html.txt", svg: "svg.txt", xml: "xml.txt" }
  const language = content.kind === "code" ? content.language.toLowerCase() : ""
  const extension = content.kind === "markdown" ? "md" : content.kind === "table" ? "csv" : content.kind === "chart" || content.kind === "diagram" || content.kind === "media" ? "json" : Object.hasOwn(extensions, language) ? extensions[language] : "txt"
  // ASCII basename, no path/control characters, no hidden files or reserved device names.
  let base = version.title.normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "artifact"
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(base)) base = `artifact-${base}`
  return { artifactId: record.id, version: version.version, filename: `${base}-v${version.version}.${extension}`,
    mime: content.kind === "table" ? "text/csv;charset=utf-8" : content.kind === "chart" || content.kind === "diagram" || content.kind === "media" ? "application/json;charset=utf-8" : "text/plain;charset=utf-8",
    text: content.kind === "table" ? csv(content) : content.kind === "chart" || content.kind === "diagram" || content.kind === "media" ? JSON.stringify(content, null, 2) : content.text + sourceAppendix,
    provenance: "preview", privateOrigin: record.privateOrigin === true, execution: "not-wired" }
}

/** Synchronous validate-and-commit turns prevent competing stale writes. Memory-only preview. */
export function createArtifactPreviewClient(options: {
  getSnapshot: () => ArtifactPreviewState
  setArtifacts: (artifacts: ArtifactRecord[]) => void
  now?: () => string
  newId?: () => string
}): ArtifactClient {
  const now = options.now ?? (() => new Date().toISOString())
  const newId = options.newId ?? (() => crypto.randomUUID())
  const snapshot = () => structuredClone(options.getSnapshot())
  function find(state: ArtifactPreviewState, id: string, revision?: number) {
    const record = state.artifacts.find(item => item.id === id)
    if (!record) throw new Error("Artifact not found.")
    if (revision !== undefined && record.revision !== revision) throw new Error("This artifact changed. Reload before saving.")
    return record
  }
  function checked(state: ArtifactPreviewState, id: string, revision: number) {
    if (!Number.isSafeInteger(revision) || revision < 1) throw new Error("Provide the current artifact revision.")
    return find(state, id, revision)
  }
  function editable(state: ArtifactPreviewState, record: ArtifactRecord) {
    if (record.archivedAt) throw new Error("Restore the artifact before editing it.")
    if (resolveArtifactView(state, record).availability !== "available") throw new Error("Restore an available, unchanged source before editing this artifact.")
  }
  function taskLink(state: ArtifactPreviewState, taskId?: string, sessionId?: string): ArtifactRecord["task"] {
    if (!taskId) return null
    const task = state.tasks.find(item => item.id === taskId && !item.archivedAt)
    if (!task || !state.sessions.some(session => session.id === task.sessionId && !session.archived)) throw new Error("Choose an existing task in an active conversation.")
    if (sessionId && task.sessionId !== sessionId) throw new Error("The task must belong to the artifact's source conversation.")
    return { taskId, originSessionId: task.sessionId }
  }
  function commit(state: ArtifactPreviewState, record: ArtifactRecord) {
    options.setArtifacts(structuredClone(state.artifacts))
    return resolveArtifactView(state, record)
  }
  function create(state: ArtifactPreviewState, title: string, content: ArtifactContent, task: ArtifactRecord["task"], source: ArtifactRecord["source"] = null, sourceText: string | null = null, citations: ConversationCitation[] = []) {
    if (state.artifacts.length >= 500) throw new Error("This preview supports up to 500 artifacts.")
    content = checkedContent(content)
    const id = `artifact_${newId()}`, at = now()
    if (state.artifacts.some(item => item.id === id)) throw new Error("Artifact identity collision. Retry creation.")
    const record: ArtifactRecord = { id, title, revision: 1, createdAt: at, updatedAt: at, archivedAt: null, provenance: "preview", origin: source ? "conversation-copy" : "owner-authored", source, sourceTextAtCreation: sourceText, task,
      versions: [{ version: 1, title, content, createdAt: at, note: source ? "Explicit copy of a completed response." : "Created by owner.", author: source ? "source-copy" : "owner", ...(citations.length ? { citations } : {}) }] }
    state.artifacts.push(record)
    return commit(state, record)
  }
  function append(state: ArtifactPreviewState, record: ArtifactRecord, content: ArtifactContent, title: string, note: string, restoredFromVersion?: number, citations: ConversationCitation[] = []) {
    editable(state, record)
    content = checkedContent(content)
    if (record.versions.length >= 100 || JSON.stringify(record.versions).length + JSON.stringify(content).length + JSON.stringify(citations).length > 4_000_000) throw new Error("Artifact history reached its preview limit. Export the retained versions.")
    const at = now()
    record.versions.push({ version: record.versions.at(-1)!.version + 1, title, content, note, createdAt: at, author: "owner", ...(restoredFromVersion === undefined ? {} : { restoredFromVersion }), ...(citations.length ? { citations: structuredClone(citations) } : {}) })
    record.title = title; record.revision++; record.updatedAt = at
    return commit(state, record)
  }
  return {
    mode: "preview",
    async list() { const state = snapshot(); return state.artifacts.map(record => resolveArtifactView(state, record)) },
    async get(id) { const state = snapshot(); return resolveArtifactView(state, find(state, id)) },
    async create(input) { const value = parse(ownerSchema, input), state = snapshot(); return create(state, value.title, value.content, taskLink(state, value.taskId)) },
    async createFromMessage(input) {
      const value = parse(messageSchema, input), state = snapshot()
      const session = state.sessions.find(item => item.id === value.sessionId)
      const message = state.messages.find(item => item.sessionId === value.sessionId && item.id === value.messageId)
      if (!session || session.archived || !message || message.redacted || message.role !== "assistant" || message.status !== "complete") throw new Error("Choose a completed, unredacted assistant response in an active conversation.")
      if (!session.privacy || typeof session.privacy.memoryDisabled !== "boolean" || typeof session.privacy.harnessDisabled !== "boolean") throw new Error("Source privacy is unavailable. No artifact was copied.")
      const content = parse(contentSchema, { kind: "markdown", text: message.text })
      return create(state, value.title, content, taskLink(state, value.taskId, value.sessionId), { sessionId: value.sessionId, messageId: value.messageId }, message.text, sourceCitations(message.citations))
    },
    async appendVersion(id, input, revision) {
      const value = parse(versionSchema, input), state = snapshot(), record = checked(state, id, revision)
      const citations = value.content.kind === "markdown" && value.preserveCitations !== false ? record.versions.at(-1)?.citations ?? [] : []
      return append(state, record, value.content, value.title ?? record.title, value.note ?? "Edited by owner.", undefined, citations)
    },
    async restore(id, version, revision) {
      const state = snapshot(), record = checked(state, id, revision)
      if (!Number.isSafeInteger(version)) throw new Error("Choose an existing artifact version.")
      const previous = record.versions.find(item => item.version === version)
      if (!previous) throw new Error("Choose an existing artifact version.")
      return append(state, record, structuredClone(previous.content), previous.title, `Restored version ${version} as a new version.`, version, previous.citations)
    },
    async archive(id, archived, revision) {
      const state = snapshot(), record = checked(state, id, revision)
      if (typeof archived !== "boolean") throw new Error("Choose archive or restore explicitly.")
      if (!!record.archivedAt === archived) return resolveArtifactView(state, record)
      record.archivedAt = archived ? now() : null; record.updatedAt = now(); record.revision++
      return commit(state, record)
    },
    async export(id, version) {
      const state = snapshot(), record = resolveArtifactView(state, find(state, id))
      if (!readable(record.availability)) throw new Error("The artifact source is unavailable, redacted, changed, or has unknown privacy. Export is blocked.")
      if (version !== undefined && !Number.isSafeInteger(version)) throw new Error("Choose an existing artifact version.")
      const selected = version === undefined ? record.versions.at(-1) : record.versions.find(item => item.version === version)
      if (!selected) throw new Error("Choose an existing artifact version.")
      return exportVersion(record, selected)
    },
  }
}
