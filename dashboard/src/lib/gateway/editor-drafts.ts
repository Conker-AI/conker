import { z } from 'zod'
import { parseToolDraft, type ToolDefinition } from '../tool-workspace'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

const identity = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/)
const revision = z.number().int().positive().safe()
const summary = z.object({ id: identity, revision, updated_at: z.string().datetime({ offset: true }), name: z.string().min(1).max(100), kind: z.enum(['connector', 'workflow']) })
const page = z.object({ items: z.array(summary).max(100), next_after: identity.nullable() })
const saved = z.object({ id: identity, revision, updated_at: z.string().datetime({ offset: true }), document: z.unknown() })
const publication = z.object({ draft_id: identity, revision, automation_id: z.string().regex(/^editor-[a-f0-9]{32}$/), version: revision, digest: z.string().regex(/^[a-f0-9]{64}$/), published_at: z.string().datetime({ offset: true }) })
const publicationHistory = z.object({ items: z.array(publication.extend({ authorization: z.enum(['auto', 'owner_confirmation']), available: z.boolean() })).max(100) })
const capability = z.object({ id: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,79}$/), name: z.string().max(160), description: z.string().max(800), version: revision, authorization: z.string().max(40), inputs: z.array(z.object({ name: z.string().max(200), type: z.string().max(40), required: z.boolean(), description: z.string().max(500) })).max(100) })
const catalogue = z.object({ items: z.array(capability).max(100), next_after: z.string().max(80).nullable() })
const access = z.object({ actor_id: z.string().max(100), actor_name: z.string().max(160), automation_id: z.string().max(80), enabled: z.boolean(), required_scopes: z.array(z.string().max(100)).max(500) })
const outcome = z.object({ code: z.string().max(80), action_id: z.string().regex(/^editor_[a-f0-9]{32}$/), message: z.string().max(2000).optional(), request_id: z.string().max(100).optional(), result: z.unknown().optional(), steps: z.array(z.object({ nodeId: z.string().max(64), label: z.string().max(100), type: z.string().max(40), status: z.enum(['completed', 'failed', 'skipped']), output: z.unknown().optional(), error: z.string().max(2000).optional() })).max(60).optional() })
const runHistory = z.object({ items: z.array(z.object({ action_id: z.string().max(100), version: revision, digest: z.string().regex(/^[a-f0-9]{64}$/), created_at: z.string().datetime({ offset: true }), args: z.record(z.string(), z.unknown()), response: outcome })).max(30) })
export type EditorRun = z.infer<typeof runHistory>['items'][number]
export type EditorCapability = z.infer<typeof capability>
export type EditorDraft = { id: string; revision: number; updated_at: string; document: ToolDefinition }
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new GatewayError('invalid-response')
  return result.data
}
function path(id: string) {
  if (!identity.safeParse(id).success) throw new GatewayError('validation')
  return `/api/owner/editor-drafts/${id}`
}
function record(value: unknown, expectedId: string): EditorDraft {
  const result = parse(saved, value)
  let document: ToolDefinition
  try { document = parseToolDraft(JSON.stringify(result.document)) }
  catch { throw new GatewayError('invalid-response') }
  if (result.id !== expectedId || document.id !== expectedId) throw new GatewayError('invalid-response')
  return { ...result, document }
}
export function createGatewayEditorDrafts(auth: Pick<GatewayAuthClient, 'request'>) {
  return {
    async capabilities(kind: 'tool' | 'workflow', q = '', after?: string, signal?: AbortSignal) {
      return parse(catalogue, await auth.request('/api/owner/editor-capabilities', { query: { kind, q, limit: 50, ...(after ? { after } : {}) }, signal }))
    },
    async access(id: string, version: number, digest: string, signal?: AbortSignal) {
      return parse(access, await auth.request(`${path(id)}/access`, { query: { version, digest }, signal }))
    },
    async setAccess(id: string, version: number, digest: string, enabled: boolean, signal?: AbortSignal) {
      return parse(access, await auth.request(`${path(id)}/access`, { method: 'POST', body: { version, digest, enabled }, signal }))
    },
    async runs(id: string, signal?: AbortSignal) {
      return parse(runHistory, await auth.request(`${path(id)}/runs`, { signal })).items
    },
    async run(id: string, body: { version: number; digest: string; action_id: string; args: Record<string, unknown>; approval_request_id?: string }, signal?: AbortSignal) {
      const result = parse(outcome, await auth.request(`${path(id)}/runs`, { method: 'POST', body, signal }))
      if (result.action_id !== body.action_id) throw new GatewayError('invalid-response')
      return result
    },
    async list(after?: string, signal?: AbortSignal) {
      if (after && !identity.safeParse(after).success) throw new GatewayError('validation')
      return parse(page, await auth.request('/api/owner/editor-drafts', { query: { limit: 50, ...(after ? { after } : {}) }, signal }))
    },
    async get(id: string, signal?: AbortSignal) {
      return record(await auth.request(path(id), { signal }), id)
    },
    async publications(id: string, signal?: AbortSignal) {
      const result = parse(publicationHistory, await auth.request(`${path(id)}/publications`, { signal }))
      if (result.items.some(item => item.draft_id !== id)) throw new GatewayError('invalid-response')
      return result.items
    },
    async publish(id: string, expectedRevision: number, previousVersion: number, authorization: 'auto' | 'owner_confirmation', signal?: AbortSignal) {
      if (!revision.safeParse(expectedRevision).success || !Number.isSafeInteger(previousVersion) || previousVersion < 0) throw new GatewayError('validation')
      const result = parse(publication, await auth.request(`${path(id)}/publish`, { method: 'POST', body: { expected_revision: expectedRevision, expected_publication_version: previousVersion, authorization }, signal }))
      if (result.draft_id !== id || result.revision !== expectedRevision) throw new GatewayError('invalid-response')
      return result
    },
    async save(document: ToolDefinition, expectedRevision: number, signal?: AbortSignal) {
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new GatewayError('validation')
      let checked: ToolDefinition
      try { checked = parseToolDraft(JSON.stringify(document)) }
      catch { throw new GatewayError('validation') }
      const value = record(await auth.request(path(checked.id), { method: 'POST', body: { expected_revision: expectedRevision, document: checked }, signal }), checked.id)
      if (value.revision !== expectedRevision + 1) throw new GatewayError('invalid-response')
      return value
    },
  }
}
export type GatewayEditorDrafts = ReturnType<typeof createGatewayEditorDrafts>
