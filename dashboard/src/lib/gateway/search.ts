import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

export const searchSources = ['conversations', 'memory', 'projects', 'artifacts', 'tasks', 'jobs', 'agents', 'tools', 'activity'] as const
const source = z.enum(searchSources)
const config = z.object({ sources: z.array(source).max(9).refine(items => new Set(items).size === items.length), exactText: z.boolean(), semantic: z.boolean(), reranking: z.boolean() }).strict()
const settings = z.object({ revision: z.number().int().nonnegative(), configuration: config })
const capabilities = z.object({ sources: z.array(source).max(9), exactText: z.boolean(), semanticSources: z.array(source).max(9), reranking: z.boolean(), indexing: z.literal('source-owned'), scanLimit: z.number().int().positive() })
const href = z.string().max(1600).refine(value => /^\/(chat|memory|projects|artifacts|activity|jobs|agents|tools|settings)(?:[/?]|$)/.test(value) && !value.includes('\\') && !/[\r\n]/.test(value))
const result = z.object({ id: z.string().min(1).max(400), source, recordId: z.string().min(1).max(200), title: z.string().max(500), excerpt: z.string().max(500), href, matchType: z.enum(['metadata', 'text', 'semantic']), role: z.enum(['user', 'assistant']).nullable() })
const page = z.object({ results: z.array(result).max(50), stage: z.enum(['metadata', 'text', 'semantic']), nextCursor: z.string().max(100).nullable(), coverage: z.array(z.object({ source, status: z.enum(['searched', 'partial', 'unavailable', 'degraded']) })).max(9), ranking: z.object({ status: z.enum(['disabled', 'ranked', 'unavailable', 'not_needed', 'fallback']), modelId: z.string().max(200).optional(), candidates: z.number().int().max(8).optional() }) })
export type SearchResult = z.infer<typeof result>
export type SearchPage = z.infer<typeof page>
export type SearchSettings = z.infer<typeof settings>
export type SearchCapabilities = z.infer<typeof capabilities>
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new GatewayError('invalid-response')
  return parsed.data
}

export function createGatewaySearchClient(auth: Pick<GatewayAuthClient, 'request'>) {
  return {
    async settings(signal?: AbortSignal) { return parse(settings, await auth.request('/api/control/pi/search/settings', { signal })) },
    async capabilities(signal?: AbortSignal) { return parse(capabilities, await auth.request('/api/control/pi/search/capabilities', { signal })) },
    async save(value: SearchSettings['configuration'], revision: number) {
      const body = { configuration: parse(config, value), expected_revision: parse(z.number().int().nonnegative(), revision) }
      const saved = parse(settings, await auth.request('/api/control/pi/search/settings', { method: 'POST', body }))
      if (saved.revision !== revision + 1) throw new GatewayError('invalid-response')
      return saved
    },
    async query(q: string, stage: SearchPage['stage'], signal?: AbortSignal, cursor?: string) {
      const query = { q: parse(z.string().trim().min(1).max(200), q), stage: parse(z.enum(['metadata', 'text', 'semantic']), stage), ...(cursor ? { cursor: parse(z.string().max(100), cursor) } : {}) }
      const result = parse(page, await auth.request('/api/control/pi/search', { query, signal }))
      if (result.stage !== stage) throw new GatewayError('invalid-response')
      return result
    },
  }
}
export type GatewaySearchClient = ReturnType<typeof createGatewaySearchClient>
