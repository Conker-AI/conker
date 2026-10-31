/**
 * Development-only ChatGPT and Claude runtimes for the preview: subscription sign-in scenarios,
 * saved Codex threads and Claude background sessions, keyed by sessionStorage like the old file.
 */
import { GatewayError } from '@/lib/gateway/transport'

type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST' | 'PUT'; body?: Json; query?: Record<string, string | number | boolean>; onDispatch?: () => void }

export function createFakeRuntimes(fail: (status: number) => never) {
  const nativeRows = ['review_changes', 'waiting_input'].map((id, index) => ({ id, identity: (index ? 'b' : 'a').repeat(64), sessionId: `native_conversation_${index}`, name: index ? 'Review needs native input' : 'Review workspace changes', cwd: index ? 'C:/work/conker/examples/long-working-directory-for-native-review' : 'C:/work/conker', startedAt: Date.now() - (index + 1) * 60000, state: index ? 'blocked' : 'working', processStatus: index ? 'waiting' : 'busy', waitingFor: index ? 'permission_prompt' : null, canStop: true }))
  const codexRows = Array.from({ length: 28 }, (_, index) => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, name: index === 0 ? 'Review the release checklist' : null, preview: index === 1 ? 'Inspect the native session metadata and preserve the exact owner-approved command. '.repeat(7).slice(0, 500) : `Saved review ${index + 1}: check the workspace changes before continuing.`, previewTruncated: index === 1, cwd: index === 1 ? 'C:/work/conker/examples/long-working-directory-for-native-review' : 'C:/work/conker', createdAt: Math.floor(Date.now() / 1000) - 7200 - index * 60, updatedAt: Math.floor(Date.now() / 1000) - index * 60, modelProvider: 'openai', source: index === 2 ? 'subAgent' : 'cli' }))
  const subscriptionStates = new Map<string, 'idle' | 'pending' | 'connected'>()
  async function subscription(path: string, method: 'GET' | 'POST' | 'PUT', options: Request): Promise<Json> {
    const scenario = globalThis.sessionStorage.getItem('conker-fake-subscription')
    if (method === 'GET' && scenario === 'read-failure') return fail(503)
    if (method === 'GET' && scenario === 'read-timeout') return new Promise<Json>(() => { /* Isolated status deadline fixture. */ })
    if (method === 'GET' && scenario === 'slow-read') await new Promise(resolve => setTimeout(resolve, 5000))
    if (method === 'POST') {
      options.onDispatch?.()
      if (scenario === 'operation-timeout') return new Promise<Json>(() => { /* Isolated dispatch deadline fixture. */ })
      subscriptionStates.set(path, options.body?.operation === 'login' ? 'pending' : options.body?.operation === 'models' ? 'connected' : 'idle')
      if (scenario === 'lost-response') return fail(503)
    }
    const current = scenario === 'connected' ? 'connected' : subscriptionStates.get(path) ?? 'idle'
    const loginId = current === 'pending' ? `login_${'a'.repeat(32)}` : null
    const common = { available: true, connected: current === 'connected', loginId, loginState: loginId ? 'pending' : 'idle', credentialsIncluded: false }
    return path.endsWith('/chatgpt') ? { ...common, connectionId: common.connected ? `connection_${'a'.repeat(32)}` : null, plan: common.connected ? 'plus' : null, problem: null, models: [], catalogueComplete: false,
      deviceCode: method === 'POST' && options.body?.operation === 'login' ? { verificationUrl: 'https://auth.openai.com/codex/device', userCode: 'TEST-1234' } : null,
    } : { ...common, runtime: 'Claude Code', models: [], authorizationUrl: loginId ? 'https://claude.ai/oauth/authorize' : null }
  }
  return function handle(path: string, method: 'GET' | 'POST' | 'PUT', options: Request): Json | Promise<Json> | undefined {
    if ((path === '/api/host/chatgpt' || path === '/api/host/claude') && globalThis.sessionStorage?.getItem('conker-fake-subscription')) return subscription(path, method, options)
    if (path.startsWith('/api/host/codex/sessions')) {
      const scenario = globalThis.sessionStorage?.getItem('conker-fake-codex-sessions'), envelope = { schemaVersion: 1, provider: 'codex', scope: 'saved_threads', runtimeVisibility: 'observer_only' }
      if (method !== 'GET') return fail(404)
      if (scenario === 'unavailable') return fail(503)
      if (scenario === 'timeout') return new Promise<Json>(() => { /* A development-only stalled read. */ })
      const sourceRows = scenario === 'long' ? codexRows.map((row, index) => index === 0 ? { ...row, name: null, preview: '😀'.repeat(500), previewTruncated: true, cwd: `C:/work/${'long-directory-'.repeat(18)}`, updatedAt: Number.MAX_SAFE_INTEGER } : row) : codexRows
      if (path === '/api/host/codex/sessions') {
        const archived = options.query?.archived === true, limit = Number(options.query?.limit ?? 25), cursor = options.query?.cursor
        if (scenario === 'page-error' && cursor) return fail(503)
        if (scenario === 'cursor-error' && cursor) return fail(422)
        if (cursor && cursor !== 'preview_page_2') return fail(422)
        const rows = scenario === 'empty' ? [] : archived ? sourceRows.slice(-2) : sourceRows, start = cursor ? 25 : 0
        return { ...envelope, archived, results: structuredClone(rows.slice(start, start + limit)), nextCursor: start + limit < rows.length ? 'preview_page_2' : null }
      }
      if (scenario === 'detail-error') return fail(404)
      const row = sourceRows.find(row => row.id === path.split('/')[5]) ?? fail(404)
      return { ...envelope, session: structuredClone(row) }
    }
    if (path.startsWith('/api/host/claude/sessions')) {
      const scenario = globalThis.sessionStorage?.getItem('conker-fake-native-sessions')
      if (scenario === 'unavailable') return fail(503)
      if (scenario === 'read-timeout' && method === 'GET') return new Promise<Json>(() => { /* Isolated read deadline. */ })
      const parts = path.split('/'), row = nativeRows.find(item => item.id === parts[5])
      if (path === '/api/host/claude/sessions') return { schemaVersion: 1, provider: 'claude', scope: 'background_sessions', results: scenario === 'empty' ? [] : structuredClone(nativeRows), truncated: false, omittedCount: 1 }
      if (!row) return fail(404)
      if (path.endsWith('/output')) return { schemaVersion: 1, provider: 'claude', id: row.id, identity: row.identity, text: 'Claude native output snapshot\nReviewing workspace files…\n<untrusted text remains plain text>\n', truncated: true, outputPersisted: false }
      if (path.endsWith('/stop') && method === 'POST') {
        options.onDispatch?.()
        if (options.body?.expectedIdentity !== row.identity) return fail(409)
        if (scenario === 'stop-timeout') return new Promise<Json>(() => { /* Isolated dispatched Stop deadline. */ })
        row.state = 'stopped'; row.processStatus = 'idle'; row.waitingFor = null; row.canStop = false
        if (scenario === 'lost-response') return fail(503)
        return { schemaVersion: 1, provider: 'claude', id: row.id, identity: row.identity, status: 'stop_requested', automaticReplay: false }
      }
      return { schemaVersion: 1, provider: 'claude', result: structuredClone(row) }
    }
    if (path === '/api/host/claude') return { available: false, connected: false, loginId: null, loginState: 'idle', authorizationUrl: null, credentialsIncluded: false, runtime: 'Claude Code', models: [] }
    if (path === '/api/host/chatgpt') {
      if (method !== 'GET') throw new GatewayError('dependency', 503)
      return { available: false, connected: false, connectionId: null, plan: null, loginId: null, loginState: 'idle', problem: 'runtime_unavailable', models: [], catalogueComplete: false, credentialsIncluded: false, deviceCode: null }
    }
    return undefined
  }
}
