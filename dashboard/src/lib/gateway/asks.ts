import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

const askId = z.string().regex(/^ask_[0-9a-f]{32}$/)
/** One of Conker's questions; the options are the AI's words, the answer goes to that chat. */
const ask = z.object({
  id: askId, sessionId: z.string().min(1).max(128), chatTitle: z.string().max(500), question: z.string().min(1).max(500),
  options: z.array(z.string().min(1).max(60)).min(2).max(4), state: z.enum(['open', 'answered', 'dismissed']),
  answer: z.string().max(4000).nullable(), chosen: z.boolean().nullable(),
  createdAt: z.number().nonnegative(), answeredAt: z.number().nonnegative().nullable(),
}).strict()
const collection = z.object({ schemaVersion: z.literal(1), results: z.array(ask).max(50) }).strict()

export type ConkerAsk = z.infer<typeof ask>

function parse<T>(schema: z.ZodType<T>, value: unknown, input = false): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new GatewayError(input ? 'validation' : 'invalid-response')
  return result.data
}

export function createAsksClient(auth: Pick<GatewayAuthClient, 'request'>) {
  const path = (id: string) => `/api/control/pi/asks/${parse(askId, id, true)}`
  return {
    async list(signal?: AbortSignal): Promise<ConkerAsk[]> {
      return parse(collection, await auth.request('/api/control/pi/asks', { signal })).results
    },
    /** Sends his answer to that chat as his next message. `chosen`: he tapped one of the options. */
    async answer(id: string, text: string, chosen: boolean): Promise<ConkerAsk> {
      const words = text.trim()
      if (!words || [...words].length > 4000) throw new GatewayError('validation')
      return parse(ask, await auth.request(`${path(id)}/answer`, { method: 'POST', body: { text: words, chosen } }))
    },
    /** No answer: nothing goes back to the chat. */
    async dismiss(id: string): Promise<ConkerAsk> {
      return parse(ask, await auth.request(`${path(id)}/dismiss`, { method: 'POST', body: {} }))
    },
  }
}

export type AsksClient = ReturnType<typeof createAsksClient>
