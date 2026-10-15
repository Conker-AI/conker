export type PendingDraftStart = { requestId: string; revision: number; identity: string }
const KEY = 'conker.pending-draft-start.v1'
/** Recovery metadata only. Never put draft text, model choices, or privacy settings here. */
export function readDraftStart(identity: string): PendingDraftStart | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) ?? 'null')
    if (value === null) return null
    if (!value || value.identity !== identity || typeof value.requestId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(value.requestId) || !Number.isSafeInteger(value.revision) || value.revision < 1 || Object.keys(value).some(key => !['requestId', 'revision', 'identity'].includes(key))) { sessionStorage.removeItem(KEY); return null }
    return { requestId: value.requestId, revision: value.revision, identity }
  } catch { return null }
}
export function rememberDraftStart(value: PendingDraftStart) { sessionStorage.setItem(KEY, JSON.stringify({ requestId: value.requestId, revision: value.revision, identity: value.identity })) }
export function clearDraftStart() { try { sessionStorage.removeItem(KEY) } catch { /* Storage can be disabled by browser policy. */ } }
