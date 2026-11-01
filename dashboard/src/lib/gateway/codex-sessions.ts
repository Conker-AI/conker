import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

export const codexThreadId = z.string().length(36).regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/)
const cursor = z.string().min(1).max(8192).regex(/^[A-Za-z0-9_-]+$(?![\s\S])/)
const safeText = (maximum: number) => z.string().refine(value => [...value].length <= maximum && !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(value))
const timestamp = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const row = z.object({ id: codexThreadId, name: safeText(300).nullable(), preview: safeText(500), previewTruncated: z.boolean(), cwd: safeText(4096).min(1), createdAt: timestamp, updatedAt: timestamp, modelProvider: safeText(200).min(1), source: z.enum(['cli', 'vscode', 'exec', 'appServer', 'subAgent', 'custom', 'unknown']) }).strict()
const envelope = { schemaVersion: z.literal(1), provider: z.literal('codex'), scope: z.literal('saved_threads'), runtimeVisibility: z.literal('observer_only') }
const page = z.object({ ...envelope, archived: z.boolean(), results: z.array(row).max(50), nextCursor: cursor.nullable() }).strict().refine(value => new Set(value.results.map(thread => thread.id)).size === value.results.length)
const detail = z.object({ ...envelope, session: row }).strict()
export type CodexThread = z.infer<typeof row>
function parse<T>(schema: z.ZodType<T>, value: unknown, input = false) { const result = schema.safeParse(value); if (!result.success) throw new GatewayError(input ? 'validation' : 'invalid-response'); return result.data }
export function codexResumeCommand(id: string) { return `python scripts/conker.py native codex resume ${parse(codexThreadId, id, true)}` }
export function createCodexSessionsClient(auth: Pick<GatewayAuthClient, 'request'>) {
  return {
    async list(options: { archived: boolean; limit?: number; cursor?: string }, signal?: AbortSignal) {
      const archived = parse(z.boolean(), options.archived, true), limit = parse(z.number().int().min(1).max(50), options.limit ?? 25, true)
      const query = { archived, limit, ...(options.cursor === undefined ? {} : { cursor: parse(cursor, options.cursor, true) }) }
      const value = parse(page, await auth.request('/api/host/codex/sessions', { query, signal }))
      if (value.archived !== archived || value.results.length > limit) throw new GatewayError('invalid-response')
      return value
    },
    async get(value: string, signal?: AbortSignal) {
      const id = parse(codexThreadId, value, true), result = parse(detail, await auth.request(`/api/host/codex/sessions/${id}`, { signal })).session
      if (result.id !== id) throw new GatewayError('invalid-response')
      return result
    },
  }
}
export type CodexSessionsClient = ReturnType<typeof createCodexSessionsClient>
