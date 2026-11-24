import { describe, expect, it } from 'vitest'
import { GatewayTeamMutationError, createGatewayTeamsClient, teamDefinitionSchema, type GatewayTeamDefinition } from '../gateway/teams'
import { TeamRunError, createTeamRunsClient, finishBody, stepBody, teamRunStates, teamStepStates, type GatewayTeamRun } from '../gateway/team-runs'
import { GatewayError } from '../gateway/transport'

type Call = { path: string; init: Record<string, unknown> }
function fakeAuth(...answers: unknown[]) {
  const calls: Call[] = []
  const queue = [...answers]
  const request = async (path: string, init: Record<string, unknown> = {}) => {
    calls.push({ path, init })
    const next = queue.length > 1 ? queue.shift() : queue[0]
    if (next instanceof Error) throw next
    return next
  }
  return { calls, auth: { request } as never }
}
const kind = (promise: Promise<unknown>, expected: string) => expect(promise).rejects.toMatchObject({ name: 'GatewayError', kind: expected })
const hex = (character: string, length = 32) => character.repeat(length)

const role = (overrides: Record<string, unknown> = {}) => ({
  id: 'lead',
  name: 'Lead',
  agentId: 'companion',
  instructions: 'Lead the work',
  toolIds: [],
  memory: { scope: 'none', memoryIds: [] },
  context: { mode: 'task_only', sourceIds: [] },
  budget: { maxTurns: 3, maxTokens: 1000, maxCostCents: 0 },
  ...overrides,
})
const definition = (overrides: Record<string, unknown> = {}) =>
  ({
    name: 'Trip team',
    objective: 'Plan the trip',
    roles: [role()],
    handoffs: [],
    budget: { maxTurns: 6, maxTokens: 5000, maxCostCents: 100, maxHandoffs: 2 },
    ...overrides,
  }) as GatewayTeamDefinition

describe('team definition rules', () => {
  const accepts = (value: unknown) => expect(teamDefinitionSchema.safeParse(value).success).toBe(true)
  const refuses = (value: unknown) => expect(teamDefinitionSchema.safeParse(value).success).toBe(false)

  it('accepts a team with selected memory and selected context that name their records', () => {
    accepts(definition())
    accepts(definition({ roles: [role({ memory: { scope: 'selected', memoryIds: ['m1'] }, context: { mode: 'selected', sourceIds: ['s1'] } })] }))
  })

  it('refuses selected memory or context without records, records without selection, and repeated memory ids', () => {
    refuses(definition({ roles: [role({ memory: { scope: 'selected', memoryIds: [] } })] }))
    refuses(definition({ roles: [role({ memory: { scope: 'owner', memoryIds: ['m1'] } })] }))
    refuses(definition({ roles: [role({ memory: { scope: 'selected', memoryIds: ['m1', 'm1'] } })] }))
    refuses(definition({ roles: [role({ context: { mode: 'selected', sourceIds: [] } })] }))
    refuses(definition({ roles: [role({ context: { mode: 'task_only', sourceIds: ['s1'] } })] }))
    refuses(definition({ roles: [role({ memory: { scope: 'selected', memoryIds: [' padded '] } })] }))
  })
})

