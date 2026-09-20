import { createStore } from 'zustand/vanilla'
import type { GatewayAuthClient, GatewaySession } from './auth'
import { GatewayError, gatewayError } from './transport'

export type GatewayAuthState = {
  phase: 'checking' | 'anonymous' | 'setup-required' | 'authenticated' | 'error'
  session: GatewaySession | null
  pending: boolean
  error: GatewayError | null
  logoutUnconfirmed: boolean
  bootstrap: () => Promise<boolean>
  revalidate: () => Promise<boolean>
  login: (password: string) => Promise<boolean>
  logout: () => Promise<boolean>
}
export type GatewayAuthStore = ReturnType<typeof createGatewayAuthStore>
export function createGatewayAuthStore({ client }: { client: GatewayAuthClient }) {
  let operations = 0
  let latest = 0
  let flight: Promise<boolean> | null = null
  const visible = (session: GatewaySession | null): Pick<GatewayAuthState, 'phase' | 'session'> => ({
    phase: !session ? 'error' : session.setupRequired ? 'setup-required' : session.authenticated ? 'authenticated' : 'anonymous', session,
  })
  const store = createStore<GatewayAuthState>(() => ({
    phase: 'checking', session: null, pending: false, error: null, logoutUnconfirmed: false,
    bootstrap: () => {
      if (flight) return flight
      flight = run(() => client.bootstrap()).finally(() => { flight = null })
      return flight
    },
    revalidate: () => run(() => client.revalidate()),
    login: password => run(() => client.login(password)),
    logout: () => run(async () => { await client.logout(); return null }, true),
  }))
  async function run(action: () => Promise<GatewaySession | null>, logout = false): Promise<boolean> {
    const id = ++latest
    operations++
    store.setState({ phase: 'checking', session: null, pending: true, error: null })
    try {
      const session = await action()
      if (id === latest) store.setState(logout
        ? { phase: 'anonymous', session: null, error: null, logoutUnconfirmed: false }
        : { ...visible(session), error: null })
      return true
    } catch (error) {
      if (id === latest) {
        const failure = gatewayError(error)
        const session = client.getSession()
        store.setState({ ...(!logout && session && !session.authenticated ? visible(session) : { phase: 'error' as const, session: null }), error: failure, logoutUnconfirmed: logout || store.getState().logoutUnconfirmed })
      }
      return false
    } finally {
      operations--
      if (id === latest) store.setState({ pending: operations > 0 })
    }
  }
  // Auth client owns session changes from runtime authorization failures as well as explicit actions.
  const unsubscribe = client.subscribe(() => {
    if (operations) return
    const session = client.getSession()
    store.setState({ ...visible(session), error: !session ? new GatewayError('verification-failed') : session.authenticated ? null : new GatewayError('browser-expired') })
  })
  return Object.assign(store, { dispose: unsubscribe })
}
