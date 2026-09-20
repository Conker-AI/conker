import { GatewayError, gatewayError, type GatewayRequest, type GatewayTransport } from './transport'

export type GatewaySession = { authenticated: boolean; sessionId: string; expiresAt: number; setupRequired: boolean }
type PrivateSession = GatewaySession & { csrfToken: string }
export type GatewayAuthClient = ReturnType<typeof createGatewayAuthClient>
export function createGatewayAuthClient({ transport, now = () => Date.now() / 1000 }: { transport: GatewayTransport; now?: () => number }) {
  let session: PrivateSession | null = null
  let generation = 0
  let queue: Promise<unknown> = Promise.resolve()
  let bootstrapFlight: Promise<GatewaySession> | null = null
  const listeners = new Set<() => void>()
  const publish = () => { for (const listener of listeners) listener() }
  const clear = () => { generation++; session = null; publish() }
  const publicSession = (): GatewaySession | null => session ? { authenticated: session.authenticated, sessionId: session.sessionId, expiresAt: session.expiresAt, setupRequired: session.setupRequired } : null
  const serial = <T>(action: () => Promise<T>): Promise<T> => {
    const next = queue.then(action, action)
    queue = next.catch(() => undefined)
    return next
  }
  function parse(value: Record<string, unknown>, login = false): PrivateSession {
    const { authenticated, session_id, expires_at, csrf_token } = value
    const setup_required = login ? false : value.setup_required
    if (typeof authenticated !== 'boolean' || typeof setup_required !== 'boolean' || (authenticated && setup_required) ||
      (login && authenticated !== true) || typeof session_id !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(session_id) ||
      typeof csrf_token !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(csrf_token) ||
      typeof expires_at !== 'number' || !Number.isFinite(expires_at) || expires_at <= now() || expires_at > now() + 86_460) throw new GatewayError('invalid-response')
    return { authenticated, sessionId: session_id, expiresAt: expires_at, csrfToken: csrf_token, setupRequired: setup_required }
  }
  async function readSession(): Promise<GatewaySession> {
    try {
      const next = parse(await transport.request('/auth/session'))
      if (next.sessionId !== session?.sessionId || next.csrfToken !== session?.csrfToken) generation++
      session = next
      publish()
      return publicSession()!
    } catch (error) { clear(); throw gatewayError(error) }
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
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    bootstrap(): Promise<GatewaySession> {
      if (bootstrapFlight) return bootstrapFlight
      bootstrapFlight = serial(readSession).finally(() => { bootstrapFlight = null })
      return bootstrapFlight
    },
    revalidate(): Promise<GatewaySession> { return serial(readSession) },
    login(password: string): Promise<GatewaySession> {
      return serial(async () => {
        if (typeof password !== 'string' || [...password].length < 15 || [...password].length > 1024) throw new GatewayError('validation')
        if (!session || session.expiresAt <= now()) await readSession()
        if (session!.setupRequired) throw new GatewayError('validation')
        if (session!.authenticated) return publicSession()!
        const previous = session!
        try {
          const next = parse(await transport.request('/auth/login', { method: 'POST', body: { password }, csrfToken: previous.csrfToken }), true)
          if (next.sessionId === previous.sessionId || next.csrfToken === previous.csrfToken) throw new GatewayError('invalid-response')
          session = next
          generation++
          publish()
          return publicSession()!
        } catch (error) {
          // The server may already have rotated its cookie. Do not retain old CSRF or retry a password.
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
      return serial(async () => {
        // An earlier logout may have failed before revocation. Explicit retries recheck the cookie.
        if (!session || session.expiresAt <= now()) await readSession()
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
      const ticket = await serial(async () => {
        // Authentication endpoints belong to the methods above; callers cannot bypass rotation handling.
        if (!path.startsWith('/api/') && path !== '/health') throw new GatewayError('validation')
        if (!session || session.expiresAt <= now()) { clear(); await readSession() }
        if (!session?.authenticated) throw new GatewayError('browser-expired')
        return { generation, sessionId: session.sessionId, csrfToken: session.csrfToken }
      })
      // Slow turns must not block logout or session verification. Never surface results from an old session.
      const current = () => ticket.generation === generation && ticket.sessionId === session?.sessionId && session.authenticated && session.expiresAt > now()
      if (!current()) throw new GatewayError('session-changed')
      try {
        const value = await transport.request(path, { ...options, csrfToken: ticket.csrfToken })
        if (!current()) throw new GatewayError('session-changed')
        return value
      } catch (error) {
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
