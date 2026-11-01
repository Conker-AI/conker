import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GATEWAY_IMPORT_LIMIT, GatewayRefusal, type GatewayRefusalCode } from './file-transfer'
import { GatewayError, gatewayError } from './transport'

/** ChatGPT and Claude exports imported as read-only chats (Pi `pi/memory/imports.py`). */
export type ImportSource = 'chatgpt' | 'claude'
export const importSourceNames: Record<ImportSource, string> = { chatgpt: 'ChatGPT', claude: 'Claude' }

const source = z.enum(['chatgpt', 'claude'])
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const moment = z.number().finite().nullable()
const digest = z.string().regex(/^[0-9a-f]{64}$/)
const memory = z.object({ on: z.boolean(), reason: z.string().max(500).nullable(), configured: z.boolean() })
const skipped = z.record(z.string().max(64), count)
const preview = z.object({
  schemaVersion: z.literal(1), source, digest, bytes: count,
  chats: z.object({ inFile: count, new: count, updated: count, unchanged: count }),
  messages: z.object({ inFile: count, new: count, yours: count, offeredToMemory: count }),
  firstAt: moment, lastAt: moment, sampleTitles: z.array(z.string().max(1000)).max(20), skipped, memory,
})
const result = z.object({
  schemaVersion: z.literal(1), batchId: z.string().regex(/^impb_[0-9a-f]{32}$/), source, digest, importedAt: z.number().finite(),
  chats: z.object({ new: count, updated: count, unchanged: count }), messages: z.object({ added: count, offeredToMemory: count }), skipped, memory,
})
const offers = z.object({ configured: z.boolean(), waiting: count, offered: count, refused: count, problem: z.string().max(1000).nullable() })
const listing = z.object({ schemaVersion: z.literal(1), imports: z.array(result).max(50), memory: offers })
const chatView = z.object({
  id: z.string().regex(/^imp_[0-9a-f]{32}$/), source, title: z.string().max(1000).nullable(),
  startedAt: moment, updatedAt: moment, importedAt: z.number().finite(), messageCount: count, readOnly: z.literal(true),
})
const chats = z.object({ schemaVersion: z.literal(1), total: count, chats: z.array(chatView).max(100), nextOffset: count.nullable() })
const message = z.object({
  id: z.string().regex(/^impmsg_[0-9a-f]{32}$/), seq: count, author: z.enum(['user', 'assistant']), text: z.string().max(60_000),
  createdAt: moment, shortened: z.boolean(), memory: z.enum(['offering', 'offered', 'refused', 'not_offered']).nullable(),
})
const chat = chatView.extend({ schemaVersion: z.literal(1), messages: z.array(message).max(200), nextAfter: count.nullable() })

export type ImportPreview = z.infer<typeof preview>
export type ImportResult = z.infer<typeof result>
export type ImportListing = z.infer<typeof listing>
export type ImportOffers = z.infer<typeof offers>
export type ImportedChat = z.infer<typeof chatView>
export type ImportedChatPage = z.infer<typeof chats>
export type ImportedChatDetail = z.infer<typeof chat>

function parse<T>(schema: z.ZodType<T>, value: unknown, input = false): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new GatewayError(input ? 'validation' : 'invalid-response')
  return parsed.data
}

// Pi's refusals in plain words, with what to do next (pi/memory/import_formats.py, imports.py).
const refusals: Partial<Record<GatewayRefusalCode, string>> = {
  too_large: `The file is larger than ${GATEWAY_IMPORT_LIMIT / (1024 * 1024)} MB, the most Conker imports at once.`,
  not_json: 'This file isn’t readable JSON. Choose conversations.json from the export.',
  not_a_list: 'This file isn’t a list of chats. Choose conversations.json from the export.',
  too_many_chats: 'The file holds more than 20,000 chats, the most one import takes.',
  too_many_messages: 'The file holds more than 500,000 messages, the most one import takes.',
  unknown_source: 'Choose ChatGPT or Claude.',
  file_changed: 'This isn’t the file you previewed. Choose it again to preview it, then import.',
  not_found: 'That imported chat is no longer there.',
}
export function importRefusalMessage(error: unknown, chosen?: ImportSource): string {
  if (error instanceof GatewayRefusal && error.refusal === 'wrong_format') {
    const other = error.looksLike && error.looksLike !== chosen ? error.looksLike : undefined
    return `No chat in this file matches a ${importSourceNames[chosen ?? 'chatgpt']} export.${other ? ` It looks like a ${importSourceNames[other]} export: choose ${importSourceNames[other]} instead.` : ''}`
  }
  return error instanceof GatewayRefusal && refusals[error.refusal] || gatewayError(error).message
}

export function createGatewayImportsClient(auth: Pick<GatewayAuthClient, 'request' | 'upload'>) {
  const upload = (selected: ImportSource, tail: string, file: Blob, signal?: AbortSignal) => {
    parse(source, selected, true)
    if (!(file instanceof Blob) || !file.size) throw new GatewayError('validation')
    if (file.size > GATEWAY_IMPORT_LIMIT) throw new GatewayRefusal('too_large', 413)
    return auth.upload(`/api/control/pi/imports/${selected}/${tail}`, file, signal)
  }
  return {
    /** What importing this file would add. Saves nothing and asks for no password. */
    async preview(selected: ImportSource, file: Blob, signal?: AbortSignal): Promise<ImportPreview> {
      const value = parse(preview, await upload(selected, 'preview', file, signal))
      if (value.source !== selected || value.bytes !== file.size) throw new GatewayError('invalid-response')
      return value
    },
    /** Import exactly the previewed file, named by its digest. Asks for the password. */
    async save(selected: ImportSource, fileDigest: string, file: Blob, signal?: AbortSignal): Promise<ImportResult> {
      const value = parse(result, await upload(selected, parse(digest, fileDigest, true), file, signal))
      if (value.source !== selected || value.digest !== fileDigest) throw new GatewayError('invalid-response')
      return value
    },
    async list(signal?: AbortSignal): Promise<ImportListing> {
      return parse(listing, await auth.request('/api/control/pi/imports', { signal }))
    },
    async chats(options: { offset?: number; limit?: number; source?: ImportSource } = {}, signal?: AbortSignal): Promise<ImportedChatPage> {
      const query = { limit: parse(z.number().int().min(1).max(100), options.limit ?? 50, true), offset: parse(z.number().int().min(0).max(1_000_000), options.offset ?? 0, true), ...(options.source ? { source: parse(source, options.source, true) } : {}) }
      const value = parse(chats, await auth.request('/api/control/pi/imports/chats', { query, signal }))
      if (value.chats.length > query.limit || new Set(value.chats.map(item => item.id)).size !== value.chats.length || options.source && value.chats.some(item => item.source !== options.source)) throw new GatewayError('invalid-response')
      return value
    },
    async chat(id: string, after = 0, signal?: AbortSignal): Promise<ImportedChatDetail> {
      const selected = parse(z.string().regex(/^imp_[0-9a-f]{32}$/), id, true)
      // 50 messages a page keeps the largest page (50,000 characters each) under the response limit.
      const value = parse(chat, await auth.request(`/api/control/pi/imports/chats/${selected}`, { query: { after: parse(count, after, true), limit: 50 }, signal }))
      if (value.id !== selected || value.messages.some(item => item.seq <= after)) throw new GatewayError('invalid-response')
      return value
    },
  }
}
export type GatewayImportsClient = ReturnType<typeof createGatewayImportsClient>
