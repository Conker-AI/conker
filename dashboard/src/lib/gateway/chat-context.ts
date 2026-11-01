import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

const sessionIdPattern = /^ses_[0-9a-f]{16}$/
const messageIdPattern = /^msg_[0-9a-f]{16}$/
const itemIdPattern = /^(?:dec|thr)_[0-9a-f]{16}$/
// Every control character except a line feed (tab, carriage return and backspace are refused too).
const hasControlCharacter = (text: string) => [...text].some(char => { const code = char.charCodeAt(0); return (code < 32 && code !== 10) || code === 127 })
const messageRules = ['keep-exact', 'allow-summary', 'retrieve', 'exclude'] as const

/** Pi's Policy: already camelCase on the wire. */
const policySchema = z.object({
  sessionInstructions: z.string().max(16000),
  messagePolicies: z.record(z.string().min(1).max(200), z.enum(messageRules)),
  budget: z.object({
    contextWindowTokens: z.number().int().min(2).max(10_000_000),
    outputReserveTokens: z.number().int().min(1),
    otherInputTokens: z.number().int().min(0),
  }).strict().refine(budget => budget.outputReserveTokens < budget.contextWindowTokens),
}).strict()

const revisionSchema = z.number().int().min(0)
const settingsSchema = z.object({ revision: revisionSchema, policy: policySchema.nullable() }).strict()
const savedSchema = z.object({ revision: revisionSchema, policy: policySchema }).strict()

/** Pi's item: snake_case timestamps on the wire. */
const itemSchema = z.object({
  id: z.string().regex(itemIdPattern),
  kind: z.enum(['decision', 'thread']),
  text: z.string(),
  author: z.enum(['owner', 'ai']),
  cites: z.array(z.string()),
  state: z.enum(['active', 'open', 'resolved', 'withdrawn', 'superseded']),
  replaces: z.string().nullable(),
  created_at: z.number(),
  updated_at: z.number(),
}).strict()
const itemsSchema = z.object({ revision: revisionSchema, items: z.array(itemSchema) }).strict()
const addedSchema = z.object({ revision: revisionSchema, item: itemSchema }).strict()
const stateSchema = z.object({ revision: revisionSchema }).strict()

export type ContextPolicy = z.infer<typeof policySchema>
export type ChatContextSettings = { revision: number; policy: ContextPolicy | null }
export type ContextItem = {
  id: string
  kind: 'decision' | 'thread'
  text: string
  author: 'owner' | 'ai'
  cites: string[]
  state: 'active' | 'open' | 'resolved' | 'withdrawn' | 'superseded'
  replaces: string | null
  createdAt: number
  updatedAt: number
}
export type ContextItems = { revision: number; items: ContextItem[] }
export type ContextItemState = 'active' | 'open' | 'resolved' | 'withdrawn'

function parse<T>(schema: z.ZodType<T>, value: unknown, input = false): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new GatewayError(input ? 'validation' : 'invalid-response')
  return result.data
}

function sessionPath(sessionId: string): string {
  if (!sessionIdPattern.test(sessionId)) throw new GatewayError('validation')
  return `/api/control/pi/context/${sessionId}`
}

function itemId(id: string): string {
  if (!itemIdPattern.test(id)) throw new GatewayError('validation')
  return id
}

function toItem(item: z.infer<typeof itemSchema>): ContextItem {
  const { created_at: createdAt, updated_at: updatedAt, ...rest } = item
  return { ...rest, createdAt, updatedAt }
}

/** One chat's context settings (instructions, budget, message rules) and its items (decisions, threads). */
export function createChatContextClient(auth: Pick<GatewayAuthClient, 'request'>) {
  return {
    async get(sessionId: string, signal?: AbortSignal): Promise<ChatContextSettings> {
      return parse(settingsSchema, await auth.request(sessionPath(sessionId), { signal }))
    },

    /** Replaces the whole policy. Refused before any request when a value is out of range. */
    async save(sessionId: string, policy: ContextPolicy, expectedRevision: number): Promise<ChatContextSettings> {
      const path = sessionPath(sessionId)
      const checked = parse(policySchema, policy, true)
      parse(revisionSchema, expectedRevision, true)
      if (Object.keys(checked.messagePolicies).length > 10_000) throw new GatewayError('validation')
      for (const messageId of Object.keys(checked.messagePolicies)) {
        if (!messageIdPattern.test(messageId)) throw new GatewayError('validation')
      }
      return parse(savedSchema, await auth.request(path, { method: 'POST', body: { expected_revision: expectedRevision, policy: checked } }))
    },

    async items(sessionId: string, signal?: AbortSignal): Promise<ContextItems> {
      const response = parse(itemsSchema, await auth.request(`${sessionPath(sessionId)}/items`, { signal }))
      return { revision: response.revision, items: response.items.map(toItem) }
    },

    /** The owner adds a decision or an open question; `replaces` (decisions only) supersedes an active decision. */
    async addItem(sessionId: string, input: { kind: 'decision' | 'thread'; text: string; replaces?: string }, expectedRevision: number): Promise<{ revision: number; item: ContextItem }> {
      const path = sessionPath(sessionId)
      parse(revisionSchema, expectedRevision, true)
      const text = input.text.trim()
      if (!text || [...text].length > 500 || hasControlCharacter(text)) throw new GatewayError('validation')
      if (input.kind !== 'decision' && input.kind !== 'thread') throw new GatewayError('validation')
      if (input.replaces !== undefined && (input.kind !== 'decision' || !itemIdPattern.test(input.replaces))) throw new GatewayError('validation')
      const body: Record<string, unknown> = { expected_revision: expectedRevision, kind: input.kind, text }
      if (input.replaces !== undefined) body.replaces = input.replaces
      const response = parse(addedSchema, await auth.request(`${path}/items`, { method: 'POST', body }))
      return { revision: response.revision, item: toItem(response.item) }
    },

    async setItemState(sessionId: string, id: string, state: ContextItemState, expectedRevision: number): Promise<{ revision: number }> {
      const path = `${sessionPath(sessionId)}/items/${itemId(id)}/state`
      parse(revisionSchema, expectedRevision, true)
      if (!['active', 'open', 'resolved', 'withdrawn'].includes(state)) throw new GatewayError('validation')
      return parse(stateSchema, await auth.request(path, { method: 'POST', body: { expected_revision: expectedRevision, state } }))
    },
  }
}

export type ChatContextClient = ReturnType<typeof createChatContextClient>
