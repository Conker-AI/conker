import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError, gatewayError } from './transport'

const reference = z.string().min(1).max(200).refine(value => value.trim() === value)
const teamId = z.string().regex(/^team_[0-9a-f]{32}$/)
const agentId = z.string().regex(/^(?:companion|agent_[0-9a-f]{32})$/)
const roleId = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/)
const budget = z.object({ maxTurns: z.number().int().min(1).max(200), maxTokens: z.number().int().min(1).max(1_000_000), maxCostCents: z.number().int().min(0).max(1_000_000) }).strict()
const memory = z.object({ scope: z.enum(['none', 'conversation', 'selected']), memoryIds: z.array(reference).max(100) }).strict().superRefine((value, context) => {
  if ((value.scope === 'selected') !== Boolean(value.memoryIds.length)) context.addIssue({ code: 'custom', message: 'Selected memory requires record IDs.' })
  if (new Set(value.memoryIds).size !== value.memoryIds.length) context.addIssue({ code: 'custom', message: 'Memory IDs must be unique.' })
})
const role = z.object({
  id: roleId, name: z.string().trim().min(1).max(80), agentId, instructions: z.string().trim().min(1).max(8000),
  toolIds: z.array(reference).max(100), memory,
  context: z.object({ mode: z.enum(['task_only', 'selected']), sourceIds: z.array(reference).max(100) }).strict().superRefine((value, context) => {
    if ((value.mode === 'selected') !== Boolean(value.sourceIds.length)) context.addIssue({ code: 'custom', message: 'Selected context requires source IDs.' })
  }),
  budget,
}).strict()
const handoff = z.object({
  id: roleId, fromRoleId: roleId, toRoleId: roleId, condition: z.string().trim().min(1).max(1000),
  payload: z.enum(['result_only', 'result_and_citations']), maxTransfers: z.number().int().min(1).max(100),
}).strict()
export const teamDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(80), objective: z.string().trim().min(1).max(2000),
  roles: z.array(role).min(1).max(12), handoffs: z.array(handoff).max(30),
  budget: budget.extend({ maxHandoffs: z.number().int().min(0).max(100) }).strict(),
}).strict()
const summary = z.object({
  schemaVersion: z.literal(1), id: teamId, revision: z.number().int().positive(), name: z.string().min(1).max(80),
  archived_at: z.number().finite().nonnegative().nullable(), created_at: z.number().finite().nonnegative(), updated_at: z.number().finite().nonnegative(),
  authority: z.literal('none'), execution: z.literal('configuration-only'), contentIncluded: z.literal(false),
  reference_validation: z.literal('external-references-unverified'),
}).strict()
const view = summary.omit({ contentIncluded: true }).extend({
  contentIncluded: z.literal(true), definition: teamDefinitionSchema,
  agentReferences: z.array(z.object({ roleId, agentId, revision: z.number().int().positive() }).strict()).max(12),
  agentReferenceState: z.enum(['available', 'unavailable', 'selection-conflict']),
}).strict()
const revision = summary.omit({ contentIncluded: true }).extend({ contentIncluded: z.literal(true), definition: teamDefinitionSchema, historical: z.literal(true) }).strict()
const collection = z.object({ schemaVersion: z.literal(1), results: z.array(summary).max(100), nextCursor: teamId.nullable() }).strict()
const history = z.object({ schemaVersion: z.literal(1), results: z.array(summary).max(100), nextRevision: z.number().int().positive().nullable() }).strict()

export type GatewayTeamDefinition = z.infer<typeof teamDefinitionSchema>
export type GatewayTeamSummary = z.infer<typeof summary>
export type GatewayTeam = z.infer<typeof view>
export type GatewayTeamRevision = z.infer<typeof revision>

function parse<T>(schema: z.ZodType<T>, value: unknown, input = false): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new GatewayError(input ? 'validation' : 'invalid-response')
  return result.data
}
export class GatewayTeamMutationError extends Error {
  readonly outcome: 'conflict' | 'rejected' | 'unknown'
  constructor(error: unknown) {
    const failure = gatewayError(error), conflict = failure.status === 409
    const rejected = ['configuration', 'validation', 'browser-expired', 'upstream-denied', 'verification-cancelled', 'verification-required'].includes(failure.kind) ||
      failure.status !== undefined && [400, 401, 403, 404, 413, 422, 428, 429].includes(failure.status)
    super(conflict ? 'The team changed elsewhere. Reload it before saving.' : rejected ? failure.message : 'The team update may have been accepted. Reload before deciding whether to try again.')
    this.name = 'GatewayTeamMutationError'; this.outcome = conflict ? 'conflict' : rejected ? 'rejected' : 'unknown'
  }
}

export function createGatewayTeamsClient(auth: Pick<GatewayAuthClient, 'request'>) {
  const base = '/api/control/pi/collaboration/teams'
  const mutate = async (path: string, body: Record<string, unknown>, signal?: AbortSignal) => {
    try { return parse(view, await auth.request(path, { method: 'POST', body, signal })) }
    catch (error) { throw error instanceof GatewayError && error.kind === 'invalid-response' ? error : new GatewayTeamMutationError(error) }
  }
  return {
    async list(options: { limit?: number; cursor?: string; signal?: AbortSignal } = {}) {
      const query: Record<string, string | number> = { limit: parse(z.number().int().min(1).max(100), options.limit ?? 100, true) }
      if (options.cursor) query.cursor = parse(teamId, options.cursor, true)
      return parse(collection, await auth.request(base, { query, signal: options.signal }))
    },
    async get(id: string, signal?: AbortSignal): Promise<GatewayTeam> {
      const selected = parse(teamId, id, true), value = parse(view, await auth.request(`${base}/${selected}`, { signal }))
      if (value.id !== selected) throw new GatewayError('invalid-response')
      return value
    },
    async create(definition: GatewayTeamDefinition, signal?: AbortSignal) { return mutate(base, parse(teamDefinitionSchema, definition, true), signal) },
    async update(id: string, definition: GatewayTeamDefinition, expectedRevision: number, signal?: AbortSignal) {
      const selected = parse(teamId, id, true)
      return mutate(`${base}/${selected}/update`, { expected_revision: parse(z.number().int().positive(), expectedRevision, true), definition: parse(teamDefinitionSchema, definition, true) }, signal)
    },
    async setArchived(id: string, archived: boolean, expectedRevision: number, signal?: AbortSignal) {
      const selected = parse(teamId, id, true), expected_revision = parse(z.number().int().positive(), expectedRevision, true)
      return mutate(`${base}/${selected}/${archived ? 'archive' : 'restore'}`, archived ? { expected_revision, archived: true } : { expected_revision }, signal)
    },
    async history(id: string, signal?: AbortSignal) {
      const selected = parse(teamId, id, true)
      return parse(history, await auth.request(`${base}/${selected}/versions`, { query: { limit: 100, after: 0 }, signal }))
    },
    async revision(id: string, number: number, signal?: AbortSignal): Promise<GatewayTeamRevision> {
      const selected = parse(teamId, id, true), selectedRevision = parse(z.number().int().positive(), number, true)
      const value = parse(revision, await auth.request(`${base}/${selected}/versions/${selectedRevision}`, { signal }))
      if (value.id !== selected || value.revision !== selectedRevision) throw new GatewayError('invalid-response')
      return value
    },
  }
}

export type GatewayTeamsClient = ReturnType<typeof createGatewayTeamsClient>
