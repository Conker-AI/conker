import { takeShared } from '@/lib/share-capture'

/** This tab's session storage, or null where the browser blocks it. */
export function shareStorage(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/** Before React starts (and before any sign-in): move a share out of the address into this tab. */
export function keepSharedItem() {
  takeShared(window.location, import.meta.env.VITE_BASENAME || '', shareStorage(), url => window.history.replaceState(window.history.state, '', url))
}
