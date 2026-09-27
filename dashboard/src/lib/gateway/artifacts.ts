import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError, gatewayError } from './transport'

const artifactId = z.string().regex(/^artifact_[0-9a-f]{32}$/)
const sessionId = z.string().regex(/^ses_[0-9a-f]{16}$/)
const messageId = z.string().regex(/^msg_[0-9a-f]{16}$/)
const taskId = z.string().regex(/^tsk_[0-9a-f]{32}$/)
const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const title = z.string().trim().min(1).max(160)
const nodeId = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/)
const htmlContent = z.object({ kind: z.literal('html'), text: z.string().max(200_000) }).strict()
const markdownContent = z.object({ kind: z.literal('markdown'), text: z.string().max(200_000) }).strict()
const codeContent = z.object({ kind: z.literal('code'), text: z.string().max(200_000), language: z.string().trim().max(40).regex(/^[A-Za-z0-9+#._-]*$/) }).strict()
const mediaContent = z.object({
  kind: z.literal('media'), mediaType: z.enum(['image', 'audio', 'video']),
  url: z.string().max(2048).refine(value => {
    if (value === '') return true
    try {
      const url = new URL(value)
      return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password && !value.includes('\\') && ![...value].some(character => {
        const code = character.charCodeAt(0)
        return code < 33 || code === 127
      })
    } catch { return false }
  }, 'Media references must be credential-free HTTPS URLs.'),
  description: z.string().max(2000),
}).strict()
const tableContent = z.object({ kind: z.literal('table'), columns: z.array(z.string().max(1000)).min(1).max(32), rows: z.array(z.array(z.string().max(10000)).max(32)).max(1000) }).strict()
  .refine(value => value.rows.every(row => row.length === value.columns.length), 'Every table row must match the columns.')
const diagramContent = z.object({
  kind: z.literal('diagram'),
  nodes: z.array(z.object({ id: nodeId, label: z.string().trim().min(1).max(200), description: z.string().max(2000).optional(), x: z.number().finite().min(-10000).max(10000), y: z.number().finite().min(-10000).max(10000) }).strict()).max(100),
  edges: z.array(z.object({ id: nodeId, source: nodeId, target: nodeId, label: z.string().max(200).optional() }).strict()).max(200),
}).strict().refine(value => {
  const nodes = new Set(value.nodes.map(item => item.id)), edges = new Set(value.edges.map(item => item.id))
  return nodes.size === value.nodes.length && edges.size === value.edges.length && value.edges.every(item => nodes.has(item.source) && nodes.has(item.target) && item.source !== item.target)
}, 'Diagram identities and connections are invalid.')
const chartContent = z.object({
  kind: z.literal('chart'), chartType: z.enum(['bar', 'line', 'area']), xLabel: z.string().max(1000),
  series: z.array(z.object({ label: z.string().min(1).max(200) }).strict()).min(1).max(8),
  rows: z.array(z.object({ label: z.string().max(1000), values: z.array(z.number().finite()).min(1).max(8) }).strict()).max(500),
}).strict().refine(value => new Set(value.series.map(item => item.label)).size === value.series.length && value.rows.every(item => item.values.length === value.series.length), 'Chart rows must match distinct series.')
export const artifactContent = z.discriminatedUnion('kind', [htmlContent, markdownContent, codeContent, mediaContent, tableContent, diagramContent, chartContent])
  .refine(value => JSON.stringify(value).length <= 250_000, 'Artifact content is too large.')
export type GatewayArtifactContent = z.infer<typeof artifactContent>

const privacy = z.object({ memoryDisabled: z.boolean(), harnessDisabled: z.boolean(), incognito: z.boolean() }).strict()
const source = z.object({ sessionId, messageId }).strict()
const task = z.object({ taskId, originSessionId: sessionId }).strict()
const availability = z.enum(['available', 'source-archived', 'source-redacted', 'source-unavailable', 'source-changed', 'privacy-unknown'])
const taskAvailability = z.enum(['none', 'available', 'archived', 'unavailable', 'origin-changed'])
const citation = z.object({ id: z.string().min(1).max(200), label: z.string().min(1).max(500), href: z.string().max(2048).nullable().optional(), excerpt: z.string().max(8000).nullable().optional() }).strict()
const version = z.object({
  version: z.number().int().min(1).max(100), title, content: artifactContent,
  createdAt: z.string().datetime({ offset: true }), author: z.enum(['source-copy', 'owner']), note: z.string().max(1000),
  restoredFromVersion: z.number().int().min(1).max(100).nullable().optional(), citations: z.array(citation).max(100).nullable().optional().transform(value => value ?? []),
}).strict()
const summaryBase = z.object({
  schemaVersion: z.literal(1), id: artifactId, title, revision,
  createdAt: z.string().datetime({ offset: true }), updatedAt: z.string().datetime({ offset: true }), archivedAt: z.string().datetime({ offset: true }).nullable(),
  provenance: z.literal('pi'), origin: z.enum(['conversation-copy', 'owner-authored']), source: source.nullable(), task: task.nullable(),
  availability, privacy: privacy.nullable(), privateOrigin: z.boolean().nullable(), taskAvailability,
  authority: z.literal('none'), execution: z.literal('not-wired'), versionCount: z.number().int().min(0).max(100), currentVersion: z.number().int().min(0).max(100),
}).strict()
const summary = summaryBase.extend({ contentIncluded: z.literal(false) }).strict()
const view = summaryBase.extend({ contentIncluded: z.boolean(), versions: z.array(version).max(100) }).strict()
  .refine(value => value.contentIncluded === (value.versions.length > 0) && value.currentVersion === (value.versions.at(-1)?.version ?? 0), 'Artifact version projection is inconsistent.')
const collection = z.object({ schemaVersion: z.literal(1), results: z.array(summary).max(100), nextCursor: artifactId.nullable() }).strict()
const nativeExport = z.object({
  schemaVersion: z.literal(1), artifactId, version: z.number().int().min(1).max(100), filename: z.string().min(1).max(110),
  mime: z.enum(['text/plain;charset=utf-8', 'text/csv;charset=utf-8', 'application/json;charset=utf-8']), text: z.string().max(400_000),
  provenance: z.literal('pi'), privateOrigin: z.boolean(), authority: z.literal('none'), contentIncluded: z.literal(true), execution: z.literal('not-wired'),
}).strict()

export type GatewayArtifactVersion = z.infer<typeof version>
export type GatewayArtifactSummary = z.infer<typeof summary>
export type GatewayArtifact = z.infer<typeof view>
export type GatewayArtifactExport = z.infer<typeof nativeExport>

function parse<T>(schema: z.ZodType<T>, value: unknown, input = false): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new GatewayError(input ? 'validation' : 'invalid-response')
  return result.data
}
export function normalizeGatewayArtifactContent(value: unknown): GatewayArtifactContent { return parse(artifactContent, value, true) }
export function emptyGatewayArtifactContent(kind: GatewayArtifactContent['kind']): GatewayArtifactContent {
  if (kind === 'markdown' || kind === 'html') return { kind, text: '' }
  if (kind === 'code') return { kind, text: '', language: 'text' }
  if (kind === 'media') return { kind, mediaType: 'image', url: '', description: '' }
  if (kind === 'table') return { kind, columns: ['Column 1', 'Column 2'], rows: [] }
  if (kind === 'diagram') return { kind, nodes: [], edges: [] }
  return { kind, chartType: 'bar', xLabel: '', series: [{ label: 'Series 1' }], rows: [] }
}

export class GatewayArtifactMutationError extends Error {
  readonly outcome: 'conflict' | 'rejected' | 'unknown'
  readonly status?: number
  constructor(error: unknown) {
    const failure = gatewayError(error), conflict = failure.status === 409
    const rejected = ['configuration', 'validation', 'browser-expired', 'upstream-denied', 'verification-cancelled', 'verification-required'].includes(failure.kind) ||
      failure.status !== undefined && [400, 401, 403, 404, 413, 422, 428, 429].includes(failure.status)
    super(conflict ? 'This artifact changed elsewhere. Reload its current revision before making another change.' : rejected ? failure.message : 'The change outcome is uncertain. Reload the artifact before deciding whether to try again.')
    this.name = 'GatewayArtifactMutationError'; this.outcome = conflict ? 'conflict' : rejected ? 'rejected' : 'unknown'; this.status = failure.status
  }
}

export function createGatewayArtifactsClient(auth: Pick<GatewayAuthClient, 'request'>) {
  const path = (id: string) => `/api/control/pi/artifacts/${parse(artifactId, id, true)}`
  async function write(target: string, body: Record<string, unknown>, expectedId?: string) {
    try {
      const saved = parse(view, await auth.request(target, { method: 'POST', body }))
      if (expectedId && saved.id !== expectedId) throw new GatewayError('invalid-response')
      return saved
    } catch (error) { throw error instanceof GatewayError && error.kind === 'invalid-response' ? error : new GatewayArtifactMutationError(error) }
  }
  return {
    async list(options: { limit?: number; cursor?: string; signal?: AbortSignal } = {}) {
      const limit = options.limit ?? 100
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new GatewayError('validation')
      const cursor = options.cursor === undefined ? undefined : parse(artifactId, options.cursor, true)
      const result = parse(collection, await auth.request('/api/control/pi/artifacts', { query: { limit, ...(cursor ? { cursor } : {}) }, signal: options.signal }))
      if (result.results.length > limit || new Set(result.results.map(item => item.id)).size !== result.results.length) throw new GatewayError('invalid-response')
      return result
    },
    async get(id: string, signal?: AbortSignal): Promise<GatewayArtifact> {
      const selected = parse(artifactId, id, true), result = parse(view, await auth.request(path(selected), { signal }))
      if (result.id !== selected) throw new GatewayError('invalid-response')
      return result
    },
    create(value: { title: string; content: GatewayArtifactContent; taskId?: string }): Promise<GatewayArtifact> {
      const body = { title: parse(title, value.title, true), content: parse(artifactContent, value.content, true), ...(value.taskId ? { taskId: parse(taskId, value.taskId, true) } : {}) }
      return write('/api/control/pi/artifacts', body)
    },
    copyFromMessage(value: { title: string; sessionId: string; messageId: string; taskId?: string }): Promise<GatewayArtifact> {
      const body = { title: parse(title, value.title, true), sessionId: parse(sessionId, value.sessionId, true), messageId: parse(messageId, value.messageId, true), ...(value.taskId ? { taskId: parse(taskId, value.taskId, true) } : {}) }
      return write('/api/control/pi/artifacts/from-message', body)
    },
    append(id: string, value: { content: GatewayArtifactContent; title?: string; note?: string; preserveCitations?: boolean }, expectedRevision: number): Promise<GatewayArtifact> {
      const selected = parse(artifactId, id, true), body = { expected_revision: parse(revision, expectedRevision, true), content: parse(artifactContent, value.content, true),
        ...(value.title !== undefined ? { title: parse(title, value.title, true) } : {}), ...(value.note !== undefined ? { note: parse(z.string().trim().max(1000), value.note, true) } : {}),
        ...(value.preserveCitations !== undefined ? { preserveCitations: parse(z.boolean(), value.preserveCitations, true) } : {}) }
      return write(`${path(selected)}/versions`, body, selected)
    },
    restore(id: string, selectedVersion: number, expectedRevision: number): Promise<GatewayArtifact> {
      const selected = parse(artifactId, id, true)
      return write(`${path(selected)}/restore`, { expected_revision: parse(revision, expectedRevision, true), version: parse(z.number().int().min(1).max(100), selectedVersion, true) }, selected)
    },
    archive(id: string, archived: boolean, expectedRevision: number): Promise<GatewayArtifact> {
      const selected = parse(artifactId, id, true)
      return write(`${path(selected)}/archive`, { expected_revision: parse(revision, expectedRevision, true), archived: parse(z.boolean(), archived, true) }, selected)
    },
    async export(id: string, selectedVersion?: number, signal?: AbortSignal): Promise<GatewayArtifactExport> {
      const selected = parse(artifactId, id, true), version = selectedVersion === undefined ? undefined : parse(z.number().int().min(1).max(100), selectedVersion, true)
      const result = parse(nativeExport, await auth.request(`${path(selected)}/export`, { query: { ...(version ? { version } : {}) }, signal }))
      if (result.artifactId !== selected || version !== undefined && result.version !== version) throw new GatewayError('invalid-response')
      return result
    },
  }
}

export type GatewayArtifactsClient = ReturnType<typeof createGatewayArtifactsClient>
