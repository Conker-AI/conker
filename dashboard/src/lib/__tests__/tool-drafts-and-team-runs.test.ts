import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { GatewayTeamRun } from '../gateway/team-runs'
import { draftOrigin, forgetDraftOrigin, rememberDraftOrigin } from '../tool-draft-origin'
import { TEAM_RUNS_LIMIT, forgetTeamRun, readOpenedTeamRuns, rememberTeamRun } from '../team-run-memory'
import { RUN_STATE_WORDS, STEP_STATE_WORDS, firstRole, isOver, nextRoles, roleName, runSummary, usageOf } from '../team-run-view'

const data = new Map<string, string>()
let failWrites = false
beforeEach(() => {
  data.clear()
  failWrites = false
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (failWrites) throw new Error('blocked')
        data.set(key, value)
      },
    },
  })
})
afterEach(() => {
  Reflect.deleteProperty(globalThis, 'localStorage')
})

const request = (n: number) => `creq_${n.toString(16).padStart(32, '0')}`

describe('tool draft origin', () => {
  it('remembers which request a draft came from', () => {
    rememberDraftOrigin('my-draft', request(1))
    expect(draftOrigin('my-draft')).toBe(request(1))
    expect(draftOrigin('other')).toBeNull()
  })

  it('prefers the request in the address, but only when it is well formed', () => {
    rememberDraftOrigin('my-draft', request(1))
    expect(draftOrigin('my-draft', request(2))).toBe(request(2))
    expect(draftOrigin('my-draft', 'creq_nope')).toBe(request(1))
    expect(draftOrigin('my-draft', null)).toBe(request(1))
  })

  it('ignores ids that are not well formed', () => {
    rememberDraftOrigin('1starts-with-digit', request(1))
    rememberDraftOrigin('ok', 'creq_short')
    expect(data.size).toBe(0)
  })

  it('keeps only the newest 50 and moves a repeated draft to the end', () => {
    for (let i = 0; i < 55; i++) rememberDraftOrigin(`d${i}`, request(i))
    rememberDraftOrigin('d10', request(99))
    const stored = JSON.parse(data.get('conker.tool-draft-origins') ?? '{}') as Record<string, string>
    const keys = Object.keys(stored)
    expect(keys).toHaveLength(50)
    expect(keys.at(-1)).toBe('d10')
    expect(stored.d10).toBe(request(99))
    expect(stored.d0).toBeUndefined()
  })

  it('forgets one draft and leaves the others', () => {
    rememberDraftOrigin('a', request(1))
    rememberDraftOrigin('b', request(2))
    forgetDraftOrigin('a')
    expect(draftOrigin('a')).toBeNull()
    expect(draftOrigin('b')).toBe(request(2))
    expect(() => forgetDraftOrigin('never-there')).not.toThrow()
  })

  it('drops damaged or foreign entries instead of failing', () => {
    data.set('conker.tool-draft-origins', 'not json')
    expect(draftOrigin('a')).toBeNull()
    data.set('conker.tool-draft-origins', '[1,2]')
    expect(draftOrigin('a')).toBeNull()
    data.set('conker.tool-draft-origins', JSON.stringify({ a: request(1), b: 'creq_bad', 'c d': request(3), e: 5 }))
    expect(draftOrigin('a')).toBe(request(1))
    expect(draftOrigin('b')).toBeNull()
    expect(draftOrigin('e')).toBeNull()
  })

  it('works when storage is missing or refuses writes', () => {
    failWrites = true
    expect(() => rememberDraftOrigin('a', request(1))).not.toThrow()
    expect(draftOrigin('a')).toBeNull()
    Reflect.deleteProperty(globalThis, 'localStorage')
    expect(draftOrigin('a', request(4))).toBe(request(4))
    expect(draftOrigin('a')).toBeNull()
  })
})

