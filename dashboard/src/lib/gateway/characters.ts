import { z } from 'zod'
import { characterSchema, validateCharacter, type CharacterDraft } from '@/lib/api/character'
import type { GatewayAuthClient } from './auth'
import { GatewayError, gatewayError } from './transport'

const revision = z.number().int().min(0).max(100)
const saved = z.object({ agentId: z.literal('companion'), revision, profile: characterSchema.nullable() }).strict()
const historyItem = z.object({
  revision: z.number().int().min(1).max(100), created_at: z.number().finite().nonnegative(),
  restored_from: z.number().int().min(1).max(100).nullable(),
}).strict()
const history = z.object({ results: z.array(historyItem).max(100) }).strict()
const imported = z.object({ profile: characterSchema, note: z.string().min(1).max(500) }).strict()
const exported = z.object({ format: z.literal('conker-character'), version: z.literal(1), character: characterSchema }).strict()

export type GatewayCharacter = z.infer<typeof saved>
export type GatewayCharacterHistory = z.infer<typeof history>['results']

function parse<T>(schema: z.ZodType<T>, value: unknown, input = false): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new GatewayError(input ? 'validation' : 'invalid-response')
  return result.data
}

export class GatewayCharacterMutationError extends Error {
  readonly outcome: 'conflict' | 'rejected' | 'unknown'
  constructor(error: unknown) {
    const failure = gatewayError(error)
    const conflict = failure.status === 409
    const rejected = ['configuration', 'validation', 'browser-expired', 'upstream-denied', 'verification-cancelled', 'verification-required'].includes(failure.kind) ||
      failure.status !== undefined && [400, 401, 403, 404, 413, 422, 428, 429].includes(failure.status)
    super(conflict ? 'The Companion changed elsewhere. Reload before saving this draft.' : rejected ? failure.message : 'The save outcome is uncertain. Reload the Companion before deciding whether to try again.')
    this.name = 'GatewayCharacterMutationError'
    this.outcome = conflict ? 'conflict' : rejected ? 'rejected' : 'unknown'
  }
}

export function createGatewayCharactersClient(auth: Pick<GatewayAuthClient, 'request'>) {
  const base = '/api/control/pi/characters/companion'
  async function mutate(path: string, body: Record<string, unknown>) {
    try { return parse(saved, await auth.request(path, { method: 'POST', body })) }
    catch (error) { throw error instanceof GatewayError && error.kind === 'invalid-response' ? error : new GatewayCharacterMutationError(error) }
  }
  return {
    async get(revision?: number, signal?: AbortSignal): Promise<GatewayCharacter> {
      const selected = revision === undefined ? undefined : parse(z.number().int().min(1).max(100), revision, true)
      const value = parse(saved, await auth.request(base, { query: selected ? { revision: selected } : undefined, signal }))
      if (selected !== undefined && value.revision !== selected) throw new GatewayError('invalid-response')
      return value
    },
    async history(signal?: AbortSignal): Promise<GatewayCharacterHistory> {
      const value = parse(history, await auth.request(`${base}/history`, { signal })).results
      if (value.some((item, index) => item.revision !== index + 1)) throw new GatewayError('invalid-response')
      return value
    },
    save(profile: CharacterDraft, expectedRevision: number): Promise<GatewayCharacter> {
      return mutate(`${base}/save`, { expected_revision: parse(revision, expectedRevision, true), profile: validateCharacter(profile) })
    },
    restore(selectedRevision: number, expectedRevision: number): Promise<GatewayCharacter> {
      return mutate(`${base}/restore`, {
        expected_revision: parse(z.number().int().min(1).max(100), expectedRevision, true),
        revision: parse(z.number().int().min(1).max(100), selectedRevision, true),
      })
    },
    async importDraft(text: string): Promise<z.infer<typeof imported>> {
      if (!text.length || new TextEncoder().encode(text).byteLength > 32 * 1024 * 1024) throw new GatewayError('validation')
      return parse(imported, await auth.request(`${base}/import`, { method: 'POST', body: { text } }))
    },
    async export(selectedRevision?: number, signal?: AbortSignal): Promise<z.infer<typeof exported>> {
      const selected = selectedRevision === undefined ? undefined : parse(z.number().int().min(1).max(100), selectedRevision, true)
      return parse(exported, await auth.request(`${base}/export`, { query: selected ? { revision: selected } : undefined, signal }))
    },
  }
}

export type GatewayCharactersClient = ReturnType<typeof createGatewayCharactersClient>
