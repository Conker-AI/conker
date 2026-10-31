/**
 * Development-only health, diagnostics and model readiness for the preview, plus a deterministic
 * stand-in for the Auto routing model. Failure scenarios come from sessionStorage like the old file.
 */
type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST' | 'PUT'; body?: Json; query?: Record<string, string | number | boolean> }

export function createFakeStatus(now: () => number, iso: (seconds: number) => string, fail: (status: number) => never) {
  return function handle(path: string, method: 'GET' | 'POST' | 'PUT', options: Request): Json | Promise<Json> | undefined {
    if (path === '/api/pi/models/auto-settings' && method === 'POST') {
      // Deterministic stand-in for the routing model: long or comparative asks are Hard; price-like asks research the web.
      const text = String(options.body?.text ?? ''), hard = text.length > 80 || /compare|best|plan|why/i.test(text), web = /price|latest|best|news|today|buy/i.test(text)
      return { complexity: hard ? 'hard' : 'easy', think: hard, research: web ? 'web' : 'off', reasons: { complexity: hard ? 'This needs careful comparison or planning.' : 'A short, direct question.', think: hard ? 'A background check of the trade-offs helps.' : 'No separate analysis needed.', research: web ? 'Current facts matter here.' : 'Answerable without the web.' }, modelId: 'jev-preview', configurationRevision: 1 }
    }
    if (path === '/api/pi/models') {
      const scenario = globalThis.sessionStorage?.getItem('conker-fake-fail')
      if (scenario === 'provider-readiness') return fail(503)
      if (scenario === 'provider-readiness-timeout') return new Promise<Json>(() => { /* Isolated timeout fixture; no provider request. */ })
      return { local: { provider: 'ollama', model: 'qwen2.5:3b', health: { status: 'ok' } }, direct: {}, hosted: { status: 'not_configured' } }
    }
    if (path === '/health') return { service: 'gateway', version: '0.1.0', status: 'ok', checked_at: iso(now()), age_seconds: 0,
      checks: { owner_login: { status: 'ok' }, runtime: { status: 'ok' }, owner_channel: { status: 'ok' } } }
    if (path === '/api/diagnostics') return {
      schemaVersion: 1, status: 'ok', generatedAt: iso(now()), summary: { attention: 0, ok: 7, optional: 1 },
      findings: [
        ['owner-login', 'access', 'Owner sign-in', 'ok', 'ok', 'Working normally.', null],
        ['runtime', 'services', 'Conker runtime', 'ok', 'ok', 'Working normally.', null],
        ['owner-channel', 'access', 'Approval control', 'ok', 'ok', 'Working normally.', null],
        ['store', 'services', 'Conversation storage', 'ok', 'ok', 'Working normally.', null],
        ['memory', 'services', 'Memory', 'ok', 'ok', 'Working normally.', null],
        ['local-model', 'models', 'Local answer model', 'ok', 'ok', 'Working normally.', null],
        ['hosted-model', 'models', 'Hosted answer model', 'optional', 'not_configured', 'Not configured; this capability is optional.', null],
        ['actions', 'services', 'Tool approvals', 'ok', 'ok', 'Working normally.', null],
      ].map(([id, area, label, status, observedStatus, detail, recovery]) => ({ id, area, label, status, observedStatus, detail, recovery })),
    }
    if (path === '/api/pi/health') return { service: 'pi', version: '0.4.0', status: 'ok', checked_at: iso(now()), age_seconds: 1,
      checks: { store: { status: 'ok' }, memory: { status: 'ok' }, local_provider: { status: 'ok' }, hosted_provider: { status: 'not_configured' }, action_boundary: { status: 'ok' } } }
    return undefined
  }
}