describe('team run memory', () => {
  const id = (n: number) => `teamrun_${n.toString(16).padStart(32, '0')}`

  it('lists the newest first and moves a reopened run to the front', () => {
    rememberTeamRun(id(1), 10)
    rememberTeamRun(id(2), 20)
    expect(rememberTeamRun(id(1), 30)).toEqual([
      { id: id(1), at: 30 },
      { id: id(2), at: 20 },
    ])
    expect(readOpenedTeamRuns()).toEqual([
      { id: id(1), at: 30 },
      { id: id(2), at: 20 },
    ])
  })

  it('refuses an id that is not a team run id', () => {
    rememberTeamRun(id(1), 10)
    expect(rememberTeamRun('teamrun_short', 5)).toEqual([{ id: id(1), at: 10 }])
    expect(readOpenedTeamRuns()).toHaveLength(1)
  })

  it('keeps only the limit', () => {
    for (let i = 0; i < TEAM_RUNS_LIMIT + 4; i++) rememberTeamRun(id(i), i + 1)
    const runs = readOpenedTeamRuns()
    expect(runs).toHaveLength(TEAM_RUNS_LIMIT)
    expect(runs[0].id).toBe(id(TEAM_RUNS_LIMIT + 3))
  })

  it('forgets one run', () => {
    rememberTeamRun(id(1), 1)
    rememberTeamRun(id(2), 2)
    expect(forgetTeamRun(id(1))).toEqual([{ id: id(2), at: 2 }])
    expect(readOpenedTeamRuns()).toEqual([{ id: id(2), at: 2 }])
  })

  it('survives damaged storage and drops bad rows', () => {
    data.set('conker.team-runs', '{oops')
    expect(readOpenedTeamRuns()).toEqual([])
    data.set('conker.team-runs', '{}')
    expect(readOpenedTeamRuns()).toEqual([])
    data.set('conker.team-runs', JSON.stringify([{ id: id(1), at: 5 }, { id: id(2), at: 0 }, { id: id(3), at: 'x' }, { id: 'bad', at: 1 }, null, 7]))
    expect(readOpenedTeamRuns()).toEqual([{ id: id(1), at: 5 }])
  })

  it('still answers when storage refuses writes or is missing', () => {
    failWrites = true
    expect(rememberTeamRun(id(1), 1)).toEqual([{ id: id(1), at: 1 }])
    expect(forgetTeamRun(id(1))).toEqual([])
    expect(readOpenedTeamRuns()).toEqual([])
    Reflect.deleteProperty(globalThis, 'localStorage')
    expect(rememberTeamRun(id(2), 2)).toEqual([{ id: id(2), at: 2 }])
  })
})

