import { GatewayError } from '@/lib/gateway/transport'

type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST' | 'PUT'; body?: Json; onDispatch?: () => void }

/**
 * Preview-only Conker updates (pi/owner/updates.py shapes), served beside the fake host helper so
 * Update can run `update.run` there. Pick a state with `?preview-updates=`: offer (default), none,
 * rolled-back, held, failed, applied. In the preview an update finishes applied a few seconds later.
 */
export function createFakeUpdates(scenario: string | null) {
  const now = Date.now() / 1000, hour = 3600
  const notes = [
    '- **Conker updates itself.** Your server checks for a new release once a day and shows it here. Update takes a checked backup first and goes back by itself if the new version does not start.',
    '- **Chat Trash.** Delete moves a chat to Trash with Undo; Delete forever finishes in the background.',
    '- **Language level.** Each chat can answer Strict, Plain, Normal or Deep.',
    '- Fixes: web search through SearXNG answers again; outside content can no longer pose as you.',
  ].join('\n')
  const offer = scenario === 'none' ? null : {
    version: '0.2.0', title: 'Update available: 0.2.0', notes, url: 'https://github.com/Conker-AI/conker/releases/tag/v0.2.0',
    publishedAt: new Date((now - 5 * hour) * 1000).toISOString().replace(/\.\d+Z$/, 'Z'), foundAt: now - 2 * hour,
  }
  const result = (id: string, outcome: string, title: string, reason: string | null, hoursAgo: number): Json =>
    ({ id: id.repeat(32).slice(0, 32), version: '0.1.1', outcome, title, reason, finishedAt: now - hoursAgo * hour })
  const results: Json[] = []
  if (scenario === 'rolled-back') results.push(result('a', 'rolled_back', 'Update to 0.1.1 rolled back', 'candidate failed: Conker 0.1.1 did not answer its health checks', 20))
  if (scenario === 'held') results.push(result('b', 'held', 'Update to 0.1.1 stopped: restore needed', 'rollback could not be proven: Conker 0.1.0 did not answer its health checks', 20))
  if (scenario === 'failed') results.push(result('c', 'failed', 'Update to 0.1.1 did not start', 'preflight failed: less than 20 GB is free on the server', 20))
  if (scenario === 'applied') results.push(result('d', 'applied', 'Updated to 0.1.1', null, 20))
  const state = { offer: offer as Json | null, results }

  const fail = (status: number, code: string, detail: string): never => { throw new GatewayError('http', status, undefined, code as never, detail) }
  return {
    /** The host fake calls this when `update.run` ends: Pi hears the result and closes the offer. */
    finished(version: string, applied: boolean) {
      if (state.offer?.version === version) state.offer = null
      state.results.unshift({ id: Math.random().toString(16).slice(2).padEnd(32, '0').slice(0, 32), version, outcome: applied ? 'applied' : 'rolled_back',
        title: applied ? `Updated to ${version}` : `Update to ${version} rolled back`, reason: applied ? null : `candidate failed: Conker ${version} did not answer its health checks`, finishedAt: Date.now() / 1000 })
    },
    handle(path: string, options: Request): Json {
      const method = options.method ?? 'GET'
      if (path === '/api/control/pi/updates' && method === 'GET') return structuredClone(state)
      options.onDispatch?.()
      const skip = path.match(/^\/api\/control\/pi\/updates\/offers\/(\d+\.\d+\.\d+)\/dismiss$/)
      if (skip && method === 'POST') {
        if (state.offer?.version !== skip[1]) fail(404, 'not_found', 'No update offer for that version.')
        state.offer = null
        return { version: skip[1], dismissed: true }
      }
      const dismiss = path.match(/^\/api\/control\/pi\/updates\/results\/([0-9a-f]{32})\/dismiss$/)
      if (dismiss && method === 'POST') {
        const before = state.results.length
        state.results = state.results.filter(row => row.id !== dismiss[1])
        if (state.results.length === before) fail(404, 'not_found', 'No update result with that id.')
        return { id: dismiss[1], dismissed: true }
      }
      return fail(404, 'not_found', 'Not found.')
    },
  }
}
