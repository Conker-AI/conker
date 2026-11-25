/**
 * Text or a link shared to Conker from another app (the manifest's share target opens `/share`).
 * What was shared moves out of the address into this tab's session storage, so it survives the
 * sign-in and never stays in the history; it is dropped once it is saved or cancelled.
 */
export const SHARE_PATH = '/share'
export const SHARE_KEY = 'conker.share'
/** Pi's `POST /memory/remember` keeps at most this many characters (pi/memory/stated.py). */
export const SHARE_LIMIT = 2000
/** Far past the limit, so a long share is still shown as too long, but never stored without bound. */
const FIELD_LIMIT = 20_000
const FIELDS = ['title', 'text', 'url'] as const

export type SharedItem = { title: string; text: string; url: string }
export type ShareStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type Address = { pathname: string; search: string; hash: string }

const clean = (value: unknown) => (typeof value === 'string' ? value.replaceAll('\u0000', '').trim().slice(0, FIELD_LIMIT) : '')
const path = (value: string) => (value.length > 1 ? value.replace(/\/+$/, '') : value)

/** What the share target put in the address, or null when nothing was shared there. */
export function readShared(search: string): SharedItem | null {
  const params = new URLSearchParams(search)
  if (!FIELDS.some(name => params.has(name))) return null
  return { title: clean(params.get('title')), text: clean(params.get('text')), url: clean(params.get('url')) }
}

/** The item kept in this tab, or null when there is none or it cannot be read. */
export function loadShared(storage: ShareStorage | null): SharedItem | null {
  try {
    const value: unknown = JSON.parse(storage?.getItem(SHARE_KEY) ?? 'null')
    if (!value || typeof value !== 'object') return null
    const item = value as Record<string, unknown>
    if (!FIELDS.every(name => typeof item[name] === 'string')) return null
    return { title: clean(item.title), text: clean(item.text), url: clean(item.url) }
  } catch {
    return null
  }
}

export function clearShared(storage: ShareStorage | null) {
  try {
    storage?.removeItem(SHARE_KEY)
  } catch {
    /* Storage may be blocked; nothing was kept then. */
  }
}

/**
 * On the share page only: keep what was shared in this tab and take it out of the address. When the
 * tab cannot keep it, the address keeps it instead, so nothing shared is ever lost.
 */
export function takeShared(address: Address, base: string, storage: ShareStorage | null, replace: (url: string) => void): SharedItem | null {
  if (path(address.pathname) !== `${base.replace(/\/+$/, '')}${SHARE_PATH}`) return null
  const item = readShared(address.search)
  if (!item || !storage) return null
  try {
    storage.setItem(SHARE_KEY, JSON.stringify(item))
  } catch {
    return null
  }
  const rest = new URLSearchParams(address.search)
  for (const name of FIELDS) rest.delete(name)
  replace(`${address.pathname}${rest.size ? `?${rest}` : ''}${address.hash}`)
  return item
}

/** One plain text to save: the title, the text and the link, each once and in that order. */
export function sharedText({ title, text, url }: SharedItem): string {
  const parts: string[] = []
  if (title && !text.startsWith(title) && title !== url) parts.push(title)
  if (text) parts.push(text)
  if (url && !text.includes(url)) parts.push(url)
  return parts.join('\n')
}