describe('team run view', () => {
  type Overrides = { state?: GatewayTeamRun['state']; steps?: string[]; calls?: Partial<GatewayTeamRun['modelCalls'][number]>[] }
  /** writer -> editor -> publisher, with a conditional handoff editor -> publisher. */
  function run({ state = 'ready', steps = [], calls = [] }: Overrides = {}): GatewayTeamRun {
    return {
      id: 'run',
      state,
      steps: steps.map(role_id => ({ role_id })),
      modelCalls: calls,
      snapshot: {
        definition: {
          roles: [
            { id: 'writer', name: 'Writer' },
            { id: 'editor', name: 'Editor' },
            { id: 'publisher', name: 'Publisher' },
          ],
          handoffs: [
            { id: 'h1', fromRoleId: 'writer', toRoleId: 'editor', condition: null },
            { id: 'h2', fromRoleId: 'editor', toRoleId: 'publisher', condition: 'if approved' },
          ],
        },
      },
    } as unknown as GatewayTeamRun
  }

  it('has words for every state', () => {
    expect(Object.values(RUN_STATE_WORDS).every(Boolean)).toBe(true)
    expect(Object.keys(RUN_STATE_WORDS)).toHaveLength(7)
    expect(Object.keys(STEP_STATE_WORDS)).toHaveLength(5)
  })

  it('knows when a run is over', () => {
    expect(isOver(run({ state: 'completed' }))).toBe(true)
    expect(isOver(run({ state: 'cancelled' }))).toBe(true)
    expect(isOver(run({ state: 'blocked' }))).toBe(false)
  })

  it('names roles, with a fallback for an unknown one', () => {
    const { definition } = run().snapshot
    expect(roleName(definition, 'editor')).toBe('Editor')
    expect(roleName(definition, 'ghost')).toBe('A role')
  })

  it('starts with the role no handoff leads to, else the first role', () => {
    const { definition } = run().snapshot
    expect(firstRole(definition).id).toBe('writer')
    const loop = {
      roles: definition.roles.slice(0, 2),
      handoffs: [
        { id: 'a', fromRoleId: 'writer', toRoleId: 'editor', condition: null },
        { id: 'b', fromRoleId: 'editor', toRoleId: 'writer', condition: null },
      ],
    }
    expect(firstRole(loop as unknown as typeof definition).id).toBe('writer')
  })

  it('offers next roles only between roles', () => {
    expect(nextRoles(run())).toEqual([{ roleId: 'writer', roleName: 'Writer', handoffId: null, condition: null }])
    expect(nextRoles(run({ steps: ['writer'] }))).toEqual([{ roleId: 'editor', roleName: 'Editor', handoffId: 'h1', condition: null }])
    expect(nextRoles(run({ steps: ['writer', 'editor'] }))[0]).toMatchObject({ roleId: 'publisher', condition: 'if approved' })
    expect(nextRoles(run({ steps: ['editor', 'publisher'] }))).toEqual([])
    for (const state of ['running', 'held', 'blocked', 'interrupted', 'completed', 'cancelled'] as const) expect(nextRoles(run({ state, steps: ['writer'] }))).toEqual([])
  })

  it('counts only what Pi measured and names the answers it could not', () => {
    const calls = [
      { state: 'complete', input_tokens: 100, output_tokens: 50, cost_usd: 0.25 },
      { state: 'complete', input_tokens: 10, output_tokens: 5, cost_usd: null },
      { state: 'complete', input_tokens: null, output_tokens: 5, cost_usd: 1 },
      { state: 'unknown', input_tokens: 1, output_tokens: 1, cost_usd: 1 },
      { state: 'running', input_tokens: null, output_tokens: null, cost_usd: null },
    ] as Overrides['calls']
    expect(usageOf(run({ calls }))).toEqual({ tokens: 165, costUsd: 0.25, unknownAnswers: 2 })
    expect(usageOf(run())).toEqual({ tokens: 0, costUsd: null, unknownAnswers: 0 })
    expect(usageOf(run({ calls: [{ state: 'complete', input_tokens: 1, output_tokens: 1, cost_usd: null }] })).costUsd).toBeNull()
  })

  it('says where each run stands', () => {
    expect(runSummary(run({ state: 'completed' }))).toContain('marked this run finished')
    expect(runSummary(run({ state: 'cancelled' }))).toContain('was cancelled')
    expect(runSummary(run({ state: 'running', steps: ['writer'] }))).toMatch(/^Writer is working/)
    expect(runSummary(run({ state: 'running' }))).toMatch(/^A role is working/)
    expect(runSummary(run({ state: 'held', steps: ['editor'] }))).toContain('Editor wants to use a tool')
    expect(runSummary(run({ state: 'blocked', steps: ['editor'] }))).toContain('Editor stopped before it finished')
    expect(runSummary(run({ state: 'interrupted', steps: ['editor'] }))).toContain('while Editor was working')
    expect(runSummary(run({ state: 'interrupted' }))).toContain('while a role was working')
  })

  it('says what is next when the run is between roles', () => {
    expect(runSummary(run())).toBe('No role has run yet. It starts with Writer.')
    expect(runSummary(run({ steps: ['writer'] }))).toBe('Writer answered. Read the answer first; Editor is next, or end the run.')
    expect(runSummary(run({ steps: ['publisher'] }))).toBe('Publisher answered. That was the last role: read its answer, then mark the run finished.')
    const choice = run({ steps: ['writer'] })
    choice.snapshot.definition.handoffs.push({ id: 'h3', fromRoleId: 'writer', toRoleId: 'publisher', condition: null } as never)
    expect(runSummary(choice)).toContain('choose who goes next')
  })
})
