/**
 * Which request a Tools draft came from, so publishing it can tell Conker (and the chat that asked)
 * that the tool is live. The Inbox puts it in the editor's address (`?request=`); this browser also
 * remembers it, so opening the draft later from the drafts list still knows. A convenience only:
 * losing it means the chat is not told, never that anything else changes.
 */
const KEY = 'conker.tool-draft-origins'
const REQUEST = /^creq_[0-9a-f]{32}$/
const DRAFT = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/
const LIMIT = 50

function read(): Record<string, string> {
  try {
    const value: unknown = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter(([draft, request]) => DRAFT.test(draft) && typeof request === 'string' && REQUEST.test(request)))
  } catch { return {} }
}

function write(origins: Record<string, string>) {
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(Object.fromEntries(Object.entries(origins).slice(-LIMIT)))) }
  catch { /* Private windows and blocked storage: the address still carries the request. */ }
}

export function rememberDraftOrigin(draftId: string, requestId: string) {
  if (!DRAFT.test(draftId) || !REQUEST.test(requestId)) return
  const origins = read()
  delete origins[draftId]
  write({ ...origins, [draftId]: requestId })
}

/** The request in the address wins; otherwise what this browser remembers, or null. */
export function draftOrigin(draftId: string, fromAddress?: string | null): string | null {
  if (fromAddress && REQUEST.test(fromAddress)) return fromAddress
  return read()[draftId] ?? null
}

export function forgetDraftOrigin(draftId: string) {
  const origins = read()
  if (!(draftId in origins)) return
  delete origins[draftId]
  write(origins)
}
