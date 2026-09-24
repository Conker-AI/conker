import { GatewayError, gatewayError, isConversationWrite, snapshotGatewayOperation, type GatewayRequest, type GatewayTransport } from './transport'
import { describeGatewayOperation, type GatewayVerificationPrompt } from './verification'

export type GatewaySession = { authenticated: boolean; sessionId: string; expiresAt: number; unlockExpiresAt: number | null; setupRequired: boolean }
type PrivateSession = GatewaySession & { csrfToken: string }
export type GatewayAuthClient = ReturnType<typeof createGatewayAuthClient>
export function createGatewayAuthClient({ transport, verification, now = () => Date.now() / 1000 }: { transport: GatewayTransport; verification?: GatewayVerificationPrompt; now?: () => number }) {
  let session: PrivateSession | null = null
  let generation = 0
  let queue: Promise<unknown> = Promise.resolve()
  let bootstrapFlight: Promise<GatewaySession> | null = null
  const listeners = new Set<() => void>()
  const publish = () => { for (const listener of listeners) listener() }
  const clear = () => { generation++; session = null; verification?.cancelAll(); publish() }
  const publicSession = (): GatewaySession | null => session ? { authenticated: session.authenticated, sessionId: session.sessionId, expiresAt: session.expiresAt, unlockExpiresAt: session.unlockExpiresAt, setupRequired: session.setupRequired } : null
  const unlocked = () => !!session?.authenticated && session.expiresAt > now() && session.unlockExpiresAt !== null && session.unlockExpiresAt > now()
  const serial = <T>(action: () => Promise<T>): Promise<T> => {
    const next = queue.then(action, action)
    queue = next.catch(() => undefined)
    return next
  }
  function parse(value: Record<string, unknown>, login = false): PrivateSession {
    const { authenticated, session_id, expires_at, unlock_expires_at, csrf_token } = value
    const setup_required = login ? false : value.setup_required
    if (typeof authenticated !== 'boolean' || typeof setup_required !== 'boolean' || (authenticated && setup_required) ||
      (login && authenticated !== true) || typeof session_id !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(session_id) ||
      typeof csrf_token !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(csrf_token) ||
      typeof expires_at !== 'number' || !Number.isFinite(expires_at) || expires_at <= now() || expires_at > now() + 86_460 ||
      (authenticated ? typeof unlock_expires_at !== 'number' || !Number.isFinite(unlock_expires_at) || unlock_expires_at <= now() || unlock_expires_at > expires_at : unlock_expires_at !== null)) throw new GatewayError('invalid-response')
    return { authenticated, sessionId: session_id, expiresAt: expires_at, unlockExpiresAt: unlock_expires_at as number | null, csrfToken: csrf_token, setupRequired: setup_required }
  }
  async function readSession(): Promise<GatewaySession> {
    const started = generation
    try {
      const next = parse(await transport.request('/auth/session'))
      if (started !== generation) throw new GatewayError('browser-expired')
      if (next.sessionId !== session?.sessionId || next.csrfToken !== session?.csrfToken) { generation++; verification?.cancelAll() }
      session = next
      publish()
      return publicSession()!
    } catch (error) { if (started === generation) clear(); throw gatewayError(error) }
  }
  async function classifyDenied(error: unknown): Promise<never> {
    const failure = gatewayError(error)
    if (failure.status !== 401 && failure.status !== 403) throw failure
    clear()
    let checked: GatewaySession
    try { checked = await readSession() } catch { throw new GatewayError('verification-failed', failure.status) }
    throw new GatewayError(checked.authenticated ? 'upstream-denied' : 'browser-expired', failure.status)
  }
  const client = {
    getSession: publicSession,
    lock: clear,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    bootstrap(): Promise<GatewaySession> {
      if (bootstrapFlight) return bootstrapFlight
      bootstrapFlight = serial(readSession).finally(() => { bootstrapFlight = null })
      return bootstrapFlight
    },
    revalidate(): Promise<GatewaySession> { return serial(readSession) },
    login(password: string): Promise<GatewaySession> {
      return serial(async () => {
        // Password creation policy belongs to the host; authenticate existing credentials unchanged.
        if (typeof password !== 'string' || !password.length || [...password].length > 1024) throw new GatewayError('validation')
        if (!session || session.expiresAt <= now() || session.authenticated && !unlocked()) await readSession()
        if (session!.setupRequired) throw new GatewayError('validation')
        if (session!.authenticated) return publicSession()!
        const previous = session!
        const started = generation
        try {
          const next = parse(await transport.request('/auth/login', { method: 'POST', body: { password }, csrfToken: previous.csrfToken }), true)
          if (started !== generation) throw new GatewayError('browser-expired')
          if (next.sessionId === previous.sessionId || next.csrfToken === previous.csrfToken) throw new GatewayError('invalid-response')
          session = next
          generation++
          publish()
          return publicSession()!
        } catch (error) {
          // The server may already have rotated its cookie. Do not retain old CSRF or retry a password.
          if (started !== generation) throw new GatewayError('browser-expired')
          clear()
          const failure = gatewayError(error)
          if (failure.status === 401 || failure.status === 403) {
            try { await readSession() } catch { throw new GatewayError('verification-failed', failure.status) }
          }
          throw failure
        }
      })
    },
    logout(): Promise<void> {
      verification?.cancelAll()
      return serial(async () => {
        // An earlier logout may have failed before revocation. Explicit retries recheck the cookie.
        if (!session || session.expiresAt <= now() || session.authenticated && !unlocked()) await readSession()
        const previous = session
        clear()
        // A lost logout acknowledgement can leave an anonymous cookie on explicit recheck.
        if (previous && !previous.authenticated) return
        if (!previous || previous.expiresAt <= now()) throw new GatewayError('browser-expired')
        const value = await transport.request('/auth/logout', { method: 'POST', csrfToken: previous.csrfToken })
        if (value.authenticated !== false) throw new GatewayError('invalid-response')
      })
    },
    async request(path: string, options: GatewayRequest = {}): Promise<Record<string, unknown>> {
      const post = options.method === 'POST'
      if (post && options.query !== undefined) throw new GatewayError('validation')
      const operation = post ? snapshotGatewayOperation(path, options.body) : null
      const signal = options.signal
      if (post && signal?.aborted) throw new GatewayError('verification-cancelled')
      const ticket = await serial(async () => {
        // Authentication endpoints belong to the methods above; callers cannot bypass rotation handling.
        if (!path.startsWith('/api/') && path !== '/health') throw new GatewayError('validation')
        if (!session || session.expiresAt <= now() || session.authenticated && !unlocked()) { clear(); await readSession() }
        if (!unlocked()) throw new GatewayError('browser-expired')
        return { generation, sessionId: session!.sessionId, csrfToken: session!.csrfToken }
      })
      // Slow turns must not block logout or session verification. Never surface results from an old session.
      const current = () => ticket.generation === generation && ticket.sessionId === session?.sessionId && unlocked()
      if (!current()) throw new GatewayError(post ? 'verification-cancelled' : 'session-changed')
      let verificationToken: string | undefined
      if (operation && !isConversationWrite(path)) {
        if (!verification) throw new GatewayError('verification-required')
        verificationToken = await verification.request(describeGatewayOperation(operation), async (password, verificationSignal) => {
          if (!current() || signal?.aborted) throw new GatewayError('verification-cancelled')
          let response: Record<string, unknown>
          try {
            response = await transport.request('/auth/verify', { method: 'POST', body: { password, operation }, csrfToken: ticket.csrfToken, signal: verificationSignal })
          } catch (error) {
            if (!current() || signal?.aborted || verificationSignal.aborted) throw new GatewayError('verification-cancelled')
            const failure = gatewayError(error)
            if (failure.status === 401 || failure.status === 403) {
              // A wrong verification password must not erase an otherwise valid owner's draft.
              await serial(readSession)
              if (!current()) throw new GatewayError('verification-cancelled')
              throw new GatewayError('verification-password', failure.status)
            }
            throw failure
          }
          if (!current() || signal?.aborted || verificationSignal.aborted) throw new GatewayError('verification-cancelled')
          const token = response.verification_token, expiry = response.verification_expires_at, deadline = response.unlock_expires_at
          if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token) || typeof expiry !== 'number' || !Number.isFinite(expiry) || expiry <= now() || expiry > now() + 125 ||
            typeof deadline !== 'number' || !Number.isFinite(deadline) || deadline <= now() || deadline > session!.expiresAt || expiry > deadline) throw new GatewayError('invalid-response')
          session = { ...session!, unlockExpiresAt: deadline }
          publish()
          return token
        }, signal)
        if (!current() || signal?.aborted) throw new GatewayError('verification-cancelled')
      }
      try {
        // The proof is supplied once, only on the frozen operation it authorized. No replay on failure.
        const value = await transport.request(path, { ...options, ...(operation ? { body: operation.body, verificationToken } : {}), csrfToken: ticket.csrfToken })
        verificationToken = undefined
        if (!current()) throw new GatewayError('session-changed')
        return value
      } catch (error) {
        verificationToken = undefined
        if (gatewayError(error).kind === 'verification-required') throw error
        if (!current()) throw new GatewayError('session-changed')
        return serial(async () => {
          if (!current()) throw new GatewayError('session-changed')
          return classifyDenied(error)
        })
      }
    },
  }
  return client
}
