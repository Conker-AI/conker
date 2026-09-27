import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

const requestId = z.string().regex(/^[A-Za-z0-9_-]{16,100}$/)
const rootId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)
const safePart = (part: string) => part.length > 0 && part.length <= 255 && part !== '.' && part !== '..' && Array.from(part).every(character => {
  const code = character.codePointAt(0) ?? 0
  return character !== '/' && character !== '\\' && code >= 32 && code !== 127 && !(code >= 0xd800 && code <= 0xdfff)
})
const relativePath = z.string().max(4096).refine(value => value === '' || value.split('/').every(safePart))
const root = z.object({ id: rootId, path: z.string().min(1).max(4097) }).strict()
const rootCapabilities = z.object({ list: z.literal(true), read: z.literal(false), write: z.literal(false) }).strict()
const catalogueBase = {
  schemaVersion: z.literal(1), authority: z.literal('none'), execution: z.literal('directory-listing-only'), contentIncluded: z.literal(false),
}
const catalogue = z.discriminatedUnion('mode', [
  z.object({ ...catalogueBase, mode: z.literal('configured'), code: z.null(), roots: z.array(root).min(1).max(64), capabilities: rootCapabilities }).strict(),
  z.object({ ...catalogueBase, mode: z.literal('unavailable'), code: z.enum(['disabled', 'not_configured', 'invalid_configuration', 'unsupported_platform']), roots: z.array(root).length(0), capabilities: z.null() }).strict(),
])
const entry = z.object({
  name: z.string().min(1).max(255).refine(safePart), path: relativePath, kind: z.enum(['directory', 'file', 'symlink', 'other']),
}).strict()
const listing = z.object({
  mode: z.literal('observed'), rootId, path: relativePath, truncated: z.boolean(), sampledAt: z.string().datetime({ offset: true }), entries: z.array(entry).max(200),
}).strict().superRefine((value, context) => {
  const names = new Set<string>()
  for (const item of value.entries) {
    const expected = value.path ? `${value.path}/${item.name}` : item.name
    if (item.path !== expected || names.has(item.name)) context.addIssue({ code: 'custom', message: 'Directory entries must be unique children of the requested path.' })
    names.add(item.name)
  }
})
const directory = z.object({
  schemaVersion: z.literal(1), requestId, state: z.enum(['dispatching', 'awaiting_approval', 'unknown', 'failed', 'complete']),
  limit: z.number().int().min(1).max(200), rootId, path: relativePath, approvalRequired: z.boolean(),
  errorCode: z.enum(['invalid_approval', 'invalid_listing', 'read_failed']).nullable(), listing: listing.nullable(),
  receiptStatus: z.literal('unavailable').nullable(), currentAgeSeconds: z.number().finite().nonnegative().nullable(),
  createdAt: z.number().finite().nonnegative(), updatedAt: z.number().finite().nonnegative(), source: z.literal('toolgate/system.files-list'),
  refreshRequiresNewRequest: z.literal(true), authority: z.literal('none'), contentIncluded: z.literal(false), execution: z.literal('directory-listing-only'),
}).strict()

export type GatewayFileCatalogue = z.infer<typeof catalogue>
export type GatewayDirectory = z.infer<typeof directory>
export type GatewayDirectoryEntry = z.infer<typeof entry>

function parse<T>(schema: z.ZodType<T>, value: unknown, input = false): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new GatewayError(input ? 'validation' : 'invalid-response')
  return result.data
}

export function createFilesystemRequestId() {
  return `browser_${globalThis.crypto.randomUUID().replaceAll('-', '')}`
}

export function createGatewayFilesystemClient(auth: Pick<GatewayAuthClient, 'request'>) {
  const base = '/api/control/pi/system/files'
  return {
    async roots(signal?: AbortSignal): Promise<GatewayFileCatalogue> {
      return parse(catalogue, await auth.request(`${base}/roots`, { signal }))
    },
    async request(id: string, selectedRoot: string, path = '', limit = 200, signal?: AbortSignal): Promise<GatewayDirectory> {
      const bound = { id: parse(requestId, id, true), root: parse(rootId, selectedRoot, true), path: parse(relativePath, path, true), limit: parse(z.number().int().min(1).max(200), limit, true) }
      const value = parse(directory, await auth.request(`${base}/listings`, { method: 'POST', body: { request_id: bound.id, root_id: bound.root, path: bound.path, limit: bound.limit }, signal }))
      if (value.requestId !== bound.id || value.rootId !== bound.root || value.path !== bound.path || value.limit !== bound.limit) throw new GatewayError('invalid-response')
      return value
    },
    async inspect(id: string, signal?: AbortSignal): Promise<GatewayDirectory> {
      const selected = parse(requestId, id, true)
      const value = parse(directory, await auth.request(`${base}/listings/${selected}`, { signal }))
      if (value.requestId !== selected) throw new GatewayError('invalid-response')
      return value
    },
    async resume(id: string, signal?: AbortSignal): Promise<GatewayDirectory> {
      const selected = parse(requestId, id, true)
      const value = parse(directory, await auth.request(`${base}/listings/${selected}/resume`, { method: 'POST', body: {}, signal }))
      if (value.requestId !== selected) throw new GatewayError('invalid-response')
      return value
    },
  }
}

export type GatewayFilesystemClient = ReturnType<typeof createGatewayFilesystemClient>
