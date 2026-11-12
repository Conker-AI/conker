/**
 * Which chats were opened in this browser, newest first, so Home's "Jump back in" can offer the last
 * ones. Pi records when a chat was made, not when it was last read, so only this browser knows.
 * Ids and times only, never a title or text: Home shows a chat only when Pi still lists it, so a
 * forgotten or trashed chat cannot come back from here. A convenience: losing it loses nothing.
 */
const KEY = 'conker.recent-chats'
const ID = /^[A-Za-z0-9_-]{1,128}$/
/** More than Home shows, so chats Pi no longer lists can drop out without emptying the row. */
export const RECENT_CHATS_LIMIT = 12

export type OpenedChat = { id: string; at: number }

export function readOpenedChats(): OpenedChat[] {
  try {
    const value: unknown = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.filter((item): item is OpenedChat => !!item && typeof item === 'object' && typeof item.id === 'string' && ID.test(item.id)
      && typeof item.at === 'number' && Number.isFinite(item.at) && item.at > 0).slice(0, RECENT_CHATS_LIMIT)
  } catch { return [] }
}

export function rememberOpenedChat(id: string, at = Date.now()) {
  if (!ID.test(id)) return
  const next = [{ id, at }, ...readOpenedChats().filter(item => item.id !== id)].slice(0, RECENT_CHATS_LIMIT)
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(next)) }
  catch { /* Private windows and blocked storage: Home falls back to the newest chats. */ }
}
