type Json = Record<string, unknown>

/**
 * Preview-only "a memory you corrected was used" notices (pi/conversation/recall_notices.py shape).
 * Pick a state with `?preview-recall=`: notice (default), none, forgotten (one chat, no title) or
 * failing (the read fails). Dismissing stays in this tab.
 */
export function createFakeRecallNotices(scenario: string | null, chats: readonly (readonly [string, string])[], now: () => number, fail: (status: number) => never) {
  const notice = (n: number, change: 'corrected' | 'forgotten', shown: readonly (readonly [string, string])[], answers: number, total: number): Json => ({
    kind: 'memory-recall',
    id: `mrn_${String(n).repeat(32)}`,
    since: now() - 5400,
    memoryId: `mem_judo${n}`,
    change,
    answers,
    chats: total,
    title: `A memory you ${change === 'forgotten' ? 'forgot' : 'corrected'} was used in ${answers} ${answers === 1 ? 'answer' : 'answers'} in ${total} ${total === 1 ? 'chat' : 'chats'}`,
    sessionIds: shown.map(([id]) => id),
    sessions: shown.map(([id, title]) => ({ id, title })),
    source: { kind: 'memory-recall', noticeId: `mrn_${String(n).repeat(32)}`, memoryId: `mem_judo${n}` },
  })
  let open: Json[] = scenario === 'none' || scenario === 'failing' ? [] : scenario === 'forgotten' ? [notice(2, 'forgotten', [[chats[0][0], '']], 1, 1)] : [notice(1, 'corrected', chats.slice(0, 2), 3, 2)]
  return function handle(path: string, method: string): Json | undefined {
    if (!path.startsWith('/api/control/pi/memory/recall-notices')) return undefined
    if (path === '/api/control/pi/memory/recall-notices' && method === 'GET') return scenario === 'failing' ? fail(503) : { items: structuredClone(open) }
    const dismiss = path.match(/^\/api\/control\/pi\/memory\/recall-notices\/(mrn_[0-9a-f]{32})\/dismiss$/)
    if (!dismiss || method !== 'POST') return fail(404)
    const found = open.some(item => item.id === dismiss[1])
    if (!found) return fail(404)
    open = open.filter(item => item.id !== dismiss[1])
    return { id: dismiss[1], dismissed: true, changed: true }
  }
}
