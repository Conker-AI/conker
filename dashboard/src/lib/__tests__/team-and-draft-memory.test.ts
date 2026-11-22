import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { GatewayTeamRun } from '../gateway/team-runs'
import { TEAM_RUNS_LIMIT, forgetTeamRun, readOpenedTeamRuns, rememberTeamRun } from '../team-run-memory'
import { draftOrigin, forgetDraftOrigin, rememberDraftOrigin } from '../tool-draft-origin'
import { RUN_STATE_WORDS, STEP_STATE_WORDS, firstRole, isOver, nextRoles, roleName, runSummary, usageOf } from '../team-run-view'

const store = new Map<string, string>()
let broken = false
beforeEach(() => {
  store.clear()
  broken = false
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (broken) throw new Error('blocked')
        store.set(key, value)
      },
    },
  })
})
afterEach(() => {
  Reflect.deleteProperty(globalThis, 'localStorage')
})

const runId = (n: number) => `teamrun_${n.toString(16).padStart(32, '0')}`

describe('opened team runs', () => {
  it('starts empty, remembers newest first, and moves a repeat to the front', () => {
    expect(readOpenedTeamRuns()).toEqual([])
    rememberTeamRun(runId(1), 10)
    rememberTeamRun(runId(2), 20)
    expect(rememberTeamRun(runId(1), 30)).toEqual([
      { id: runId(1), at: 30 },
      { id: runId(2), at: 20 },
    ])
    expect(readOpenedTeamRuns()).toEqual([
      { id: runId(1), at: 30 },
      { id: runId(2), at: 20 },
    ])
  })
  it('ignores an id that is not a run id', () => {
    rememberTeamRun(runId(1), 10)
    expect(rememberTeamRun('teamrun_short', 20)).toEqual([{ id: runId(1), at: 10 }])
    expect(readOpenedTeamRuns()).toHaveLength(1)
  })
  it('keeps only the newest twelve', () => {
    for (let i = 1; i <= TEAM_RUNS_LIMIT + 3; i++) rememberTeamRun(runId(i), i)
    const kept = readOpenedTeamRuns()
    expect(kept).toHaveLength(TEAM_RUNS_LIMIT)
    expect(kept[0].id).toBe(runId(TEAM_RUNS_LIMIT + 3))
  })
  it('forgets one run', () => {
    rememberTeamRun(runId(1), 10)
    rememberTeamRun(runId(2), 20)
    expect(forgetTeamRun(runId(1))).toEqual([{ id: runId(2), at: 20 }])
    expect(readOpenedTeamRuns()).toEqual([{ id: runId(2), at: 20 }])
  })
  it('drops stored entries that are malformed, and survives bad JSON or a non-list', () => {
    store.set('conker.team-runs', JSON.stringify([{ id: runId(1), at: 5 }, { id: 'nope', at: 5 }, { id: runId(2), at: -1 }, { id: runId(3), at: 'x' }, null, 4]))
    expect(readOpenedTeamRuns()).toEqual([{ id: runId(1), at: 5 }])
    store.set('conker.team-runs', '{"not":"a list"}')
    expect(readOpenedTeamRuns()).toEqual([])
    store.set('conker.team-runs', '{broken')
    expect(readOpenedTeamRuns()).toEqual([])
  })
  it('still answers when storage refuses writes', () => {
    broken = true
    expect(rememberTeamRun(runId(1), 10)).toEqual([{ id: runId(1), at: 10 }])
    expect(forgetTeamRun(runId(1))).toEqual([])
  })
  it('reads as empty when there is no storage at all', () => {
    Reflect.deleteProperty(globalThis, 'localStorage')
    expect(readOpenedTeamRuns()).toEqual([])
    expect(rememberTeamRun(runId(1), 10)).toEqual([{ id: runId(1), at: 10 }])
  })
})

