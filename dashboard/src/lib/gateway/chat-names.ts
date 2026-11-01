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
const language = z.string().max(35).regex(/^(auto|[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3})$/)

const chatOutput = z.object({
  revision,
  output: z.object({
    format: outputFormat,
    length: outputLength,
    language: language,
  }).strict(),
}).strict()

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

    async output(sessionId: string, signal?: AbortSignal) {
      return parse(chatOutput, await auth.request(`${path(sessionId)}/output`, { signal }))
    },

    async saveOutput(sessionId: string, output: { format: OutputFormat; length: OutputLength; language: string }, expectedRevision: number) {
      const checked = parse(chatOutput.shape.output, { format: output.format, length: output.length, language: output.language }, true)
      return parse(chatOutput, await auth.request(`${path(sessionId)}/output`, {
        method: 'POST',
        body: { expected_revision: parse(revision, expectedRevision, true), output: checked },
      }))
    },
  }
}

export type ChatNamesClient = ReturnType<typeof createChatNamesClient>
export type OutputFormat = z.infer<typeof outputFormat>
export type OutputLength = z.infer<typeof outputLength>
export type ChatName = z.infer<typeof chatName>
export type ChatOutput = z.infer<typeof chatOutput>
