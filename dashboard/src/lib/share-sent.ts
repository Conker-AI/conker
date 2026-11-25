import { SHARE_KEY, SHARE_LIMIT, type ShareStorage } from './share-capture'

/**
 * What a save of shared text sent: the exact text (never trimmed) and its request id. It is kept
 * in the share's own storage item before each try, so a reload after an unknown outcome sends the
 * same request (Pi saves it once) and a new share replaces it. Only the share screen loads this,
 * so it stays out of the first bundle.
 */
export type ShareSent = { text: string; requestId: string }

const REQUEST_ID = /^[A-Za-z0-9_-]{16,128}$/

/** The last try kept in this tab, or null when there is none or it cannot be read. */
export function readSent(storage: ShareStorage | null): ShareSent | null {
  try {
    const value: unknown = JSON.parse(storage?.getItem(SHARE_KEY) ?? 'null')
    if (!value || typeof value !== 'object') return null
    const { sent, requestId } = value as Record<string, unknown>
    if (typeof sent !== 'string' || !sent.trim() || sent.length > SHARE_LIMIT) return null
    return typeof requestId === 'string' && REQUEST_ID.test(requestId) ? { text: sent, requestId } : null
  } catch {
    return null
  }
}

/** Before a save is sent. The share's `text` is the sent text too, so an older reader shows it. */
export function keepSent(storage: ShareStorage | null, { text, requestId }: ShareSent) {
  try {
    storage?.setItem(SHARE_KEY, JSON.stringify({ title: '', text, url: '', sent: text, requestId }))
  } catch {
    /* Storage may be blocked; a retry in this tab still sends the same request. */
  }
}