describe('teams client', () => {
  const tid = `team_${hex('a')}`
  const summary = (overrides: Record<string, unknown> = {}) => ({
    schemaVersion: 1,
    id: tid,
    revision: 2,
    name: 'Trip team',
    archived_at: null,
    created_at: 1,
    updated_at: 2,
    authority: 'none',
    execution: 'configuration-only',
    contentIncluded: false,
    reference_validation: 'external-references-unverified',
    ...overrides,
  })
  const view = (overrides: Record<string, unknown> = {}) => ({
    ...summary({ contentIncluded: true }),
    definition: definition(),
    agentReferences: [{ roleId: 'lead', agentId: 'companion', revision: 1 }],
    agentReferenceState: 'available',
    ...overrides,
  })
  const base = '/api/control/pi/collaboration/teams'

  it('lists with the default limit, or a limit and a cursor', async () => {
    const page = { schemaVersion: 1, results: [summary()], nextCursor: null }
    const { auth, calls } = fakeAuth(page)
    const client = createGatewayTeamsClient(auth)
    expect(await client.list()).toEqual(page)
    await client.list({ limit: 5, cursor: tid })
    expect(calls.map(call => [call.path, call.init.query])).toEqual([
      [base, { limit: 100 }],
      [base, { limit: 5, cursor: tid }],
    ])
    await kind(client.list({ limit: 0 }), 'validation')
    await kind(client.list({ cursor: 'next' }), 'validation')
  })

  it('reads one team and wants that team back', async () => {
    const { auth, calls } = fakeAuth(view())
    expect((await createGatewayTeamsClient(auth).get(tid)).agentReferenceState).toBe('available')
    expect(calls[0].path).toBe(`${base}/${tid}`)
    await kind(createGatewayTeamsClient(auth).get('x'), 'validation')
    await kind(createGatewayTeamsClient(fakeAuth(view({ id: `team_${hex('b')}` })).auth).get(tid), 'invalid-response')
  })

  it('creates, updates, archives and restores a team at the revision it saw', async () => {
    const { auth, calls } = fakeAuth(view())
    const client = createGatewayTeamsClient(auth)
    const signal = new AbortController().signal
    await client.create(definition(), signal)
    await client.update(tid, definition(), 2)
    await client.setArchived(tid, true, 2)
    await client.setArchived(tid, false, 2)
    expect(calls.map(call => [call.path, call.init.body])).toEqual([
      [base, definition()],
      [`${base}/${tid}/update`, { expected_revision: 2, definition: definition() }],
      [`${base}/${tid}/archive`, { expected_revision: 2, archived: true }],
      [`${base}/${tid}/restore`, { expected_revision: 2 }],
    ])
    expect(calls[0].init.signal).toBe(signal)
  })

  it('refuses malformed input before anything is sent', async () => {
    const { auth, calls } = fakeAuth(view())
    const client = createGatewayTeamsClient(auth)
    await kind(client.create(definition({ roles: [] })), 'validation')
    await kind(client.update('x', definition(), 1), 'validation')
    await kind(client.update(tid, definition(), 0), 'validation')
    await kind(client.setArchived(tid, true, 0), 'validation')
    await kind(client.history('x'), 'validation')
    await kind(client.revision('x', 1), 'validation')
    await kind(client.revision(tid, 0), 'validation')
    expect(calls).toEqual([])
  })

  it('tells a conflict, a refusal and an uncertain outcome apart, and keeps a bad answer as one', async () => {
    const failing = (error: unknown) =>
      createGatewayTeamsClient(fakeAuth(error).auth)
        .create(definition())
        .catch(failure => failure)
    const conflict = await failing(new GatewayError('http', 409))
    expect(conflict).toBeInstanceOf(GatewayTeamMutationError)
    expect(conflict).toMatchObject({ outcome: 'conflict', message: 'The team changed elsewhere. Reload it before saving.' })
    expect(await failing(new GatewayError('browser-expired'))).toMatchObject({ outcome: 'rejected', message: new GatewayError('browser-expired').message })
    expect(await failing(new GatewayError('http', 403))).toMatchObject({ outcome: 'rejected' })
    expect(await failing(new GatewayError('network'))).toMatchObject({ name: 'GatewayTeamMutationError', outcome: 'unknown' })
    expect(await failing(new GatewayError('http', 500))).toMatchObject({ outcome: 'unknown' })
    expect(await failing(new Error('boom'))).toMatchObject({ outcome: 'unknown' })
    await kind(createGatewayTeamsClient(fakeAuth({ nope: 1 }).auth).create(definition()), 'invalid-response')
  })

  it('reads the version list and one past revision, which must be the one asked for', async () => {
    const past = (revision: number) => ({ ...summary({ contentIncluded: true, revision }), definition: definition(), historical: true })
    const history = { schemaVersion: 1, results: [summary()], nextRevision: null }
    const a = fakeAuth(history)
    expect(await createGatewayTeamsClient(a.auth).history(tid)).toEqual(history)
    expect(a.calls[0]).toMatchObject({ path: `${base}/${tid}/versions`, init: { query: { limit: 100, after: 0 } } })
    const b = fakeAuth(past(3))
    expect((await createGatewayTeamsClient(b.auth).revision(tid, 3)).historical).toBe(true)
    expect(b.calls[0].path).toBe(`${base}/${tid}/versions/3`)
    await kind(createGatewayTeamsClient(fakeAuth(past(4)).auth).revision(tid, 3), 'invalid-response')
    await kind(createGatewayTeamsClient(fakeAuth({ ...past(3), id: `team_${hex('b')}` }).auth).revision(tid, 3), 'invalid-response')
  })
})

