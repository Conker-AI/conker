/**
 * Installs the service worker (public/sw.js) in production builds: a fast start from the build files
 * and a plain offline page. Development never registers it, so hot reload always serves fresh code.
 */
export function registerServiceWorker(base: string, view: Window = window) {
  const workers = view.navigator.serviceWorker
  if (!workers || !view.isSecureContext) return
  const register = () => {
    // The app works the same without it; only the fast start and the offline page are missing.
    workers.register(`${base}sw.js`, { scope: base }).catch((error: unknown) => {
      console.warn('Conker could not install its offline support.', error)
    })
  }
  if (view.document.readyState === 'complete') register()
  else view.addEventListener('load', register, { once: true })
}

/**
 * Web push for this browser (docs/web-push.md in Pi). Nothing here runs until the owner turns on
 * "Notifications on this device" in Settings: the permission prompt and the subscription happen
 * only after that tap, never on load.
 */
export type PushSupport = 'ok' | 'insecure' | 'unsupported' | 'blocked'
export type PushKeys = { endpoint: string; keys: { p256dh: string; auth: string } }
export type PushDevice = {
  /** What this browser allows before anything is asked. */
  support(): PushSupport
  /** This browser's subscription and its device id (as the gateway names it), or null. */
  current(): Promise<{ id: string; endpoint: string } | null>
  /** Asks for permission, then subscribes with the server's public key. */
  subscribe(publicKey: string): Promise<PushKeys>
  /** This browser's subscription made with this server key, when notifications are already
   * allowed; null otherwise. Never asks and never subscribes. */
  existing(publicKey: string): Promise<PushKeys | null>
  unsubscribe(): Promise<void>
}

/** The browser said no (`blocked`) or closed the prompt (`dismissed`); nothing was subscribed. */
export class PushRefused extends Error {
  readonly reason: 'blocked' | 'dismissed' | 'no-worker'
  constructor(reason: 'blocked' | 'dismissed' | 'no-worker') {
    super(reason)
    this.name = 'PushRefused'
    this.reason = reason
  }
}

function key(text: string): Uint8Array<ArrayBuffer> {
  const raw = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4))
  return Uint8Array.from(raw, character => character.charCodeAt(0))
}

function sameKey(value: ArrayBuffer | null | undefined, publicKey: string) {
  if (!value) return false
  const want = key(publicKey),
    have = new Uint8Array(value)
  return have.length === want.length && have.every((byte, index) => byte === want[index])
}

/** The gateway's id for a device: the first 32 hex digits of the SHA-256 of its endpoint. */
export async function pushDeviceId(endpoint: string, view: Window = window) {
  const digest = new Uint8Array(await view.crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint)))
  return Array.from(digest.slice(0, 16), byte => byte.toString(16).padStart(2, '0')).join('')
}

/** The window parts web push needs; the real window by default. */
export type PushWindow = Window & Pick<typeof globalThis, 'Notification'>

function keysOf(value: PushSubscription): PushKeys {
  const json = value.toJSON()
  return { endpoint: value.endpoint, keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' } }
}

export function browserPush(base: string, view: PushWindow = window): PushDevice {
  const registration = async () => (await view.navigator.serviceWorker?.getRegistration(base)) ?? null
  const subscription = async () => (await registration())?.pushManager.getSubscription() ?? null
  const support = (): PushSupport => {
    if (!view.isSecureContext) return 'insecure'
    if (!view.navigator.serviceWorker || !('PushManager' in view) || !('Notification' in view)) return 'unsupported'
    return view.Notification.permission === 'denied' ? 'blocked' : 'ok'
  }
  return {
    support,
    async current() {
      const value = await subscription()
      return value ? { id: await pushDeviceId(value.endpoint, view), endpoint: value.endpoint } : null
    },
    async subscribe(publicKey) {
      const permission = await view.Notification.requestPermission()
      if (permission !== 'granted') throw new PushRefused(permission === 'denied' ? 'blocked' : 'dismissed')
      const worker = await registration()
      // Conker's service worker installs only from a trusted HTTPS address (production builds).
      if (!worker) throw new PushRefused('no-worker')
      let value = await worker.pushManager.getSubscription()
      if (value && !sameKey(value.options.applicationServerKey, publicKey)) {
        await value.unsubscribe()
        value = null
      }
      value ??= await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(publicKey) })
      return keysOf(value)
    },
    async existing(publicKey) {
      if (support() !== 'ok' || view.Notification.permission !== 'granted') return null
      const value = await subscription()
      return value && sameKey(value.options.applicationServerKey, publicKey) ? keysOf(value) : null
    },
    async unsubscribe() {
      await (await subscription())?.unsubscribe()
    },
  }
}

let shared: PushDevice | undefined
/** This browser's push, made once per page. */
export const thisBrowserPush = (): PushDevice => (shared ??= browserPush(import.meta.env.BASE_URL))

/** The gateway calls `renewPush` makes (lib/gateway/push.ts). */
export type PushRenewClient = {
  state(): Promise<{ publicKey: string; devices: readonly { id: string }[] }>
  renew(keys: PushKeys): Promise<unknown>
}

/**
 * The gateway ties a device to the sign-in that last sent it, and every sign-in has a new id. So
 * after each sign-in, and when Settings opens, this browser sends its subscription again and the
 * device moves to the current sign-in: signing out here then turns it off. Only for a device the
 * server still lists, with notifications already allowed and a subscription made with the server's
 * key; it never asks and never subscribes, and the server never turns a device on for a renewal.
 */
export async function renewPush(client: PushRenewClient, push: PushDevice, known?: Awaited<ReturnType<PushRenewClient['state']>>): Promise<boolean> {
  if (push.support() !== 'ok') return false
  const current = await push.current()
  if (!current) return false
  const state = known ?? (await client.state())
  if (!state.devices.some(row => row.id === current.id)) return false
  const keys = await push.existing(state.publicKey)
  if (!keys) return false
  await client.renew(keys)
  return true
}

type Phase = { phase: string }
/** Calls `renew` each time the owner becomes signed in: a sign-in, or a page opened signed in. */
export function renewAfterSignIn(store: { subscribe(listener: (state: Phase, previous: Phase) => void): () => void }, renew: () => Promise<unknown>) {
  return store.subscribe((state, previous) => {
    if (state.phase === 'authenticated' && previous.phase !== 'authenticated') void renew().catch(() => undefined)
  })
}
