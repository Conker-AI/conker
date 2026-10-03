/** Browser gateway boundary. Never accepts a service URL, bearer key or arbitrary headers. */
export const GATEWAY_JSON_LIMIT = 65_536
// The gateway caps request bodies, but does not cap proxy responses. Bound browser memory separately.
export const GATEWAY_RESPONSE_LIMIT = 8 * 1024 * 1024
export const GATEWAY_CHARACTER_LIMIT = 66 * 1024 * 1024
export const GATEWAY_AUDIO_LIMIT = 10 * 1024 * 1024
export const GATEWAY_AUDIO_RESPONSE_LIMIT = 32 * 1024 * 1024
export type GatewayErrorKind = 'configuration' | 'validation' | 'network' | 'aborted' | 'invalid-response' | 'too-large' | 'response-too-large' | 'http' | 'login-rejected' | 'rate-limited' | 'dependency' | 'browser-expired' | 'upstream-denied' | 'verification-failed' | 'session-changed' | 'verification-cancelled' | 'verification-required' | 'verification-password'
const messages: Record<GatewayErrorKind, string> = {
  configuration: 'Open Conker at its own HTTPS address; this page is on a different one.',
  validation: 'Conker can’t do that from the browser.',
  network: 'Can’t reach your Conker server. Check your connection; nothing was retried.',
  aborted: 'That was interrupted, so it may or may not have gone through.',
  'invalid-response': 'Your Conker server sent back something unexpected. Nothing was retried.',
  'too-large': 'That’s too large to send from the browser (64 KB limit).',
  'response-too-large': 'The answer is too large to show here (8 MB limit).',
  http: 'Your Conker server turned that down. Nothing was retried.',
  'login-rejected': 'That password didn’t match this Conker. Try again or reset it on the host.',
  'rate-limited': 'Too many login attempts. Wait before trying again.',
  dependency: 'Part of Conker isn’t running right now. Nothing was retried; check System.',
  'browser-expired': 'Your browser session has expired. Sign in again.',
  'upstream-denied': 'That wasn’t allowed. You’re still signed in; nothing was retried.',
  'verification-failed': 'Couldn’t confirm it’s you. Nothing was retried; sign in again if this repeats.',
  'session-changed': 'You signed in or out while this was running, so it may or may not have gone through.',
  'verification-cancelled': 'Password verification was cancelled before the operation was sent.',
  'verification-required': 'This needs your password again before it can go through.',
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
  GET: [ /^\/api\/owner\/editor-capabilities$/, /^\/api\/owner\/editor-drafts$/, /^\/api\/owner\/editor-drafts\/[A-Za-z][A-Za-z0-9_-]{0,63}(?:\/(?:publications|validation|access|runs))?$/, /^\/api\/control\/pi\/setup\/status$/, /^\/api\/control\/pi\/setup\/boundaries$/, /^\/api\/control\/pi\/setup\/models$/, /^\/api\/control\/pi\/setup\/protection$/, /^\/api\/control\/pi\/setup\/rehearsal$/, /^\/api\/control\/pi\/setup\/choices\/(companion|memory|capabilities)$/, /^\/api\/control\/pi\/setup\/receipts\/(boundaries|protection|rehearsal)$/, new RegExp(`^/api/control/pi/sessions/${ids}/settings$`), /^\/api\/control\/pi\/models\/configuration$/, /^\/api\/control\/pi\/memory\/objects$/, new RegExp(`^/api/control/pi/memory/forget/${ids}$`), new RegExp(`^/api/control/pi/memory/objects/[a-z]+/${ids}$`),
    /^\/health$/, /^\/auth\/session$/, /^\/auth\/sessions$/, /^\/api\/owner\/requests$/, new RegExp(`^/api/owner/requests/${ids}$`),
    /^\/api\/pi\/(health|sessions|turns\/unreplied|approvals|tools|models|memory|tasks|runs|events|proposals)$/,
    new RegExp(`^/api/pi/(sessions|messages|tasks|runs)/${ids}$`),
    new RegExp(`^/api/pi/turn-submissions/${ids}$`), new RegExp(`^/api/pi/sessions/${ids}/submissions$`),
    new RegExp(`^/api/pi/tasks/requests/${ids}$`) ],
  POST: [ /^\/api\/control\/pi\/memory\/forget$/, /^\/api\/control\/pi\/setup\/models$/, /^\/api\/control\/pi\/setup\/models\/activate$/, /^\/api\/control\/pi\/setup\/protection$/, /^\/api\/control\/pi\/setup\/rehearsal\/(?:memory-review|approval\/(?:start|resume)|finalize)$/, /^\/api\/control\/pi\/setup\/choices\/(companion|memory|capabilities)$/, /^\/api\/control\/pi\/setup\/receipts\/boundaries$/, /^\/api\/owner\/editor-drafts\/[A-Za-z][A-Za-z0-9_-]{0,63}(?:\/(?:publish|access|runs))?$/, new RegExp(`^/api/control/pi/sessions/${ids}/settings$`), /^\/api\/control\/pi\/models\/configuration$/, /^\/auth\/(login|logout|verify|revoke-all)$/, new RegExp(`^/auth/sessions/${ids}/revoke$`),
    new RegExp(`^/api/owner/requests/${ids}/decision$`), /^\/api\/pi\/(sessions|tasks)$/,
    new RegExp(`^/api/pi/tasks/${ids}/(update|transition|archive)$`),
    new RegExp(`^/api/pi/sessions/${ids}/(turns|fork)$`), new RegExp(`^/api/pi/turns/${ids}/resume$`), new RegExp(`^/api/pi/turn-submissions/${ids}/cancel$`), new RegExp(`^/api/pi/proposals/${ids}/decision$`) ],
}
// Diagnostics is the one shared owner-health contract used by the UI and host CLI.
routes.GET.unshift(/^\/api\/control\/pi\/search(?:\/(?:settings|capabilities))?$/)
routes.POST.unshift(/^\/api\/control\/pi\/search\/settings$/)
routes.GET.unshift(/^\/api\/diagnostics$/)
// Authored agents are owner-controlled records; every mutation receives operation-bound verification.
routes.GET.unshift(/^\/api\/control\/pi\/agents(?:\/(?:companion|agent_[0-9a-f]{32})(?:\/versions(?:\/[1-9][0-9]{0,9})?)?)?$/)
routes.POST.unshift(/^\/api\/control\/pi\/agents$/, /^\/api\/control\/pi\/(?:agents\/(?:companion|agent_[0-9a-f]{32})\/update|agents\/agent_[0-9a-f]{32}\/archive)$/)
// Projects expose metadata and live-reference identities only; destructive removal stays host-admin only.
routes.GET.unshift(/^\/api\/control\/pi\/projects(?:\/project_[0-9a-f]{32})?$/)
routes.POST.unshift(/^\/api\/control\/pi\/projects$/, /^\/api\/control\/pi\/projects\/project_[0-9a-f]{32}\/(?:update|archive|link|unlink)$/)
// Artifact list responses are metadata-only; content is bounded to explicit detail and inert export routes.
routes.GET.unshift(/^\/api\/control\/pi\/artifacts(?:\/artifact_[0-9a-f]{32}(?:\/export)?)?$/)
routes.POST.unshift(/^\/api\/control\/pi\/artifacts(?:\/from-message)?$/, /^\/api\/control\/pi\/artifacts\/artifact_[0-9a-f]{32}\/(?:versions|restore|archive)$/)
// Job views redact target inputs, allowance identities and receipts; browser writes use exact recovery actions only.
routes.GET.unshift(/^\/api\/control\/pi\/jobs(?:\/job_[0-9a-f]{32}(?:\/runs)?)?$/)
routes.POST.unshift(/^\/api\/control\/pi\/jobs\/job_[0-9a-f]{32}\/(?:state|run)$/, /^\/api\/control\/pi\/jobs\/runs\/scheduled_[0-9a-f]{32}\/(?:provision-budget|cancel|resume|reconcile)$/)
// Character packages may contain bounded embedded media. Only this authenticated owner route gets the larger envelope.
const characterReadRoute = /^\/api\/control\/pi\/characters\/companion(?:\/(?:history|export))?$/
const characterResponseRoute = /^\/api\/control\/pi\/characters\/companion(?:\/(?:history|export|save|import|restore))?$/
routes.GET.unshift(characterReadRoute)
routes.POST.unshift(/^\/api\/control\/pi\/characters\/companion\/(?:save|import|restore)$/)
// Host inventory is a fixed read-only ToolGate observation. A refresh is a new durable request.
routes.GET.unshift(/^\/api\/control\/pi\/system\/inventory\/(?:configured\/(?:services|containers)|[A-Za-z0-9_-]{16,100})$/)
routes.POST.unshift(/^\/api\/control\/pi\/system\/inventory$/, /^\/api\/control\/pi\/system\/inventory\/[A-Za-z0-9_-]{16,100}\/resume$/)
// Files are operator-configured, directory-listing-only roots. No content or mutation route is browser reachable.
routes.GET.unshift(/^\/api\/control\/pi\/system\/files\/roots$/, /^\/api\/control\/pi\/system\/files\/listings\/[A-Za-z0-9_-]{16,100}$/)
routes.POST.unshift(/^\/api\/control\/pi\/system\/files\/listings$/, /^\/api\/control\/pi\/system\/files\/listings\/[A-Za-z0-9_-]{16,100}\/resume$/)
// Browser call audio is one bounded transient WAV turn; capture and playback remain client-owned.
routes.GET.unshift(/^\/api\/control\/pi\/calls\/browser\/(?:capabilities|active\/[A-Za-z0-9_-]{1,200}|call_[a-f0-9]{32})$/)
routes.POST.unshift(/^\/api\/control\/pi\/calls\/browser$/, /^\/api\/control\/pi\/calls\/browser\/call_[a-f0-9]{32}\/(?:update|interrupt|end|turns|audio)$/)
// Team configuration is durable and revisioned; preparation and execution remain outside the browser.
routes.GET.unshift(/^\/api\/control\/pi\/collaboration\/teams(?:\/team_[0-9a-f]{32}(?:\/versions(?:\/[1-9][0-9]{0,9})?)?)?$/)
routes.POST.unshift(/^\/api\/control\/pi\/collaboration\/teams$/, /^\/api\/control\/pi\/collaboration\/teams\/team_[0-9a-f]{32}\/(?:update|archive|restore)$/)
// Terminal creation is password-verified. Operations on that admitted ephemeral lease use the signed-in session.
routes.GET.unshift(/^\/api\/terminal\/current$/, /^\/api\/terminal\/[A-Za-z0-9_-]{16,100}$/)
routes.POST.unshift(/^\/api\/terminal$/, /^\/api\/terminal\/[A-Za-z0-9_-]{16,100}\/(?:input|resize|close)$/)
/** Routine session writes need the signed-in session only (ADR-0010); every other write asks for the password. */
const conversationWrites = [/^\/api\/pi\/sessions$/, new RegExp(`^/api/pi/sessions/${ids}/(turns|fork)$`), new RegExp(`^/api/pi/turn-submissions/${ids}/cancel$`), new RegExp(`^/api/pi/proposals/${ids}/decision$`), /^\/api\/control\/pi\/calls\/browser$/, /^\/api\/control\/pi\/calls\/browser\/call_[a-f0-9]{32}\/(?:update|interrupt|end|turns|audio)$/, /^\/api\/terminal\/[A-Za-z0-9_-]{16,100}\/(?:input|resize|close)$/]
export const isConversationWrite = (path: string) => conversationWrites.some(route => route.test(path))
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function jsonBody(value: unknown, byteLimit = GATEWAY_JSON_LIMIT): string {
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
  if (text.length > byteLimit || new TextEncoder().encode(text).byteLength > byteLimit) throw new GatewayError('too-large')
  return text
}
function characterOperation(value: unknown): boolean {
  if (!object(value)) return false
  const operation = object(value.operation) ? value.operation : value
  return operation.method === 'POST' && typeof operation.path === 'string' && /^\/api\/control\/pi\/characters\/companion\/(?:save|import|restore)$/.test(operation.path)
}
export type GatewayVerifiedOperation = { method: 'POST'; path: string; body: Record<string, unknown> }
/** Capture the exact validated JSON before a password prompt can yield to other edits. */
export function snapshotGatewayOperation(path: string, body: unknown): GatewayVerifiedOperation {
  if (!path.startsWith('/api/') || !routes.POST.some(route => route.test(path))) throw new GatewayError('validation')
  return { method: 'POST', path, body: JSON.parse(jsonBody(body, characterOperation({ method: 'POST', path, body }) ? GATEWAY_CHARACTER_LIMIT : GATEWAY_JSON_LIMIT)) as Record<string, unknown> }
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
    async audio(path: string, requestId: string, body: Uint8Array, csrfToken: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
      if (!/^\/api\/control\/pi\/calls\/browser\/call_[a-f0-9]{32}\/audio$/.test(path) ||
        !/^[A-Za-z0-9_-]{16,128}$/.test(requestId) || !(body instanceof Uint8Array) || !body.byteLength || body.byteLength > GATEWAY_AUDIO_LIMIT ||
        !/^[A-Za-z0-9_-]{32,128}$/.test(csrfToken)) throw new GatewayError('validation')
      const url = `${origin}${path}?request_id=${encodeURIComponent(requestId)}`
      const payload = new ArrayBuffer(body.byteLength)
      new Uint8Array(payload).set(body)
      try {
        const response = await fetcher(url, {
          method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'audio/wav', 'X-CSRF-Token': csrfToken }, body: payload,
          signal, credentials: 'same-origin', mode: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'same-origin',
        })
        if (response.redirected || (response.status >= 300 && response.status < 400) || (response.url && new URL(response.url).origin !== origin)) throw new GatewayError('invalid-response')
        if (!response.ok) {
          await response.body?.cancel().catch(() => undefined)
          throw new GatewayError(response.status === 429 ? 'rate-limited' : response.status >= 500 ? 'dependency' : 'http', response.status)
        }
        return await responseObject(response, GATEWAY_AUDIO_RESPONSE_LIMIT)
      } catch (error) {
        if (error instanceof GatewayError) throw error
        throw new GatewayError(signal?.aborted ? 'aborted' : 'network')
      }
    },
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
      const body = options.body === undefined ? undefined : jsonBody(options.body, characterOperation(options.body) || characterOperation({ method, path, body: options.body }) ? GATEWAY_CHARACTER_LIMIT : GATEWAY_JSON_LIMIT)
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
        return await responseObject(response, path.startsWith('/auth/') ? GATEWAY_JSON_LIMIT : characterResponseRoute.test(path) ? GATEWAY_CHARACTER_LIMIT : GATEWAY_RESPONSE_LIMIT)
      } catch (error) {
        if (error instanceof GatewayError) throw error
        throw new GatewayError(options.signal?.aborted ? 'aborted' : 'network')
      }
    },
  }
}