describe('tool draft origins', () => {
  const request = `creq_${'a'.repeat(32)}`
  const other = `creq_${'b'.repeat(32)}`
  it('remembers the request a draft came from', () => {
    rememberDraftOrigin('my-draft', request)
    expect(draftOrigin('my-draft')).toBe(request)
    expect(draftOrigin('another')).toBeNull()
  })
  it('prefers a valid request in the address, ignores an invalid one', () => {
    rememberDraftOrigin('my-draft', request)
    expect(draftOrigin('my-draft', other)).toBe(other)
    expect(draftOrigin('my-draft', 'creq_nope')).toBe(request)
    expect(draftOrigin('my-draft', null)).toBe(request)
    expect(draftOrigin('unknown', 'creq_nope')).toBeNull()
  })
  it('refuses to remember an invalid draft or request id', () => {
    rememberDraftOrigin('1bad', request)
    rememberDraftOrigin('good', 'creq_nope')
    expect(store.has('conker.tool-draft-origins')).toBe(false)
  })
  it('moves a re-remembered draft to the end and keeps only the newest fifty', () => {
    for (let i = 0; i < 52; i++) rememberDraftOrigin(`d${i}`, request)
    expect(draftOrigin('d0')).toBeNull()
    expect(draftOrigin('d1')).toBeNull()
    expect(draftOrigin('d2')).toBe(request)
    rememberDraftOrigin('d2', other)
    const keys = Object.keys(JSON.parse(store.get('conker.tool-draft-origins') ?? '{}'))
    expect(keys.at(-1)).toBe('d2')
    expect(keys).toHaveLength(50)
  })
  it('forgets one draft, and does nothing for one it never saw', () => {
    rememberDraftOrigin('my-draft', request)
    forgetDraftOrigin('absent')
    expect(draftOrigin('my-draft')).toBe(request)
    forgetDraftOrigin('my-draft')
    expect(draftOrigin('my-draft')).toBeNull()
  })
  it('drops malformed stored entries and survives bad JSON', () => {
    store.set('conker.tool-draft-origins', JSON.stringify({ good: request, '1bad': request, wrong: 'creq_nope', num: 4 }))
    expect(draftOrigin('good')).toBe(request)
    expect(draftOrigin('1bad')).toBeNull()
    expect(draftOrigin('wrong')).toBeNull()
    store.set('conker.tool-draft-origins', '[1]')
    expect(draftOrigin('good')).toBeNull()
    store.set('conker.tool-draft-origins', 'null')
    expect(draftOrigin('good')).toBeNull()
    store.set('conker.tool-draft-origins', '{broken')
    expect(draftOrigin('good')).toBeNull()
  })
  it('does not throw when storage refuses writes', () => {
    broken = true
    expect(() => rememberDraftOrigin('my-draft', request)).not.toThrow()
  })
})

type Definition = GatewayTeamRun['snapshot']['definition']
const definition = {
  roles: [
    { id: 'writer', name: 'Writer' },
    { id: 'editor', name: 'Editor' },
    { id: 'checker', name: 'Checker' },
  ],
  handoffs: [
    { id: 'h1', fromRoleId: 'writer', toRoleId: 'editor', condition: null },
    { id: 'h2', fromRoleId: 'writer', toRoleId: 'checker', condition: 'if risky' },
  ],
} as unknown as Definition
const call = (over: Record<string, unknown>) => ({ state: 'complete', input_tokens: 10, output_tokens: 5, cost_usd: 0.5, ...over })
const run = (over: { state?: string; steps?: { role_id: string }[]; modelCalls?: unknown[]; definition?: Definition } = {}) =>
  ({ state: 'ready', steps: [], modelCalls: [], ...over, snapshot: { definition: over.definition ?? definition } }) as unknown as GatewayTeamRun

