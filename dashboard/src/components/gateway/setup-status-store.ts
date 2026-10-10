import type { GatewayControlClient, SetupStatus } from '@/lib/gateway/control'

export type SetupRead = { status: SetupStatus | null; error: boolean; refreshing: boolean }
export const emptySetupRead: SetupRead = { status: null, error: false, refreshing: false }
export const setupRefreshEvent = 'conker:setup-status-refresh'
export const setupRefreshCooldown = 30_000
type Client = Pick<GatewayControlClient, 'setupStatus'>
const stores = new WeakMap<Client, ReturnType<typeof createSetupStatusStore>>()

/** One evidence read per client. Leaving the authenticated workspace retires every cached result. */
export function createSetupStatusStore(client: Client, now: () => number = Date.now) {
  let snapshot = emptySetupRead, generation = 0, lastAttempt = -Infinity
  let request: AbortController | null = null
  const listeners = new Set<() => void>()
  const publish = (value: SetupRead) => { snapshot = value; listeners.forEach(listener => listener()) }
  const visible = () => document.visibilityState === 'visible'
  function refresh(reason: 'automatic' | 'entry' | 'manual' = 'manual') {
    if (!listeners.size || !visible()) return
    if (reason !== 'manual' && request || reason === 'automatic' && now() - lastAttempt < setupRefreshCooldown) return
    request?.abort()
    const controller = new AbortController(), ticket = ++generation
    request = controller; lastAttempt = now()
    publish({ ...snapshot, refreshing: true })
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return
      return client.setupStatus(controller.signal)
    }).then(value => {
      if (value && !controller.signal.aborted && ticket === generation && listeners.size) publish({ status: value, error: false, refreshing: false })
    }).catch(() => {
      if (!controller.signal.aborted && ticket === generation && listeners.size) publish({ ...snapshot, error: true, refreshing: false })
    }).finally(() => { if (request === controller) request = null })
  }
  const automatic = () => refresh('automatic')
  const manual = () => refresh()
  return {
    getSnapshot: () => snapshot,
    refresh: manual,
    enter: () => refresh('entry'),
    subscribe(listener: () => void) {
      listeners.add(listener)
      if (listeners.size === 1) {
        window.addEventListener('focus', automatic); window.addEventListener('online', automatic)
        window.addEventListener(setupRefreshEvent, manual); document.addEventListener('visibilitychange', automatic)
        queueMicrotask(automatic)
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size) return
        generation++; request?.abort(); request = null; snapshot = emptySetupRead; lastAttempt = -Infinity
        window.removeEventListener('focus', automatic); window.removeEventListener('online', automatic)
        window.removeEventListener(setupRefreshEvent, manual); document.removeEventListener('visibilitychange', automatic)
      }
    },
  }
}

export function setupStatusStore(client: Client) {
  let store = stores.get(client)
  if (!store) { store = createSetupStatusStore(client); stores.set(client, store) }
  return store
}