describe('team runs', () => {
  const rid = `teamrun_${hex('a')}`
  const stepId = `teamstep_${hex('b')}`
  const wireRun = (overrides: Record<string, unknown> = {}) => ({
    id: rid,
    teamId: `team_${hex('c')}`,
    revision: 4,
    state: 'ready',
    rootSessionId: `ses_${hex('d', 16)}`,
    snapshot: { definition: definition(), teamRevision: 2, agents: {} },
    steps: [{ id: stepId, request_id: 'req', role_id: 'lead', handoff_id: null, session_id: `ses_${hex('e', 16)}`, task_id: 'task', state: 'complete', created_at: 1 }],
    modelCalls: [{ id: 'call', step_id: stepId, provider: 'p', requested_model: 'm', actual_model: null, state: 'complete', input_tokens: 1, output_tokens: 2, cost_usd: 0.1, latency_ms: 5 }],
    limits: { turns: '1 of 6' },
    ...overrides,
  })
  const base = '/api/control/pi/team-runs'
  const current = wireRun() as unknown as GatewayTeamRun

  it('lists the states and step states Pi uses', () => {
    expect(teamRunStates).toEqual(['ready', 'running', 'held', 'blocked', 'interrupted', 'completed', 'cancelled'])
    expect(teamStepStates).toContain('complete')
  })

  it('words every refusal code in plain words, and marks a revision conflict as stale', () => {
    const words = (code: string) => new TeamRunError(new GatewayError('http', 409, undefined, code as never))
    expect(words('spending_cap_off').message).toContain('daily spending cap is off')
    expect(words('turn_limit').message).toBe('This team has used all the turns it was given.')
    expect(words('team_busy').code).toBe('team_busy')
    expect(words('revision_conflict')).toMatchObject({ stale: true, code: 'revision_conflict', name: 'TeamRunError' })
    expect(words('not_found').stale).toBe(false)
  })

  it('falls back to the standard message for an unknown code or any other failure', () => {
    expect(new TeamRunError(new GatewayError('http', 409, undefined, 'draft_changed'))).toMatchObject({ code: null, stale: false, message: new GatewayError('http').message })
    expect(new TeamRunError(new GatewayError('dependency')).message).toBe(new GatewayError('dependency').message)
    expect(new TeamRunError(new Error('boom')).message).toBe(new GatewayError('network').message)
  })

  it('reads a run and wants that run back', async () => {
    const { auth, calls } = fakeAuth(wireRun())
    expect((await createTeamRunsClient(auth).get(rid)).state).toBe('ready')
    expect(calls[0]).toEqual({ path: `${base}/${rid}`, init: { signal: undefined } })
    await kind(createTeamRunsClient(auth).get('x'), 'validation')
    await kind(createTeamRunsClient(fakeAuth(wireRun({ id: `teamrun_${hex('f')}` })).auth).get(rid), 'invalid-response')
    await kind(createTeamRunsClient(fakeAuth(wireRun({ extra: 1 })).auth).get(rid), 'invalid-response')
  })

  it('runs one role in the background at the revision it saw, with or without a reviewed handoff', async () => {
    const { auth, calls } = fakeAuth(wireRun())
    const client = createTeamRunsClient(auth)
    await client.step(current, { roleId: 'lead' })
    await client.step(current, { roleId: 'writer', handoffId: 'h1', reviewed: true })
    const [plain, handoff] = calls.map(call => call.init.body as Record<string, unknown>)
    expect(calls[0].path).toBe(`${base}/${rid}/steps`)
    expect(plain).toMatchObject({ expected_revision: 4, roleId: 'lead', conditionReviewed: false, background: true })
    expect(plain.request_id).toMatch(/^ui_step_[0-9a-f]{32}$/)
    expect('handoffId' in plain).toBe(false)
    expect(handoff).toMatchObject({ roleId: 'writer', handoffId: 'h1', conditionReviewed: true })
  })

  it('refuses a step with no role before anything is sent', () => {
    const { auth, calls } = fakeAuth(wireRun())
    expect(() => createTeamRunsClient(auth).step(current, { roleId: '' })).toThrow(expect.objectContaining({ kind: 'validation' }))
    expect(calls).toEqual([])
  })

  it('finishes a run as completed or cancelled, and reconciles with an empty body', async () => {
    const { auth, calls } = fakeAuth(wireRun())
    const client = createTeamRunsClient(auth)
    await client.finish(current, 'cancelled')
    await client.reconcile(rid)
    expect(calls[0]).toEqual({ path: `${base}/${rid}/finish`, init: { method: 'POST', body: { expected_revision: 4, state: 'cancelled' }, signal: undefined } })
    expect(calls[1]).toEqual({ path: `${base}/${rid}/reconcile`, init: { method: 'POST', body: {}, signal: undefined } })
    expect(() => client.reconcile('x')).toThrow(expect.objectContaining({ kind: 'validation' }))
    expect(() => client.finish({ ...current, revision: 0 }, 'completed')).toThrow(expect.objectContaining({ kind: 'validation' }))
  })

  it('turns every write failure into a team run error, whatever the cause', async () => {
    const conflict = await createTeamRunsClient(fakeAuth(new GatewayError('http', 409, undefined, 'revision_conflict')).auth)
      .finish(current, 'completed')
      .catch(error => error)
    expect(conflict).toBeInstanceOf(TeamRunError)
    expect(conflict.stale).toBe(true)
    const other = await createTeamRunsClient(fakeAuth(wireRun({ id: `teamrun_${hex('f')}` })).auth)
      .finish(current, 'completed')
      .catch(error => error)
    expect(other).toMatchObject({ name: 'TeamRunError', code: null, message: new GatewayError('invalid-response').message })
    expect(
      await createTeamRunsClient(fakeAuth({ nope: 1 }).auth)
        .reconcile(rid)
        .catch(error => error),
    ).toBeInstanceOf(TeamRunError)
  })

  it('exposes the step and finish bodies Pi accepts', () => {
    expect(stepBody.safeParse({ request_id: 'r'.repeat(20), expected_revision: 1, roleId: 'lead', handoffId: null, conditionReviewed: true, background: true }).success).toBe(true)
    expect(stepBody.safeParse({ request_id: 'short', expected_revision: 1, roleId: 'lead', conditionReviewed: true, background: true }).success).toBe(false)
    expect(finishBody.safeParse({ expected_revision: 1, state: 'completed' }).success).toBe(true)
    expect(finishBody.safeParse({ expected_revision: 1, state: 'held' }).success).toBe(false)
  })
})
