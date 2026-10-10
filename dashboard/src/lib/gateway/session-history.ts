import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

export type HistoryChat = {
  id: string; parentId: string | null; title: string; status: 'open' | 'forked' | 'closed' | 'forgotten'
  createdAt: string; closedAt: string | null; summaryPreview: string | null
  forgotten: boolean; titleTruncated: boolean; summaryTruncated: boolean
}
export type HistoryPage = { rows: HistoryChat[]; nextCursor: string | null }
export type HistoryQuery = { q?: string; cursor?: string; limit?: number; signal?: AbortSignal }
const identifier = /^[A-Za-z0-9_-]{1,128}$/
const cursorPattern = /^h1\.[a-f0-9]{64}\.[A-Za-z0-9_-]{1,128}$/
const bad = (): never => { throw new GatewayError('invalid-response') }
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : bad()
const text = (value: unknown, max: number): string => typeof value === 'string' && [...value].length <= max ? value : bad()
const id = (value: unknown): string => typeof value === 'string' && identifier.test(value) ? value : bad()
function date(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return bad()
  const date = new Date(value * 1000)
  return Number.isFinite(date.getTime()) ? date.toISOString() : bad()
}
function chat(value: unknown): HistoryChat {
  const row = object(value)
  if (typeof row.status !== 'string' || !['open', 'forked', 'closed', 'forgotten'].includes(row.status) || typeof row.content_status !== 'string' || !['available', 'forgotten'].includes(row.content_status) || typeof row.title_truncated !== 'boolean' || typeof row.summary_truncated !== 'boolean') return bad()
  const title = text(row.title, 300), summaryPreview = row.summary_preview === null ? null : text(row.summary_preview, 400)
  const forgotten = row.content_status === 'forgotten'
  if (forgotten !== (row.status === 'forgotten') || forgotten && (title !== '' || summaryPreview !== null || row.title_truncated || row.summary_truncated) || summaryPreview === null && row.summary_truncated) return bad()
  return { id: id(row.id), parentId: row.parent_id === null ? null : id(row.parent_id), title, status: row.status as HistoryChat['status'], createdAt: date(row.created_at), closedAt: row.closed_at === null ? null : date(row.closed_at), summaryPreview, forgotten, titleTruncated: row.title_truncated, summaryTruncated: row.summary_truncated }
}
export function parseHistoryPage(value: unknown, limit = 50): HistoryPage {
  const page = object(value)
  if (page.schemaVersion !== 1 || !Array.isArray(page.results) || page.results.length > limit || page.next_cursor !== null && (typeof page.next_cursor !== 'string' || !cursorPattern.test(page.next_cursor))) return bad()
  const rows = page.results.map(chat)
  if (new Set(rows.map(row => row.id)).size !== rows.length || !rows.length && page.next_cursor !== null) return bad()
  return { rows, nextCursor: page.next_cursor as string | null }
}
export function createGatewayHistoryClient(auth: Pick<GatewayAuthClient, 'request'>) {
  return { async list({ q = '', cursor, limit = 50, signal }: HistoryQuery = {}): Promise<HistoryPage> {
    if (typeof q !== 'string' || [...q].length > 200 || q.includes('\0') || /[\uD800-\uDFFF]/u.test(q) || !Number.isInteger(limit) || limit < 1 || limit > 50 || cursor !== undefined && !cursorPattern.test(cursor)) throw new GatewayError('validation')
    const page = parseHistoryPage(await auth.request('/api/pi/sessions/history', { signal, query: { limit, ...(q.trim() ? { q: q.trim() } : {}), ...(cursor ? { cursor } : {}) } }), limit)
    if (cursor && page.nextCursor === cursor) return bad()
    return page
  } }
}
export type GatewayHistoryClient = ReturnType<typeof createGatewayHistoryClient>
