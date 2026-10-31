/**
 * Development-only team definition for the preview: one team with versions, archive and restore,
 * each change guarded by the expected revision like Pi.
 */
type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST' | 'PUT'; body?: Json; query?: Record<string, string | number | boolean> }

export function createFakeTeams(now: () => number, fail: (status: number) => never, next: () => number) {
  const teamId = `team_${'9'.repeat(32)}`
  const teamDefinition: Json = {
    name: 'Weekly planning team', objective: 'Turn school deadlines and training commitments into a realistic weekly plan.',
    roles: [
      { id: 'planner', name: 'Planner', agentId: `agent_${'1'.repeat(32)}`, instructions: 'Build the plan and identify conflicts.', toolIds: [], memory: { scope: 'none', memoryIds: [] }, context: { mode: 'task_only', sourceIds: [] }, budget: { maxTurns: 2, maxTokens: 3000, maxCostCents: 0 } },
      { id: 'reviewer', name: 'Reviewer', agentId: 'companion', instructions: 'Review the plan for clarity and realistic pacing.', toolIds: [], memory: { scope: 'conversation', memoryIds: [] }, context: { mode: 'task_only', sourceIds: [] }, budget: { maxTurns: 2, maxTokens: 3000, maxCostCents: 0 } },
    ],
    handoffs: [{ id: 'plan_review', fromRoleId: 'planner', toRoleId: 'reviewer', condition: 'When the first complete weekly plan is ready.', payload: 'result_and_citations', maxTransfers: 1 }],
    budget: { maxTurns: 6, maxTokens: 10_000, maxCostCents: 0, maxHandoffs: 2 },
  }
  const teamVersions = new Map<number, Json>([[1, structuredClone(teamDefinition)]])
  const team: Json = { schemaVersion: 1, id: teamId, revision: 1, name: teamDefinition.name, archived_at: null, created_at: now() - 4000, updated_at: now() - 4000,
    authority: 'none', execution: 'configuration-only', contentIncluded: true, reference_validation: 'external-references-unverified', definition: teamDefinition,
    agentReferences: [{ roleId: 'planner', agentId: `agent_${'1'.repeat(32)}`, revision: 1 }, { roleId: 'reviewer', agentId: 'companion', revision: 1 }], agentReferenceState: 'available' }
  return function handle(path: string, method: 'GET' | 'POST' | 'PUT', options: Request): Json | undefined {
    let match: RegExpMatchArray | null
    if (path === '/api/control/pi/collaboration/teams' && method === 'GET') {
      const { definition, agentReferences, agentReferenceState, ...summary } = team
      void definition; void agentReferences; void agentReferenceState
      return { schemaVersion: 1, results: [{ ...summary, contentIncluded: false }], nextCursor: null }
    }
    if (path === '/api/control/pi/collaboration/teams' && method === 'POST') {
      team.id = `team_${next().toString(16).padStart(32, '0')}`; team.revision = 1; team.name = options.body?.name; team.definition = structuredClone(options.body as Json); team.archived_at = null; team.created_at = team.updated_at = now(); teamVersions.clear(); teamVersions.set(1, structuredClone(team.definition as Json)); return team
    }
    if ((match = path.match(/^\/api\/control\/pi\/collaboration\/teams\/(team_[0-9a-f]{32})$/)) && method === 'GET') return team.id === match[1] ? team : fail(404)
    if ((match = path.match(/^\/api\/control\/pi\/collaboration\/teams\/(team_[0-9a-f]{32})\/versions$/)) && method === 'GET') return { schemaVersion: 1, results: [...teamVersions.entries()].map(([revision, definition]) => ({ schemaVersion: 1, id: team.id, revision, name: definition.name, archived_at: revision === team.revision ? team.archived_at : null, created_at: team.created_at, updated_at: team.updated_at, authority: 'none', execution: 'configuration-only', contentIncluded: false, reference_validation: 'external-references-unverified' })), nextRevision: null }
    if ((match = path.match(/^\/api\/control\/pi\/collaboration\/teams\/(team_[0-9a-f]{32})\/versions\/([1-9][0-9]{0,9})$/)) && method === 'GET') { const revision = Number(match[2]), definition = teamVersions.get(revision) ?? fail(404); return { schemaVersion: 1, id: team.id, revision, name: definition.name, archived_at: null, created_at: team.created_at, updated_at: team.updated_at, authority: 'none', execution: 'configuration-only', contentIncluded: true, reference_validation: 'external-references-unverified', definition, historical: true } }
    if ((match = path.match(/^\/api\/control\/pi\/collaboration\/teams\/(team_[0-9a-f]{32})\/(update|archive|restore)$/)) && method === 'POST') {
      if (team.id !== match[1] || Number(options.body?.expected_revision) !== team.revision) fail(409)
      if (match[2] === 'update') { team.definition = structuredClone(options.body?.definition as Json); team.name = (team.definition as Json).name }
      else team.archived_at = match[2] === 'archive' ? now() : null
      team.revision = Number(team.revision) + 1; team.updated_at = now(); teamVersions.set(Number(team.revision), structuredClone(team.definition as Json)); return team
    }
    return undefined
  }
}
