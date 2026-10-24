import { createStore } from 'zustand/vanilla'

/** The transport reports every answer or network failure here (see transport.ts). */
export const GATEWAY_REACHABILITY_EVENT = 'conker:gateway-reachability'

export type ConnectionState = {
  /** The browser's own view: false means no network at all. */
  online: boolean
  /** Whether the last request reached the Conker server. Any HTTP answer counts as reached. */
  gateway: 'unknown' | 'reachable' | 'unreachable'
  /** Increments each time the server becomes reachable again, so loads can refresh themselves. */
  recoveries: number
}

export const connectionStore = createStore<ConnectionState>(() => ({
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  gateway: 'unknown',
  recoveries: 0,
}))

export function reportGatewayReachable(reachable: boolean) {
  connectionStore.setState(state => {
    if (reachable) return state.gateway === 'unreachable' ? { gateway: 'reachable', recoveries: state.recoveries + 1 } : state.gateway === 'reachable' ? state : { gateway: 'reachable' }
    return state.gateway === 'unreachable' ? state : { gateway: 'unreachable' }
  })
}

let watching = false

/** Follows the browser's online state and the transport's reports. Safe to call more than once. */
export function watchConnection() {
  if (watching || typeof window === 'undefined') return
  watching = true
  window.addEventListener('online', () => connectionStore.setState({ online: true }))
  window.addEventListener('offline', () => connectionStore.setState({ online: false }))
  window.addEventListener(GATEWAY_REACHABILITY_EVENT, event => {
    if (event instanceof CustomEvent && typeof event.detail === 'boolean') reportGatewayReachable(event.detail)
  })
}
