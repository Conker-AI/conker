import type { GatewayAuthState, GatewayAuthStore } from '@/lib/gateway/auth-store'

type ResettableWorkspace = { getState: () => { reset: () => void } }
/** Keep private drafts only across verification of the same authenticated browser identity. */
export function bindGatewayWorkspaceReset(auth: GatewayAuthStore, workspaces: ResettableWorkspace[]) {
  let ownerSession: string | null = null
  const apply = (state: GatewayAuthState) => {
    if (state.phase === 'checking' && !state.logoutUnconfirmed) return
    const next = state.phase === 'authenticated' && state.session?.authenticated && !state.session.setupRequired && !state.logoutUnconfirmed ? state.session.sessionId : null
    if (next !== ownerSession || next === null) for (const workspace of workspaces) workspace.getState().reset()
    ownerSession = next
  }
  apply(auth.getState())
  return auth.subscribe(apply)
}
