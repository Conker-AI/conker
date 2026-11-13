import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

const sessionId = z.string().regex(/^ses_[0-9a-f]{16}$/)
const revision = z.number().int().nonnegative()

const chatName = z.object({
  revision,
  title: z.string(),
  source: z.enum(['owner', 'auto']).nullable(),
  modelId: z.string().nullable(),
}).strict()

const outputFormat = z.enum(['auto', 'text', 'list', 'table', 'document', 'code', 'json'])
const outputLength = z.enum(['auto', 'short', 'medium', 'long'])
const outputLevel = z.enum(['auto', 'strict', 'plain', 'normal', 'deep'])
const language = z.string().max(35).regex(/^(auto|[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3})$/)

const chatOutput = z.object({
  revision,
  output: z.object({
    format: outputFormat,
    length: outputLength,
    language: language,
    // An older Pi does not send it; missing reads as auto.
    level: outputLevel.optional(),
  }).strict(),
}).strict()

const archiveResult = z.object({ sessions: z.array(sessionId).min(1).max(100), archived: z.boolean() }).strict()
const trashResult = z.object({ sessions: z.array(sessionId).min(1).max(100), trashed: z.boolean() }).strict()

function parse<T>(schema: z.ZodType<T>, value: unknown, input = false): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new GatewayError(input ? 'validation' : 'invalid-response')
  return result.data
}

/** A chat's name (rename, name automatically) and its output settings. */
export function createChatNamesClient(auth: Pick<GatewayAuthClient, 'request'>) {
  const path = (sid: string) => `/api/control/pi/sessions/${parse(sessionId, sid, true)}`

  return {
    async title(sessionId: string, signal?: AbortSignal) {
      return parse(chatName, await auth.request(`${path(sessionId)}/title`, { signal }))
    },

    async rename(sessionId: string, title: string, expectedRevision: number) {
      const trimmed = title.trim()
      const length = [...trimmed].length
      if (length < 1 || length > 60 || [...trimmed].some(character => { const code = character.charCodeAt(0); return code < 32 || code === 127 })) {
        throw new GatewayError('validation')
      }
      return parse(chatName, await auth.request(`${path(sessionId)}/title`, {
        method: 'POST',
        body: { expected_revision: parse(revision, expectedRevision, true), title: trimmed },
      }))
    },

    async autoName(sessionId: string, expectedRevision: number) {
      return parse(chatName, await auth.request(`${path(sessionId)}/title/auto`, {
        method: 'POST',
        body: { expected_revision: parse(revision, expectedRevision, true) },
      }))
    },

    /** Archive or restore up to 100 chats at once; one missing chat changes nothing (404). */
    async archive(sessionIds: string[], archived: boolean) {
      const ids = parse(z.array(sessionId).min(1).max(100), [...new Set(sessionIds)], true)
      return parse(archiveResult, await auth.request('/api/control/pi/sessions/archive', {
        method: 'POST',
        body: { sessions: ids, archived: parse(z.boolean(), archived, true) },
      }))
    },

    /** Move up to 100 chats to or out of the Trash; one missing chat changes nothing (404). */
    async trash(sessionIds: string[], trashed: boolean) {
      const ids = parse(z.array(sessionId).min(1).max(100), [...new Set(sessionIds)], true)
      return parse(trashResult, await auth.request('/api/control/pi/sessions/trash', {
        method: 'POST',
        body: { sessions: ids, trashed: parse(z.boolean(), trashed, true) },
      }))
    },

    async output(sessionId: string, signal?: AbortSignal) {
      return parse(chatOutput, await auth.request(`${path(sessionId)}/output`, { signal }))
    },

    async saveOutput(sessionId: string, output: { format: OutputFormat; length: OutputLength; language: string; level?: ChatOutputLevel }, expectedRevision: number) {
      // `auto` is Pi's own default and an older Pi refuses unknown keys, so it is not sent.
      const sent = output.level && output.level !== 'auto' ? { ...output, level: output.level } : output
      const checked = parse(chatOutput.shape.output, {
        format: sent.format,
        length: sent.length,
        language: sent.language,
        ...(sent.level && sent.level !== 'auto' ? { level: sent.level } : {}),
      }, true)
      return parse(chatOutput, await auth.request(`${path(sessionId)}/output`, {
        method: 'POST',
        body: { expected_revision: parse(revision, expectedRevision, true), output: checked },
      }))
    },
  }
}

export type OutputFormat = z.infer<typeof outputFormat>
export type OutputLength = z.infer<typeof outputLength>
export type ChatOutputLevel = z.infer<typeof outputLevel>
export type ChatOutput = z.infer<typeof chatOutput>
