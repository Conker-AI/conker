/** Browser gateway boundary. Never accepts a service URL, bearer key or arbitrary headers. */
export const GATEWAY_JSON_LIMIT = 65_536
// The gateway caps request bodies, but does not cap proxy responses. Bound browser memory separately.
export const GATEWAY_RESPONSE_LIMIT = 8 * 1024 * 1024
export const GATEWAY_HISTORY_LIMIT = 256 * 1024
export const GATEWAY_CHARACTER_LIMIT = 66 * 1024 * 1024
export const GATEWAY_AUDIO_LIMIT = 10 * 1024 * 1024
export const GATEWAY_AUDIO_RESPONSE_LIMIT = 32 * 1024 * 1024
export const memoryForgetErrorCodes = ['revision_conflict', 'work_active', 'forget_in_progress', 'forget_pending', 'request_conflict', 'not_found', 'not_configured', 'outcome_unknown', 'invalid_receipt', 'unavailable'] as const
export type MemoryForgetErrorCode = typeof memoryForgetErrorCodes[number]
export const memoryCorrectionErrorCodes = ['not_configured', 'unavailable', 'not_found', 'request_conflict', 'change_pending', 'work_active', 'in_progress', 'invalid_request', 'revision_conflict'] as const
type MemoryCorrectionErrorCode = typeof memoryCorrectionErrorCodes[number]
type GatewayErrorCode = 'draft_changed' | 'invalid_history_cursor' | 'invalid_history_request' | MemoryForgetErrorCode | MemoryCorrectionErrorCode
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
  readonly code?: GatewayErrorCode
  constructor(kind: GatewayErrorKind, status?: number, turnId?: string, code?: GatewayErrorCode) {
    super(messages[kind])
    this.name = 'GatewayError'
    this.kind = kind
    this.status = status
    this.turnId = turnId
    this.code = code
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
  /** Auth-only POST observation: dispatch is starting, not acknowledged. Never sent to transport. */
  onDispatch?: () => void
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
const correctionRoute = /^\/api\/control\/pi\/memory\/corrections(?:\/(?:pending|[A-Za-z0-9_-]{16,128}(?:\/retry)?|memories\/[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}))?$(?![\s\S])/
routes.GET.unshift(/^\/api\/control\/pi\/memory\/corrections\/(?:pending|[A-Za-z0-9_-]{16,128}|memories\/[A-Za-z0-9][A-Za-z0-9_.:-]{0,199})$(?![\s\S])/ )
routes.POST.unshift(/^\/api\/control\/pi\/memory\/corrections(?:\/[A-Za-z0-9_-]{16,128}\/retry)?$(?![\s\S])/)
const draftRoute = /^\/api\/control\/pi\/drafts\/[A-Za-z0-9_-]{1,128}(?:\/tasks\/[A-Za-z0-9_-]{1,128})?$/
const draftStartRoute = /^\/api\/control\/pi\/drafts\/new\/start$/
routes.GET.unshift(draftRoute, /^\/api\/control\/pi\/drafts\/new\/start\/[A-Za-z0-9_-]{16,128}$/)
routes.GET.unshift(/^\/api\/control\/pi\/memory\/forget-pending$/)
routes.POST.unshift(draftRoute, draftStartRoute)
routes.GET.unshift(/^\/api\/pi\/skills$/, /^\/api\/control\/pi\/skills(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/, /^\/api\/owner\/mcp\/tools(?:\/mcp\.[a-z0-9][a-z0-9.-]{0,75}\/access)?$/)
routes.POST.unshift(/^\/api\/control\/pi\/skills\/import$/, /^\/api\/control\/pi\/skills\/[a-z0-9]+(?:-[a-z0-9]+)*\/state$/, /^\/api\/owner\/mcp\/(?:discover|import)$/, /^\/api\/owner\/mcp\/tools\/mcp\.[a-z0-9][a-z0-9.-]{0,75}\/(?:state|access)$/)
routes.GET.unshift(/^\/api\/host\/providers$/)
// Access: whether Conker decides by his settings, the tools that always ask him, and what ran without asking.
routes.GET.unshift(/^\/api\/owner\/access$/, /^\/api\/control\/pi\/access\/handled$/, /^\/api\/owner\/tools\/[A-Za-z0-9][A-Za-z0-9._:-]{0,127}\/access$/)
routes.POST.unshift(/^\/api\/owner\/access\/delegate$/, /^\/api\/owner\/tools\/[A-Za-z0-9][A-Za-z0-9._:-]{0,127}\/(?:sensitive|card|access)$/)
routes.GET.unshift(new RegExp(`^/api/pi/sessions/${ids}/thinking$`))
const turnUsageRoute = /^\/api\/pi\/turns\/[A-Za-z0-9_-]{1,128}\/usage$/
routes.GET.unshift(turnUsageRoute)
const memoryDeliveryRoute = /^\/api\/pi\/sessions\/[A-Za-z0-9_-]{1,128}(?:\/messages\/[A-Za-z0-9_-]{1,128})?\/memory-delivery$/
routes.GET.unshift(memoryDeliveryRoute)
const observationRoute = /^\/api\/pi\/sessions\/[A-Za-z0-9_-]{1,128}\/observation$/
routes.GET.unshift(observationRoute)
const nativeSessionsRoute = /^\/api\/host\/claude\/sessions(?:\/[A-Za-z0-9][A-Za-z0-9_-]{0,99}(?:\/(?:output|stop))?)?$/
const codexSessionsPath = '/api/host/codex/sessions'
const codexSessionsRoute = /^\/api\/host\/codex\/sessions(?:\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})?$/
routes.GET.unshift(codexSessionsRoute)
routes.GET.unshift(/^\/api\/host\/claude\/sessions(?:\/[A-Za-z0-9][A-Za-z0-9_-]{0,99}(?:\/output)?)?$/)
routes.POST.unshift(/^\/api\/host\/claude\/sessions\/[A-Za-z0-9][A-Za-z0-9_-]{0,99}\/stop$/)
routes.GET.unshift(/^\/api\/host\/claude$/)
routes.POST.unshift(/^\/api\/host\/claude$/, new RegExp(`^/api/pi/sessions/${ids}/thinking/${ids}/cancel$`))
routes.POST.unshift(/^\/api\/host\/providers$/)
routes.GET.unshift(/^\/api\/host\/chatgpt$/)
routes.POST.unshift(/^\/api\/host\/chatgpt$/)
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
routes.POST.unshift(/^\/api\/control\/pi\/jobs\/job_[0-9a-f]{32}\/(?:state|run|hook|hook\/revoke)$/, /^\/api\/control\/pi\/jobs\/runs\/scheduled_[0-9a-f]{32}\/(?:provision-budget|cancel|resume|reconcile)$/)
// Plan usage is percentages per plan window only; dismissing an alert stays host-admin only.
routes.GET.unshift(/^\/api\/control\/pi\/plans\/usage$/)
// Conker's requests: list, approve (asks for the password), decline (creates nothing) and record the
// Tools draft a tool request was saved as (the save itself asked for the password).
routes.GET.unshift(/^\/api\/control\/pi\/change-requests(?:\/creq_[0-9a-f]{32})?$/)
routes.POST.unshift(/^\/api\/control\/pi\/change-requests\/creq_[0-9a-f]{32}\/(?:approve|decline|saved)$/)
// Settings: the owner's settings document (preferences only, no password) and his preferences
// (quiet hours, proactivity, budgets: saving asks for the password).
routes.GET.unshift(/^\/api\/control\/pi\/owner\/(?:settings|preferences)$/)
routes.POST.unshift(/^\/api\/control\/pi\/owner\/(?:settings|preferences)$/)
// Conker's questions: list, answer (his next message in that chat) and dismiss (sends nothing).
routes.GET.unshift(/^\/api\/control\/pi\/asks(?:\/ask_[0-9a-f]{32})?$/)
routes.POST.unshift(/^\/api\/control\/pi\/asks\/ask_[0-9a-f]{32}\/(?:answer|dismiss)$/)
// Adding a memory by hand asks for the password, like approving one Conker asked for.
routes.POST.unshift(/^\/api\/control\/pi\/memory\/remember$/)
// AI jobs: the browser creates AI jobs only (never raw tool jobs), reads their notes and dismisses one.
routes.GET.unshift(/^\/api\/control\/pi\/jobs\/agent\/notes$/)
routes.POST.unshift(/^\/api\/control\/pi\/jobs\/agent$/, /^\/api\/control\/pi\/jobs\/agent\/notes\/note_[0-9a-f]{32}\/dismiss$/)
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
conversationWrites.push(new RegExp(`^/api/pi/sessions/${ids}/thinking/${ids}/cancel$`))
conversationWrites.push(draftRoute, draftStartRoute)
conversationWrites.push(/^\/api\/control\/pi\/change-requests\/creq_[0-9a-f]{32}\/(?:decline|saved)$/)
// The settings document holds look and defaults, never authority.
conversationWrites.push(/^\/api\/control\/pi\/owner\/settings$/)
// Answering Conker's question is like typing in that chat; dismissing sends nothing.
conversationWrites.push(/^\/api\/control\/pi\/asks\/ask_[0-9a-f]{32}\/(?:answer|dismiss)$/)
// Dismissing an AI job's note hides one line; it grants and runs nothing.
conversationWrites.push(/^\/api\/control\/pi\/jobs\/agent\/notes\/note_[0-9a-f]{32}\/dismiss$/)
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
function correctionOperation(value: unknown): boolean {
  if (!object(value)) return false
  const operation = object(value.operation) ? value.operation : value
  return operation.method === 'POST' && operation.path === '/api/control/pi/memory/corrections'
}
export type GatewayVerifiedOperation = { method: 'POST'; path: string; body: Record<string, unknown> }
export function isBrowserSessionRoute(path: string): boolean {
  return path === '/auth/sessions' || path === '/auth/revoke-all' || /^\/auth\/sessions\/[A-Za-z0-9_-]{16,128}\/revoke$/.test(path)
}
/** Capture the exact validated JSON before a password prompt can yield to other edits. */
export function snapshotGatewayOperation(path: string, body: unknown): GatewayVerifiedOperation {
  if ((!path.startsWith('/api/') && !isBrowserSessionRoute(path)) || !routes.POST.some(route => route.test(path))) throw new GatewayError('validation')
  return { method: 'POST', path, body: JSON.parse(jsonBody(body, characterOperation({ method: 'POST', path, body }) ? GATEWAY_CHARACTER_LIMIT : correctionOperation({ method: 'POST', path, body }) ? 128000 : GATEWAY_JSON_LIMIT)) as Record<string, unknown> }
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
/** Tells the connection banner whether the server answered, without the transport importing UI state. */
function reportReachability(reachable: boolean) {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent('conker:gateway-reachability', { detail: reachable }))
  }
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
        reportReachability(true)
        if (response.redirected || (response.status >= 300 && response.status < 400) || (response.url && new URL(response.url).origin !== origin)) throw new GatewayError('invalid-response')
        if (!response.ok) {
          await response.body?.cancel().catch(() => undefined)
          throw new GatewayError(response.status === 429 ? 'rate-limited' : response.status >= 500 ? 'dependency' : 'http', response.status)
        }
        return await responseObject(response, GATEWAY_AUDIO_RESPONSE_LIMIT)
      } catch (error) {
        if (error instanceof GatewayError) throw error
        if (!signal?.aborted) reportReachability(false)
        throw new GatewayError(signal?.aborted ? 'aborted' : 'network')
      }
    },
    async request(path: string, options: GatewayRequest & { csrfToken?: string; verificationToken?: string } = {}): Promise<Record<string, unknown>> {
      const method = options.method ?? 'GET'
      if ((method !== 'GET' && method !== 'POST') || typeof path !== 'string' || path.length > 2048 || (!/^\/[A-Za-z0-9/_.-]+$/.test(path) && !correctionRoute.test(path)) || /\s/.test(path) || !routes[method].some(route => route.test(path))) throw new GatewayError('validation')
      if (correctionRoute.test(path) && options.query !== undefined) throw new GatewayError('validation')
      if (nativeSessionsRoute.test(path) && options.query !== undefined) throw new GatewayError('validation')
      if (codexSessionsRoute.test(path) && options.query !== undefined && (path !== codexSessionsPath || Object.entries(options.query).some(([key, value]) => key === 'limit' ? typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 50 : key === 'archived' ? typeof value !== 'boolean' : key === 'cursor' ? typeof value !== 'string' || value.length > 8192 || !/^[A-Za-z0-9_-]+$(?![\s\S])/.test(value) : true))) throw new GatewayError('validation')
      if (method === 'GET' && options.body !== undefined) throw new GatewayError('validation')
      if ((turnUsageRoute.test(path) || memoryDeliveryRoute.test(path) || observationRoute.test(path)) && options.query !== undefined) throw new GatewayError('validation')
      if (path === '/api/control/pi/memory/forget-pending' && options.query !== undefined) throw new GatewayError('validation')
      if (path === '/api/pi/sessions/history' && options.query !== undefined && Object.entries(options.query).some(([key, value]) => key === 'limit' ? typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 50 : key === 'q' ? typeof value !== 'string' || [...value].length > 200 || value.includes('\0') || /[\uD800-\uDFFF]/u.test(value) : key === 'cursor' ? typeof value !== 'string' || !/^h1\.[a-f0-9]{64}\.[A-Za-z0-9_-]{1,128}$/.test(value) : true)) throw new GatewayError('validation')
      if (method === 'POST' && (!options.csrfToken || !/^[A-Za-z0-9_-]{32,128}$/.test(options.csrfToken))) throw new GatewayError('validation')
      if (options.verificationToken !== undefined && (method !== 'POST' || !path.startsWith('/api/') && !isBrowserSessionRoute(path) || !/^[A-Za-z0-9_-]{43}$/.test(options.verificationToken))) throw new GatewayError('validation')
      const query = new URLSearchParams()
      if (options.query) {
        const entries = Object.entries(options.query)
        if (method !== 'GET' || entries.length > 32) throw new GatewayError('validation')
        for (const [key, value] of entries) {
          if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(key) || !['string', 'number', 'boolean'].includes(typeof value) || String(value).length > (path === codexSessionsPath && key === 'cursor' ? 8192 : 4096) || (typeof value === 'number' && !Number.isFinite(value))) throw new GatewayError('validation')
          query.set(key, String(value))
        }
      }
      const suffix = query.size ? `?${query}` : ''
      if (suffix.length > (path === codexSessionsPath ? 8300 : 8192)) throw new GatewayError('too-large')
      const body = options.body === undefined ? undefined : jsonBody(options.body, characterOperation(options.body) || characterOperation({ method, path, body: options.body }) ? GATEWAY_CHARACTER_LIMIT : correctionOperation(options.body) || correctionOperation({ method, path, body: options.body }) ? 128000 : GATEWAY_JSON_LIMIT)
      const headers: Record<string, string> = { Accept: 'application/json' }
      if (body !== undefined) headers['Content-Type'] = 'application/json'
      if (method === 'POST') headers['X-CSRF-Token'] = options.csrfToken!
      if (options.verificationToken) headers['X-Conker-Verification'] = options.verificationToken
      try {
        const response = await fetcher(`${origin}${path}${suffix}`, {
          method, headers, body, signal: options.signal, credentials: 'same-origin',
          mode: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'same-origin',
        })
        reportReachability(true)
        if (response.redirected || (response.status >= 300 && response.status < 400)) throw new GatewayError('invalid-response')
        if (response.url && new URL(response.url).origin !== origin) throw new GatewayError('invalid-response')
        if (!response.ok) {
          let turnId: string | undefined
          let code: GatewayErrorCode | undefined
          if ([409, 503].includes(response.status) && /^\/api\/pi\/(sessions\/[A-Za-z0-9_-]+\/turns|turns\/[A-Za-z0-9_-]+\/resume)$/.test(path)) {
            try {
              const value = await responseObject(response)
              if (object(value.detail) && typeof value.detail.turn_id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value.detail.turn_id)) turnId = value.detail.turn_id
              if (response.status === 409 && object(value.detail) && value.detail.code === 'draft_changed') code = 'draft_changed'
            } catch { /* Error bodies are never displayed; only a bounded turn identity can be retained. */ }
          } else if (correctionRoute.test(path) && [404, 409, 422, 503].includes(response.status)) {
            try {
              const value = await responseObject(response, GATEWAY_JSON_LIMIT)
              if (object(value.detail) && memoryCorrectionErrorCodes.includes(value.detail.code as MemoryCorrectionErrorCode)) code = value.detail.code as MemoryCorrectionErrorCode
            } catch { /* Fixed correction codes only; never display upstream text. */ }
          } else if (method === 'POST' && path === '/api/control/pi/memory/forget' && [404, 409, 422, 502, 503].includes(response.status)) {
            try {
              const value = await responseObject(response, GATEWAY_JSON_LIMIT)
              if (object(value.detail) && memoryForgetErrorCodes.includes(value.detail.code as MemoryForgetErrorCode)) code = value.detail.code as MemoryForgetErrorCode
            } catch { /* Retain only a known operation code, never upstream text. */ }
          } else if (method === 'GET' && path === '/api/pi/sessions/history' && response.status === 422) {
            try {
              const value = await responseObject(response, GATEWAY_JSON_LIMIT)
              if (object(value.detail) && (value.detail.code === 'invalid_history_cursor' || value.detail.code === 'invalid_history_request')) code = value.detail.code
            } catch { /* Only fixed directory codes survive; upstream text is never displayed. */ }
          } else await response.body?.cancel().catch(() => undefined)
          throw new GatewayError(response.status === 428 ? 'verification-required' : response.status === 429 ? 'rate-limited' : response.status >= 500 ? 'dependency' : 'http', response.status, turnId, code)
        }
        return await responseObject(response, path.startsWith('/auth/') ? GATEWAY_JSON_LIMIT : correctionRoute.test(path) ? path.includes('/memories/') ? 256 * 1024 : GATEWAY_JSON_LIMIT : path === '/api/pi/sessions/history' ? GATEWAY_HISTORY_LIMIT : codexSessionsRoute.test(path) ? path === codexSessionsPath ? 2 * 1024 * 1024 : GATEWAY_JSON_LIMIT : nativeSessionsRoute.test(path) ? path === '/api/host/claude/sessions' ? 1024 * 1024 : path.endsWith('/output') ? 512 * 1024 : GATEWAY_JSON_LIMIT : characterResponseRoute.test(path) ? GATEWAY_CHARACTER_LIMIT : GATEWAY_RESPONSE_LIMIT)
      } catch (error) {
        if (error instanceof GatewayError) throw error
        if (!options.signal?.aborted) reportReachability(false)
        throw new GatewayError(options.signal?.aborted ? 'aborted' : 'network')
      }
    },
  }
}