describe('team run view', () => {
  it('has plain words for every state', () => {
    expect(Object.keys(RUN_STATE_WORDS)).toHaveLength(7)
    expect(Object.keys(STEP_STATE_WORDS)).toHaveLength(5)
    for (const word of [...Object.values(RUN_STATE_WORDS), ...Object.values(STEP_STATE_WORDS)]) expect(word).toBeTruthy()
  })
  it('knows when a run is over', () => {
    expect(isOver(run({ state: 'completed' }))).toBe(true)
    expect(isOver(run({ state: 'cancelled' }))).toBe(true)
    expect(isOver(run({ state: 'held' }))).toBe(false)
  })
  it('names a role, with a fallback', () => {
    expect(roleName(definition, 'editor')).toBe('Editor')
    expect(roleName(definition, 'ghost')).toBe('A role')
  })
  it('starts at the role no handoff leads to, or the first role in a cycle', () => {
    expect(firstRole(definition).id).toBe('writer')
    const cycle = {
      roles: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      handoffs: [
        { id: 'x', fromRoleId: 'a', toRoleId: 'b', condition: null },
        { id: 'y', fromRoleId: 'b', toRoleId: 'a', condition: null },
      ],
    } as unknown as Definition
    expect(firstRole(cycle).id).toBe('a')
  })
  it('offers the first role before any step, then the handoffs from the last role', () => {
    expect(nextRoles(run())).toEqual([{ roleId: 'writer', roleName: 'Writer', handoffId: null, condition: null }])
    expect(nextRoles(run({ steps: [{ role_id: 'writer' }] }))).toEqual([
      { roleId: 'editor', roleName: 'Editor', handoffId: 'h1', condition: null },
      { roleId: 'checker', roleName: 'Checker', handoffId: 'h2', condition: 'if risky' },
    ])
    expect(nextRoles(run({ steps: [{ role_id: 'editor' }] }))).toEqual([])
  })
  it('offers nothing unless the run is between roles', () => {
    for (const state of ['running', 'held', 'blocked', 'interrupted', 'completed', 'cancelled']) expect(nextRoles(run({ state }))).toEqual([])
  })
  it('counts only measured use and names answers whose use is unknown', () => {
    expect(usageOf(run())).toEqual({ tokens: 0, costUsd: null, unknownAnswers: 0 })
    const usage = usageOf(
      run({
        modelCalls: [
          call({}),
          call({ cost_usd: 0.25 }),
          call({ state: 'running', input_tokens: 999 }),
          call({ state: 'unknown' }),
          call({ input_tokens: null }),
          call({ output_tokens: null }),
          call({ cost_usd: null, input_tokens: 1, output_tokens: 1 }),
        ],
      }),
    )
    expect(usage).toEqual({ tokens: 32, costUsd: 0.75, unknownAnswers: 3 })
    expect(usageOf(run({ modelCalls: [call({ cost_usd: null })] }))).toEqual({ tokens: 15, costUsd: null, unknownAnswers: 0 })
  })
  it('says where the run stands in each state', () => {
    expect(runSummary(run({ state: 'completed' }))).toContain('marked this run finished')
    expect(runSummary(run({ state: 'cancelled' }))).toContain('was cancelled')
    const last = { steps: [{ role_id: 'editor' }] }
    expect(runSummary(run({ state: 'running', ...last }))).toMatch(/^Editor is working/)
    expect(runSummary(run({ state: 'running' }))).toMatch(/^A role is working/)
    expect(runSummary(run({ state: 'held', ...last }))).toMatch(/^Editor wants to use a tool/)
    expect(runSummary(run({ state: 'held' }))).toMatch(/^A role wants to use a tool/)
    expect(runSummary(run({ state: 'blocked', ...last }))).toMatch(/^Editor stopped before/)
    expect(runSummary(run({ state: 'blocked' }))).toMatch(/^A role stopped before/)
    expect(runSummary(run({ state: 'interrupted', ...last }))).toContain('while Editor was working')
    expect(runSummary(run({ state: 'interrupted' }))).toContain('while a role was working')
  })
  it('says what comes next when the run is between roles', () => {
    expect(runSummary(run())).toBe('No role has run yet. It starts with Writer.')
    expect(runSummary(run({ steps: [{ role_id: 'editor' }] }))).toBe('Editor answered. That was the last role: read its answer, then mark the run finished.')
    expect(runSummary(run({ steps: [{ role_id: 'writer' }] }))).toContain('choose who goes next')
    const single = { roles: definition.roles, handoffs: [definition.handoffs[0]] } as unknown as Definition
    expect(runSummary(run({ steps: [{ role_id: 'writer' }], definition: single }))).toBe('Writer answered. Read the answer first; Editor is next, or end the run.')
  })
})
