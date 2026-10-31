/**
 * Development-only preview memory database: the five synthetic cards, memory corrections, forget
 * with a sessionStorage-backed lost-response recovery, and per-message delivery reads. The cards
 * and the pending-forget intent live here so the Memory screens and search see one copy.
 */
import { GatewayError } from '@/lib/gateway/transport'

type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST' | 'PUT'; body?: Json; query?: Record<string, string | number | boolean>; onDispatch?: () => void }
type Message = { id: string; memory_delivery?: Json }

export function createFakeMemory(fail: (status: number) => never) {
  const corrections = new Map<string, Json>()
  const correctionTexts = new Map<string, { revision: number; text: string }>()
  if (globalThis.sessionStorage?.getItem('conker-fake-correction') === 'pending') corrections.set('correction_preview_saved', { schemaVersion: 1, requestId: 'correction_preview_saved', memoryId: 'mem_judo', previousRevision: 1, payloadHash: 'a'.repeat(64), status: 'unknown', revision: null, indexing: null, errorCode: null, cachedPackagesCleared: 0, sourceConversationKept: true })
  const card = (type: string, id: string, title: string, preview: string, memoryType?: string) => ({ type, id, title, preview, preview_truncated: false, status: 'active',
    confidence: 0.9, available_fields: ['content'], ...(memoryType ? { memory_type: memoryType } : {}), connections: { supports: 1, mentions: 1 } })
  const memories = [
    card('memory', 'mem_judo', 'Trains judo on Tuesdays and Thursdays', 'Alexey trains judo on Tuesday and Thursday evenings, so homework should be light on those days.', 'fact'),
    card('memory', 'mem_physics', 'Physics worksheet due Fridays', 'The weekly physics worksheet is handed in every Friday.', 'fact'),
    card('memory', 'mem_revision', 'Prefers short morning revision', 'Revision works best as a 45-minute block before school.', 'context'),
    card('entity', 'ent_coach', 'Coach', 'Judo coach at the club; contacted by email about open mat.'),
    card('evidence', 'evi_week', 'Chat: Plan my week', 'Help me plan this week around school and judo.'),
  ]
  // Synthetic metadata only: lets a lost-response recovery survive a preview reload.
  // No memory text or real server state enters this development-only storage.
  const forgetKey = 'conker-preview-forget'
  type ForgetIntent = { requestId: string; memoryId: string; revision: number }
  let pendingForget: ForgetIntent | null = null
  const forgetReceipts = new Map<string, { intent: ForgetIntent; receipt: Json }>()
  const deliveryReads = new Map<string, number>()
  try {
    const saved = JSON.parse(globalThis.sessionStorage?.getItem(forgetKey) ?? 'null') as ForgetIntent | null
    if (saved && /^[A-Za-z0-9_-]{16,128}$/.test(saved.requestId) && saved.revision === 1 && memories.some(row => row.type === 'memory' && row.id === saved.memoryId)) {
      pendingForget = { requestId: saved.requestId, memoryId: saved.memoryId, revision: 1 }
      memories.splice(memories.findIndex(row => row.id === saved.memoryId), 1)
    }
  } catch { /* An isolated preview can run without session storage. */ }
  function deliveryFor(message: Message, checking = false): Json {
    const receipt = message.memory_delivery ?? { state: 'unavailable', reason_code: 'legacy_unknown', admission_method: null, memory_id: null }
    const mode = globalThis.sessionStorage?.getItem('conker-fake-fail')
    if (mode === 'memory-pending') return { state: 'pending', reason_code: 'retry_scheduled', admission_method: null, memory_id: null }
    if (mode === 'memory-removed') return { state: 'removed', reason_code: 'forgotten', admission_method: null, memory_id: null }
    if (mode === 'memory-unavailable') return { state: 'unavailable', reason_code: 'blocked', admission_method: null, memory_id: null }
    if (receipt.memory_id === 'mem_judo' && !memories.some(row => row.id === 'mem_judo')) return { state: pendingForget ? 'pending' : 'removed', reason_code: pendingForget ? 'forget_pending' : 'forgotten', admission_method: null, memory_id: null }
    if (checking && receipt.state === 'pending') {
      const reads = (deliveryReads.get(message.id) ?? 0) + 1; deliveryReads.set(message.id, reads)
      if (reads >= 2) message.memory_delivery = { state: 'saved', reason_code: null, admission_method: 'owner_requested', memory_id: `memory_${message.id}` }
    }
    return message.memory_delivery ?? receipt
  }
  return {
    memories,
    deliveryFor,
    handle(path: string, method: 'GET' | 'POST' | 'PUT', options: Request): Json | undefined {
      let match: RegExpMatchArray | null
      if ((match = path.match(/^\/api\/control\/pi\/memory\/corrections\/memories\/([^/]+)$/)) && method === 'GET') {
        const item = memories.find(row => row.type === 'memory' && row.id === match![1])
        if (!item) throw new GatewayError('http', 404, undefined, 'not_found')
        return { schemaVersion: 1, memoryId: item.id, revision: correctionTexts.get(item.id)?.revision ?? 1, text: correctionTexts.get(item.id)?.text ?? item.preview, sourceType: 'conversation', confidence: 'high' }
      }
      if (path === '/api/control/pi/memory/corrections/pending' && method === 'GET') {
        const value = [...corrections.values()].find(value => value.status === 'unknown' || value.status === 'applying')
        return { schemaVersion: 1, pending: value ? { requestId: value.requestId, memoryId: value.memoryId, expectedRevision: value.previousRevision, payloadHash: value.payloadHash, status: value.status } : null }
      }
      if ((match = path.match(/^\/api\/control\/pi\/memory\/corrections\/([A-Za-z0-9_-]+)(\/retry)?$/))) {
        const value = corrections.get(match[1]); if (!value) throw new GatewayError('http', 404, undefined, 'not_found')
        if (method === 'POST' && match[2]) { options.onDispatch?.(); Object.assign(value, { status: 'applied', revision: Number(value.previousRevision) + 1, indexing: 'indexed', cachedPackagesCleared: 1 }) }
        return { ...value }
      }
      if (path === '/api/control/pi/memory/corrections' && method === 'POST') {
        options.onDispatch?.()
        const body = options.body!, id = String(body.memory_id), current = correctionTexts.get(id)?.revision ?? 1
        if (body.expected_revision !== current) throw new GatewayError('http', 409, undefined, 'revision_conflict')
        const lost = globalThis.sessionStorage?.getItem('conker-fake-correction') === 'lost-response'
        const value = { schemaVersion: 1, requestId: String(body.request_id), memoryId: id, previousRevision: current, payloadHash: 'b'.repeat(64), status: lost ? 'unknown' : 'applied', revision: lost ? null : current + 1, indexing: lost ? null : 'indexed', errorCode: null, cachedPackagesCleared: lost ? 0 : 1, sourceConversationKept: true }
        corrections.set(value.requestId, value)
        if (lost) throw new GatewayError('network')
        correctionTexts.set(id, { revision: current + 1, text: String(body.text) })
        const item = memories.find(row => row.id === id); if (item) item.preview = String(body.text).slice(0, 400)
        return { ...value }
      }
      if (path === '/api/control/pi/memory/forget-pending' && method === 'GET') return { schemaVersion: 1, pending: pendingForget ? { ...pendingForget } : null }
      if ((match = path.match(/^\/api\/control\/pi\/memory\/forget\/([^/]+)$/)) && method === 'GET') {
        const item = memories.find(row => row.type === 'memory' && row.id === match![1])
        if (!item) throw new GatewayError('http', 404, undefined, 'not_found')
        return { memoryId: item.id, revision: 1, text: item.preview }
      }
      if (path === '/api/control/pi/memory/forget' && method === 'POST') {
        const body = options.body ?? {}, requestId = String(body.request_id ?? ''), memoryId = String(body.memory_id ?? ''), revision = Number(body.expected_revision)
        if (!/^[A-Za-z0-9_-]{16,128}$/.test(requestId) || !memoryId || !Number.isSafeInteger(revision)) fail(422)
        const intent = { requestId, memoryId, revision }, previous = forgetReceipts.get(requestId)
        if (previous) {
          if (previous.intent.memoryId !== memoryId || previous.intent.revision !== revision) throw new GatewayError('http', 409, undefined, 'request_conflict')
          return previous.receipt
        }
        if (pendingForget && (pendingForget.requestId !== requestId || pendingForget.memoryId !== memoryId || pendingForget.revision !== revision)) throw new GatewayError('http', 409, undefined, 'forget_pending')
        const index = memories.findIndex(row => row.type === 'memory' && row.id === memoryId)
        if (!pendingForget && index < 0) throw new GatewayError('http', 404, undefined, 'not_found')
        if (revision !== 1) throw new GatewayError('http', 409, undefined, 'revision_conflict')
        if (index >= 0) memories.splice(index, 1)
        if (globalThis.sessionStorage?.getItem('conker-fake-fail') === 'forget-response') {
          pendingForget = intent
          try { globalThis.sessionStorage.setItem(forgetKey, JSON.stringify(intent)); globalThis.sessionStorage.removeItem('conker-fake-fail') } catch { /* In-memory recovery still works. */ }
          throw new GatewayError('network')
        }
        const receipt = { requestId, memoryId, status: 'forgotten', indexRemoval: 'removed', cachedPackagesCleared: 1, sourceConversationKept: true }
        forgetReceipts.set(requestId, { intent, receipt }); pendingForget = null
        try { globalThis.sessionStorage?.removeItem(forgetKey) } catch { /* Preview storage is optional. */ }
        return receipt
      }
      if (path === '/api/control/pi/memory/objects') {
        const search = String(options.query?.search ?? '').toLocaleLowerCase(), type = options.query?.object_type
        const objects = memories.filter(item => (!type || item.type === type) && `${item.title} ${item.preview}`.toLocaleLowerCase().includes(search))
        return { scope: 'all', objects, total: objects.length, next_after: null, search_mode: 'text' }
      }
      if ((match = path.match(/^\/api\/control\/pi\/memory\/objects\/([a-z]+)\/([^/]+)$/))) {
        const item = memories.find(row => row.type === match![1] && row.id === match![2]) ?? fail(404)
        const { connections, ...object } = item
        if (options.query?.operation === 'content') {
          const field = String(options.query.field), text = field === 'content' ? item.preview : ''
          return { scope: 'all', object, connections, field, content: text, total_characters: text.length, next_offset: null }
        }
        const others = memories.filter(row => row.id !== item.id).slice(0, 2)
        return { scope: 'all', object, connections, next_after: null, nodes: others.map(node => ({ ...node, connections: undefined })),
          links: others.map((node, index) => ({ id: `lnk_${item.id}_${index}`, source_type: item.type, source_id: item.id, target_type: node.type, target_id: node.id, relationship: index ? 'mentions' : 'supports', confidence: 0.8 })) }
      }
      return undefined
    },
  }
}
