/** Development-only Companion and agent profiles for the preview, in the shapes the real agents client parses. */
type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST' | 'PUT'; body?: Json; query?: Record<string, string | number | boolean | readonly string[]> }

export function createFakeAgents(now: () => number, fail: (status: number) => never, next: () => number) {
  const agentProfile = (id: string, kind: 'companion' | 'agent', name: string, role: string, instructions: string): Json => ({
    schemaVersion: 1, id, kind, revision: 1, configuration: { name, role, instructions, modelId: null, toolIds: [], memory: { scope: 'conversation', memoryIds: [] } },
    created_at: now() - 7200, updated_at: now() - 7200, archived_at: null, change_kind: 'created', authority: 'none', execution: 'not-integrated', reference_validation: 'not-performed',
  })
  const agents: Json[] = [
    agentProfile('companion', 'companion', 'Conker', 'Your daily companion', 'Help the owner think clearly, plan realistically, and stay in control.'),
    agentProfile(`agent_${'1'.repeat(32)}`, 'agent', 'Research partner', 'Focused research and synthesis', 'Investigate a question, distinguish evidence from inference, and return concise sourced findings.'),
  ]

  function handle(path: string, method: string, options: Request): Json | undefined {
    let match: RegExpMatchArray | null
    if (path === '/api/control/pi/agents' && method === 'GET') return { schemaVersion: 1, results: agents }
    if (path === '/api/control/pi/agents' && method === 'POST') {
      const created = agentProfile(`agent_${(next()).toString(16).padStart(32, '0')}`, 'agent', String(options.body?.name), String(options.body?.role), String(options.body?.instructions))
      created.configuration = options.body ?? {}; agents.push(created); return created
    }
    if ((match = path.match(/^\/api\/control\/pi\/agents\/(companion|agent_[0-9a-f]{32})$/)) && method === 'GET') return agents.find(item => item.id === match![1]) ?? fail(404)
    if ((match = path.match(/^\/api\/control\/pi\/agents\/(companion|agent_[0-9a-f]{32})\/update$/)) && method === 'POST') {
      const item = agents.find(row => row.id === match![1]) ?? fail(404)
      if (item.revision !== options.body?.expected_revision || item.archived_at !== null) fail(409)
      Object.assign(item, { revision: Number(item.revision) + 1, configuration: options.body?.configuration, updated_at: now(), change_kind: 'updated' })
      return item
    }
    if ((match = path.match(/^\/api\/control\/pi\/agents\/(agent_[0-9a-f]{32})\/archive$/)) && method === 'POST') {
      const item = agents.find(row => row.id === match![1]) ?? fail(404)
      if (item.revision !== options.body?.expected_revision) fail(409)
      const archived = options.body?.archived === true
      Object.assign(item, { revision: Number(item.revision) + 1, archived_at: archived ? now() : null, updated_at: now(), change_kind: archived ? 'archived' : 'restored' })
      return item
    }
    return undefined
  }
  return { handle, agents }
}
