/** Browser gateway boundary. Never accepts a service URL, bearer key or arbitrary headers. */
export const GATEWAY_JSON_LIMIT = 65_536
// The gateway caps request bodies, but does not cap proxy responses. Bound browser memory separately.
export const GATEWAY_RESPONSE_LIMIT = 8 * 1024 * 1024
export type GatewayErrorKind = 'configuration' | 'validation' | 'network' | 'aborted' | 'invalid-response' | 'too-large' | 'response-too-large' | 'http' | 'rate-limited' | 'dependency' | 'browser-expired' | 'upstream-denied' | 'verification-failed' | 'session-changed' | 'verification-cancelled' | 'verification-required' | 'verification-password'
const messages: Record<GatewayErrorKind, string> = {
  configuration: 'The gateway requires this page to use the same HTTPS origin.',
  validation: 'This request is not supported by the browser gateway.',
  network: 'The gateway could not be reached. The operation was not retried.',
  aborted: 'The request was interrupted. Its server outcome may be unknown.',
  'invalid-response': 'The gateway returned an invalid response. The operation was not retried.',
  'too-large': 'The request exceeds the gateway browser limits (64 KiB for JSON).',
  'response-too-large': 'The response exceeds this browser view’s size limit (8 MiB for runtime data; 64 KiB for authentication).',
  http: 'The gateway declined the request. The operation was not retried.',
  'rate-limited': 'Too many login attempts. Wait before trying again.',
  dependency: 'A required gateway service is unavailable. The operation was not retried.',
  'browser-expired': 'Your browser session has expired. Sign in again.',
  'upstream-denied': 'The request was denied while your browser session remains active. It was not retried.',
  'verification-failed': 'Your browser session could not be verified. The operation was not retried.',
  'session-changed': 'Your browser session changed before this response arrived. Its server outcome may be unknown.',
  'verification-cancelled': 'Password verification was cancelled before the operation was sent.',
  'verification-required': 'The gateway did not admit this operation. Verify this exact operation again before submitting.',
  'verification-password': 'The password was not accepted. The operation has not been sent.',
}
export class GatewayError extends Error {
  readonly kind: GatewayErrorKind
  readonly status?: number
  readonly turnId?: string
  constructor(kind: GatewayErrorKind, status?: number, turnId?: string) {
    super(messages[kind])
    this.name = 'GatewayError'
    this.kind = kind
    this.status = status
    this.turnId = turnId
  }
}
export function gatewayError(error: unknown): GatewayError {
  return error instanceof GatewayError ? error : new GatewayError('network')
}
export type GatewayMethod = 'GET' | 'POST'
export type GatewayRequest = {
  method?: GatewayMethod
  body?: Record<string, unknown>
  query?: Record<string, string | number | boolean>
  signal?: AbortSignal
}
export type GatewayTransport = ReturnType<typeof createGatewayTransport>
const ids = '[A-Za-z0-9_-]+'
const routes: Record<GatewayMethod, RegExp[]> = {
  GET: [ /^\/api\/owner\/editor-capabilities$/, /^\/api\/owner\/editor-drafts$/, /^\/api\/owner\/editor-drafts\/[A-Za-z][A-Za-z0-9_-]{0,63}(?:\/(?:publications|validation|access|runs))?$/, new RegExp(`^/api/control/pi/sessions/${ids}/settings$`), /^\/api\/control\/pi\/models\/configuration$/, /^\/api\/control\/pi\/memory\/objects$/, new RegExp(`^/api/control/pi/memory/forget/${ids}$`), new RegExp(`^/api/control/pi/memory/objects/[a-z]+/${ids}$`),
    /^\/health$/, /^\/auth\/session$/, /^\/auth\/sessions$/, /^\/api\/owner\/requests$/, new RegExp(`^/api/owner/requests/${ids}$`),
    /^\/api\/pi\/(health|sessions|turns\/unreplied|approvals|tools|models|memory|tasks|runs|events|proposals)$/,
    new RegExp(`^/api/pi/(sessions|messages|tasks|runs)/${ids}$`),
    new RegExp(`^/api/pi/turn-submissions/${ids}$`), new RegExp(`^/api/pi/sessions/${ids}/submissions$`),
    new RegExp(`^/api/pi/tasks/requests/${ids}$`) ],
  POST: [ /^\/api\/control\/pi\/memory\/forget$/, /^\/api\/owner\/editor-drafts\/[A-Za-z][A-Za-z0-9_-]{0,63}(?:\/(?:publish|access|runs))?$/, new RegExp(`^/api/control/pi/sessions/${ids}/settings$`), /^\/api\/control\/pi\/models\/configuration$/, /^\/auth\/(login|logout|verify|revoke-all)$/, new RegExp(`^/auth/sessions/${ids}/revoke$`),
    new RegExp(`^/api/owner/requests/${ids}/decision$`), /^\/api\/pi\/(sessions|tasks)$/,
    new RegExp(`^/api/pi/tasks/${ids}/(update|transition|archive)$`),
    new RegExp(`^/api/pi/sessions/${ids}/(turns|fork)$`), new RegExp(`^/api/pi/turns/${ids}/resume$`), new RegExp(`^/api/pi/turn-submissions/${ids}/cancel$`), new RegExp(`^/api/pi/proposals/${ids}/decision$`) ],
}
/** Conversation writes need the signed-in session only (ADR-0010); every other write asks for the password. */
const conversationWrites = [/^\/api\/pi\/sessions$/, new RegExp(`^/api/pi/sessions/${ids}/(turns|fork)$`), new RegExp(`^/api/pi/turn-submissions/${ids}/cancel$`), new RegExp(`^/api/pi/proposals/${ids}/decision$`)]
export const isConversationWrite = (path: string) => conversationWrites.some(route => route.test(path))
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function jsonBody(value: unknown): string {
  if (!object(value)) throw new GatewayError('validation')
  let count = 0
  const seen = new Set<object>()
  const check = (item: unknown, depth: number): void => {
    if (++count > GATEWAY_JSON_LIMIT || depth > 64) throw new GatewayError('too-large')
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return
    if (typeof item === 'number' && Number.isFinite(item)) return
    if (typeof item !== 'object' || seen.has(item)) throw new GatewayError('validation')
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) throw new GatewayError('validation')
    seen.add(item)
    for (const child of Object.values(item)) check(child, depth + 1)
    seen.delete(item)
  }
  check(value, 0)
  const text = JSON.stringify(value)
  if (text.length > GATEWAY_JSON_LIMIT || new TextEncoder().encode(text).byteLength > GATEWAY_JSON_LIMIT) throw new GatewayError('too-large')
  return text
}
export type GatewayVerifiedOperation = { method: 'POST'; path: string; body: Record<string, unknown> }
/** Capture the exact validated JSON before a password prompt can yield to other edits. */
export function snapshotGatewayOperation(path: string, body: unknown): GatewayVerifiedOperation {
  if (!path.startsWith('/api/') || !routes.POST.some(route => route.test(path))) throw new GatewayError('validation')
  return { method: 'POST', path, body: JSON.parse(jsonBody(body)) as Record<string, unknown> }
}
async function responseObject(response: Response, limit = GATEWAY_JSON_LIMIT): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) {
    await response.body?.cancel().catch(() => undefined)
    throw new GatewayError('invalid-response')
  }
  const length = response.headers.get('content-length')
  if (length && Number(length) > limit) {
    await response.body?.cancel().catch(() => undefined)
    throw new GatewayError('response-too-large')
  }
  if (!response.body) throw new GatewayError('invalid-response')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) {
        await reader.cancel().catch(() => undefined)
        throw new GatewayError('response-too-large')
      }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  try {
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (!object(value)) throw new Error('object required')
    return value
  } catch { throw new GatewayError('invalid-response') }
}
export function createGatewayTransport(options: { origin?: string; fetch?: typeof fetch } = {}) {
  const origin = options.origin ?? (typeof window !== 'undefined' ? window.location.origin : '')
  try {
    const url = new URL(origin)
    if (url.protocol !== 'https:' || url.origin !== origin || (typeof window !== 'undefined' && window.location.origin !== origin)) throw new Error('origin')
  } catch { throw new GatewayError('configuration') }
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis)
  return {
    async request(path: string, options: GatewayRequest & { csrfToken?: string; verificationToken?: string } = {}): Promise<Record<string, unknown>> {
      const method = options.method ?? 'GET'
      if ((method !== 'GET' && method !== 'POST') || typeof path !== 'string' || path.length > 2048 || !/^\/[A-Za-z0-9/_-]+$/.test(path) || /\s/.test(path) || !routes[method].some(route => route.test(path))) throw new GatewayError('validation')
      if (method === 'GET' && options.body !== undefined) throw new GatewayError('validation')
      if (method === 'POST' && (!options.csrfToken || !/^[A-Za-z0-9_-]{32,128}$/.test(options.csrfToken))) throw new GatewayError('validation')
      if (options.verificationToken !== undefined && (method !== 'POST' || !path.startsWith('/api/') || !/^[A-Za-z0-9_-]{43}$/.test(options.verificationToken))) throw new GatewayError('validation')
      const query = new URLSearchParams()
      if (options.query) {
        const entries = Object.entries(options.query)
        if (method !== 'GET' || entries.length > 32) throw new GatewayError('validation')
        for (const [key, value] of entries) {
          if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(key) || !['string', 'number', 'boolean'].includes(typeof value) || String(value).length > 4096 || (typeof value === 'number' && !Number.isFinite(value))) throw new GatewayError('validation')
          query.set(key, String(value))
        }
      }
      const suffix = query.size ? `?${query}` : ''
      if (suffix.length > 8192) throw new GatewayError('too-large')
      const body = options.body === undefined ? undefined : jsonBody(options.body)
      const headers: Record<string, string> = { Accept: 'application/json' }
      if (body !== undefined) headers['Content-Type'] = 'application/json'
      if (method === 'POST') headers['X-CSRF-Token'] = options.csrfToken!
      if (options.verificationToken) headers['X-Conker-Verification'] = options.verificationToken
      try {
        const response = await fetcher(`${origin}${path}${suffix}`, {
          method, headers, body, signal: options.signal, credentials: 'same-origin',
          mode: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'same-origin',
        })
        if (response.redirected || (response.status >= 300 && response.status < 400)) throw new GatewayError('invalid-response')
        if (response.url && new URL(response.url).origin !== origin) throw new GatewayError('invalid-response')
        if (!response.ok) {
          let turnId: string | undefined
          if (response.status === 503 && /^\/api\/pi\/(sessions\/[A-Za-z0-9_-]+\/turns|turns\/[A-Za-z0-9_-]+\/resume)$/.test(path)) {
            try {
              const value = await responseObject(response)
              if (object(value.detail) && typeof value.detail.turn_id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value.detail.turn_id)) turnId = value.detail.turn_id
            } catch { /* Error bodies are never displayed; only a bounded turn identity can be retained. */ }
          } else await response.body?.cancel().catch(() => undefined)
          throw new GatewayError(response.status === 428 ? 'verification-required' : response.status === 429 ? 'rate-limited' : response.status >= 500 ? 'dependency' : 'http', response.status, turnId)
        }
        return await responseObject(response, path.startsWith('/auth/') ? GATEWAY_JSON_LIMIT : GATEWAY_RESPONSE_LIMIT)
      } catch (error) {
        if (error instanceof GatewayError) throw error
        throw new GatewayError(options.signal?.aborted ? 'aborted' : 'network')
      }
    },
  }
}
