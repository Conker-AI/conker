import { z } from 'zod'
import { parseToolDraft, type ToolDefinition } from '../tool-workspace'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

const identity = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/)
const revision = z.number().int().positive().safe()
const summary = z.object({ id: identity, revision, updated_at: z.string().datetime({ offset: true }), name: z.string().min(1).max(100), kind: z.enum(['connector', 'workflow']) })
const page = z.object({ items: z.array(summary).max(100), next_after: identity.nullable() })
const saved = z.object({ id: identity, revision, updated_at: z.string().datetime({ offset: true }), document: z.unknown() })
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
    async list(after?: string, signal?: AbortSignal) {
      if (after && !identity.safeParse(after).success) throw new GatewayError('validation')
      return parse(page, await auth.request('/api/owner/editor-drafts', { query: { limit: 50, ...(after ? { after } : {}) }, signal }))
    },
    async get(id: string, signal?: AbortSignal) {
      return record(await auth.request(path(id), { signal }), id)
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
