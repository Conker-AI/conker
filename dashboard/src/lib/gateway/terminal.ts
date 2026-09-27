import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

const identity = z.string().regex(/^[A-Za-z0-9_-]{16,100}$/)
const currentTerminal = z.object({
  lease: identity.nullable(),
  workspace: z.string().min(1).max(120),
  maximumLifetimeSeconds: z.number().int().min(1).max(900),
  commandsPersisted: z.literal(false),
  outputPersisted: z.literal(false),
}).strict()
const createdTerminal = z.object({ id: identity, closed: z.boolean(), replayed: z.boolean() }).strict()
const terminalRead = z.object({
  data: z.string().max(1_500_000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  encoding: z.literal('base64'),
  cursor: z.number().int().nonnegative(),
  droppedBytes: z.number().int().nonnegative(),
  exitCode: z.number().int().nullable(),
}).strict()
const inputReceipt = z.object({ acceptedBytes: z.number().int().min(1).max(8192), automaticReplay: z.literal(false) }).strict()
const resizeReceipt = z.object({ resized: z.literal(true) }).strict()
const closeReceipt = z.object({ closed: z.literal(true) }).strict()

export type GatewayCurrentTerminal = z.infer<typeof currentTerminal>
export type GatewayTerminalRead = z.infer<typeof terminalRead>

function parse<T>(schema: z.ZodType<T>, value: unknown, input = false): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new GatewayError(input ? 'validation' : 'invalid-response')
  return result.data
}

export function createTerminalRequestId() {
  return `browser_${globalThis.crypto.randomUUID().replaceAll('-', '')}`
}

export function encodeTerminalInput(data: Uint8Array) {
  if (data.byteLength < 1 || data.byteLength > 8192) throw new GatewayError('validation')
  let binary = ''
  for (const byte of data) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function decodeTerminalOutput(data: string) {
  try {
    const binary = atob(data)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
    return bytes
  } catch { throw new GatewayError('invalid-response') }
}

export function createGatewayTerminalClient(auth: Pick<GatewayAuthClient, 'request'>) {
  return {
    async current(signal?: AbortSignal): Promise<GatewayCurrentTerminal> {
      return parse(currentTerminal, await auth.request('/api/terminal/current', { signal }))
    },
    async create(requestId: string, signal?: AbortSignal) {
      const selected = parse(identity, requestId, true)
      const result = parse(createdTerminal, await auth.request('/api/terminal', { method: 'POST', body: { requestId: selected }, signal }))
      if (result.id !== selected) throw new GatewayError('invalid-response')
      return result
    },
    async read(lease: string, cursor: number, signal?: AbortSignal): Promise<GatewayTerminalRead> {
      const selected = parse(identity, lease, true)
      return parse(terminalRead, await auth.request(`/api/terminal/${selected}`, {
        query: { cursor: parse(z.number().int().nonnegative(), cursor, true) }, signal,
      }))
    },
    async input(lease: string, data: Uint8Array, signal?: AbortSignal) {
      const selected = parse(identity, lease, true)
      const receipt = parse(inputReceipt, await auth.request(`/api/terminal/${selected}/input`, {
        method: 'POST', body: { data: encodeTerminalInput(data) }, signal,
      }))
      if (receipt.acceptedBytes !== data.byteLength) throw new GatewayError('invalid-response')
      return receipt
    },
    async resize(lease: string, rows: number, columns: number, signal?: AbortSignal) {
      const selected = parse(identity, lease, true)
      return parse(resizeReceipt, await auth.request(`/api/terminal/${selected}/resize`, {
        method: 'POST', body: {
          rows: parse(z.number().int().min(2).max(200), rows, true),
          columns: parse(z.number().int().min(10).max(400), columns, true),
        }, signal,
      }))
    },
    async close(lease: string, signal?: AbortSignal) {
      const selected = parse(identity, lease, true)
      return parse(closeReceipt, await auth.request(`/api/terminal/${selected}/close`, { method: 'POST', body: {}, signal }))
    },
  }
}

export type GatewayTerminalClient = ReturnType<typeof createGatewayTerminalClient>
