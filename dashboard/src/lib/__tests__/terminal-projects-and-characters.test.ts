import { describe, expect, it } from 'vitest'
import { createCharacterStudio } from '../api/character'
import { GatewayCharacterMutationError, createGatewayCharactersClient } from '../gateway/characters'
import { GatewayProjectMutationError, createGatewayProjectsClient, projectReferenceKey, type ProjectReference } from '../gateway/projects'
import { createGatewayTerminalClient, createTerminalRequestId, decodeTerminalOutput, encodeTerminalInput } from '../gateway/terminal'
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

describe('terminal', () => {
  const lease = 'l'.repeat(20)

  it('makes a request id and encodes input as base64 within 1 to 8192 bytes', () => {
    expect(createTerminalRequestId()).toMatch(/^browser_[0-9a-f]{32}$/)
    expect(encodeTerminalInput(new TextEncoder().encode('ls\n'))).toBe('bHMK')
    expect(() => encodeTerminalInput(new Uint8Array())).toThrow(expect.objectContaining({ kind: 'validation' }))
    expect(() => encodeTerminalInput(new Uint8Array(8193))).toThrow(expect.objectContaining({ kind: 'validation' }))
    expect(encodeTerminalInput(new Uint8Array(8192))).toHaveLength(Math.ceil(8192 / 3) * 4)
  })

  it('decodes output back to bytes and refuses what is not base64', () => {
    expect([...decodeTerminalOutput('bHMK')]).toEqual([108, 115, 10])
    expect(() => decodeTerminalOutput('***')).toThrow(expect.objectContaining({ kind: 'invalid-response' }))
  })

  it('reads the current terminal, with or without a lease', async () => {
    const current = { lease: null, workspace: 'home', maximumLifetimeSeconds: 600, commandsPersisted: false, outputPersisted: false }
    const { auth, calls } = fakeAuth(current)
    expect(await createGatewayTerminalClient(auth).current()).toEqual(current)
    expect(calls[0].path).toBe('/api/terminal/current')
    await kind(createGatewayTerminalClient(fakeAuth({ ...current, commandsPersisted: true }).auth).current(), 'invalid-response')
  })

  it('opens a terminal under the request id and wants that id back', async () => {
    const { auth, calls } = fakeAuth({ id: lease, closed: false, replayed: false })
    expect((await createGatewayTerminalClient(auth).create(lease)).id).toBe(lease)
    expect(calls[0]).toEqual({ path: '/api/terminal', init: { method: 'POST', body: { requestId: lease }, signal: undefined } })
    await kind(createGatewayTerminalClient(fakeAuth({ id: 'o'.repeat(20), closed: false, replayed: false }).auth).create(lease), 'invalid-response')
    await kind(createGatewayTerminalClient(auth).create('short'), 'validation')
  })

  it('reads output from a cursor', async () => {
    const read = { data: 'bHMK', encoding: 'base64', cursor: 3, droppedBytes: 0, exitCode: null }
    const { auth, calls } = fakeAuth(read)
    expect(await createGatewayTerminalClient(auth).read(lease, 0)).toEqual(read)
    expect(calls[0]).toEqual({ path: `/api/terminal/${lease}`, init: { query: { cursor: 0 }, signal: undefined } })
    await kind(createGatewayTerminalClient(auth).read(lease, -1), 'validation')
    await kind(createGatewayTerminalClient(auth).read('x', 0), 'validation')
    await kind(createGatewayTerminalClient(fakeAuth({ ...read, data: '***' }).auth).read(lease, 0), 'invalid-response')
  })

  it('sends input and wants every byte acknowledged', async () => {
    const bytes = new TextEncoder().encode('ls\n')
    const { auth, calls } = fakeAuth({ acceptedBytes: 3, automaticReplay: false })
    expect((await createGatewayTerminalClient(auth).input(lease, bytes)).acceptedBytes).toBe(3)
    expect(calls[0]).toEqual({ path: `/api/terminal/${lease}/input`, init: { method: 'POST', body: { data: 'bHMK' }, signal: undefined } })
    await kind(createGatewayTerminalClient(fakeAuth({ acceptedBytes: 2, automaticReplay: false }).auth).input(lease, bytes), 'invalid-response')
    await kind(createGatewayTerminalClient(auth).input('x', bytes), 'validation')
  })

  it('resizes within 2 to 200 rows and 10 to 400 columns, and closes', async () => {
    const { auth, calls } = fakeAuth({ resized: true }, { closed: true })
    const client = createGatewayTerminalClient(auth)
    await client.resize(lease, 24, 80)
    await client.close(lease)
    expect(calls[0]).toEqual({ path: `/api/terminal/${lease}/resize`, init: { method: 'POST', body: { rows: 24, columns: 80 }, signal: undefined } })
    expect(calls[1]).toEqual({ path: `/api/terminal/${lease}/close`, init: { method: 'POST', body: {}, signal: undefined } })
    await kind(client.resize(lease, 1, 80), 'validation')
    await kind(client.resize(lease, 24, 9), 'validation')
    await kind(client.resize('x', 24, 80), 'validation')
    await kind(client.close('x'), 'validation')
  })
})

describe('projects', () => {
  const pid = `project_${hex('a')}`
  const sid = `ses_${hex('b', 16)}`
  const link = {
    reference: { kind: 'conversation', sessionId: sid },
    mode: 'live-reference',
    snapshot: { originSessionId: sid, linkedAt: 1 },
    availability: 'available',
    label: 'Trip chat',
    labelSource: 'live-source',
    privacy: null,
  }
  const project = (overrides: Record<string, unknown> = {}) => ({
    schemaVersion: 1,
    id: pid,
    revision: 2,
    name: 'Trip',
    description: '',
    instructions: '',
    createdAt: 1,
    updatedAt: 2,
    archivedAt: null,
    links: [link],
    authority: 'none',
    contentIncluded: false,
    grantsInherited: false,
    ...overrides,
  })
  const fields = { name: 'Trip', description: 'Plan', instructions: 'Be brief' }
  const base = '/api/control/pi/projects'

  it('keys each kind of reference differently', () => {
    expect(projectReferenceKey({ kind: 'conversation', sessionId: sid })).toBe(`conversation:${sid}`)
    expect(projectReferenceKey({ kind: 'task', taskId: `tsk_${hex('c')}` })).toBe(`task:tsk_${hex('c')}`)
    expect(projectReferenceKey({ kind: 'file', sessionId: sid, fileId: `attachment_${hex('d')}` })).toBe(`file:${sid}:attachment_${hex('d')}`)
  })

  it('lists projects with the default limit, or a limit and a cursor', async () => {
    const page = { schemaVersion: 1, results: [project()], nextCursor: null }
    const { auth, calls } = fakeAuth(page)
    const client = createGatewayProjectsClient(auth)
    expect(await client.list()).toEqual(page)
    await client.list({ limit: 5, cursor: pid })
    expect(calls.map(call => [call.path, call.init.query])).toEqual([
      [`${base}`, { limit: 100 }],
      [`${base}`, { limit: 5, cursor: pid }],
    ])
  })

  it('refuses a bad limit or cursor, too many results and repeated projects', async () => {
    const { auth } = fakeAuth({ schemaVersion: 1, results: [project()], nextCursor: null })
    const client = createGatewayProjectsClient(auth)
    await kind(client.list({ limit: 0 }), 'validation')
    await kind(client.list({ limit: 201 }), 'validation')
    await kind(client.list({ limit: 1.5 }), 'validation')
    await kind(client.list({ cursor: 'next' }), 'validation')
    await kind(createGatewayProjectsClient(fakeAuth({ schemaVersion: 1, results: [project(), project({ id: `project_${hex('e')}` })], nextCursor: null }).auth).list({ limit: 1 }), 'invalid-response')
    await kind(createGatewayProjectsClient(fakeAuth({ schemaVersion: 1, results: [project(), project()], nextCursor: null }).auth).list(), 'invalid-response')
  })

  it('reads one project and wants that project back', async () => {
    const { auth, calls } = fakeAuth(project())
    expect((await createGatewayProjectsClient(auth).get(pid)).id).toBe(pid)
    expect(calls[0].path).toBe(`${base}/${pid}`)
    await kind(createGatewayProjectsClient(auth).get('nope'), 'validation')
    await kind(createGatewayProjectsClient(fakeAuth(project({ id: `project_${hex('e')}` })).auth).get(pid), 'invalid-response')
  })

  it('creates, updates, archives, links and unlinks, each at the revision it saw', async () => {
    const { auth, calls } = fakeAuth(project())
    const client = createGatewayProjectsClient(auth)
    const reference: ProjectReference = { kind: 'task', taskId: `tsk_${hex('c')}` }
    await client.create(fields)
    await client.update(pid, fields, 2)
    await client.archive(pid, true, 2)
    await client.link(pid, reference, 2)
    await client.unlink(pid, reference, 2)
    expect(calls.map(call => [call.path, call.init.body])).toEqual([
      [base, fields],
      [`${base}/${pid}/update`, { expected_revision: 2, fields }],
      [`${base}/${pid}/archive`, { expected_revision: 2, archived: true }],
      [`${base}/${pid}/link`, { expected_revision: 2, reference }],
      [`${base}/${pid}/unlink`, { expected_revision: 2, reference }],
    ])
  })

  it('refuses malformed input before anything is sent', async () => {
    const { auth, calls } = fakeAuth(project())
    const client = createGatewayProjectsClient(auth)
    expect(() => client.create({ ...fields, name: '   ' })).toThrow(expect.objectContaining({ kind: 'validation' }))
    expect(() => client.update('nope', fields, 1)).toThrow(expect.objectContaining({ kind: 'validation' }))
    expect(() => client.update(pid, fields, 0)).toThrow(expect.objectContaining({ kind: 'validation' }))
    expect(() => client.archive(pid, 'yes' as never, 1)).toThrow(expect.objectContaining({ kind: 'validation' }))
    expect(() => client.link(pid, { kind: 'task', taskId: 'x' }, 1)).toThrow(expect.objectContaining({ kind: 'validation' }))
    expect(() => client.unlink(pid, { kind: 'task', taskId: 'x' }, 1)).toThrow(expect.objectContaining({ kind: 'validation' }))
    expect(calls).toEqual([])
  })

  it('refuses a write answer for another project or a malformed one, as a bad answer rather than a bad save', async () => {
    await kind(createGatewayProjectsClient(fakeAuth(project({ id: `project_${hex('e')}` })).auth).update(pid, fields, 2), 'invalid-response')
    await kind(createGatewayProjectsClient(fakeAuth({ nope: 1 }).auth).create(fields), 'invalid-response')
  })

  it('tells a conflict, a refusal and an uncertain outcome apart', async () => {
    const failing = (error: Error) => createGatewayProjectsClient(fakeAuth(error).auth).create(fields)
    const conflict = await failing(new GatewayError('http', 409)).catch(error => error)
    expect(conflict).toBeInstanceOf(GatewayProjectMutationError)
    expect(conflict).toMatchObject({ outcome: 'conflict', status: 409, message: 'This project changed elsewhere. Reload its current revision before making another change.' })
    const byKind = await failing(new GatewayError('upstream-denied')).catch(error => error)
    expect(byKind).toMatchObject({ outcome: 'rejected', message: new GatewayError('upstream-denied').message })
    const byStatus = await failing(new GatewayError('http', 422)).catch(error => error)
    expect(byStatus).toMatchObject({ outcome: 'rejected', status: 422 })
    const unknown = await failing(new GatewayError('network')).catch(error => error)
    expect(unknown).toMatchObject({ name: 'GatewayProjectMutationError', outcome: 'unknown', status: undefined })
    expect(unknown.message).toContain('uncertain')
    expect(await failing(new GatewayError('http', 500)).catch(error => error)).toMatchObject({ outcome: 'unknown' })
  })
})

describe('companion character', () => {
  const profile = (overrides: Record<string, unknown> = {}) => ({
    name: 'Sprout',
    mood: 'calm',
    personality: '',
    speakingStyle: '',
    speakingPreset: 'custom',
    portrait: '',
    renderer: 'static',
    face: 'sprout',
    tone: 'green',
    emotions: { neutral: 'default', happy: 'default', thinking: 'default', concerned: 'default', celebrating: 'default' },
    studio: createCharacterStudio(),
    ...overrides,
  })
  const saved = (revision: number, value: unknown = profile()) => ({ agentId: 'companion', revision, profile: value })
  const base = '/api/control/pi/characters/companion'

  it('reads the current character, or one revision it must get back', async () => {
    const { auth, calls } = fakeAuth(saved(3), saved(2))
    const client = createGatewayCharactersClient(auth)
    expect((await client.get()).revision).toBe(3)
    expect((await client.get(2)).revision).toBe(2)
    expect(calls.map(call => call.init.query)).toEqual([undefined, { revision: 2 }])
    await kind(client.get(0), 'validation')
    await kind(createGatewayCharactersClient(fakeAuth(saved(3)).auth).get(2), 'invalid-response')
  })

  it('reads the history only when its revisions run 1, 2, 3 in order', async () => {
    const item = (revision: number) => ({ revision, created_at: revision, restored_from: null })
    const { auth, calls } = fakeAuth({ results: [item(1), item(2)] })
    expect((await createGatewayCharactersClient(auth).history()).map(entry => entry.revision)).toEqual([1, 2])
    expect(calls[0].path).toBe(`${base}/history`)
    await kind(createGatewayCharactersClient(fakeAuth({ results: [item(2)] }).auth).history(), 'invalid-response')
  })

  it('saves a validated character at the revision it saw', async () => {
    const { auth, calls } = fakeAuth(saved(4))
    const client = createGatewayCharactersClient(auth)
    expect((await client.save(profile() as never, 3)).revision).toBe(4)
    expect(calls[0].path).toBe(`${base}/save`)
    expect(calls[0].init.body).toMatchObject({ expected_revision: 3, profile: { name: 'Sprout' } })
    expect(() => client.save(profile({ name: '   ' }) as never, 3)).toThrow('Give your character a name.')
    expect(() => client.save(profile() as never, 101)).toThrow(expect.objectContaining({ kind: 'validation' }))
  })

  it('restores an earlier revision', async () => {
    const { auth, calls } = fakeAuth(saved(5))
    await createGatewayCharactersClient(auth).restore(2, 4)
    expect(calls[0]).toEqual({ path: `${base}/restore`, init: { method: 'POST', body: { expected_revision: 4, revision: 2 } } })
    expect(() => createGatewayCharactersClient(auth).restore(0, 4)).toThrow(expect.objectContaining({ kind: 'validation' }))
    expect(() => createGatewayCharactersClient(auth).restore(2, 0)).toThrow(expect.objectContaining({ kind: 'validation' }))
  })

  it('tells a conflict, a refusal and an uncertain save apart, and keeps a bad answer as one', async () => {
    const failing = (error: Error) => createGatewayCharactersClient(fakeAuth(error).auth).restore(1, 1)
    const conflict = await failing(new GatewayError('http', 409)).catch(error => error)
    expect(conflict).toBeInstanceOf(GatewayCharacterMutationError)
    expect(conflict).toMatchObject({ outcome: 'conflict', message: 'The Companion changed elsewhere. Reload before saving this draft.' })
    expect(await failing(new GatewayError('verification-cancelled')).catch(error => error)).toMatchObject({ outcome: 'rejected', message: new GatewayError('verification-cancelled').message })
    expect(await failing(new GatewayError('http', 429)).catch(error => error)).toMatchObject({ outcome: 'rejected' })
    expect(await failing(new GatewayError('aborted')).catch(error => error)).toMatchObject({ name: 'GatewayCharacterMutationError', outcome: 'unknown' })
    await kind(createGatewayCharactersClient(fakeAuth({ nope: 1 }).auth).restore(1, 1), 'invalid-response')
  })

  it('imports a character file, within 32 MB, and exports one revision or the current', async () => {
    const imported = { profile: profile(), note: 'Imported from file' }
    const exported = { format: 'conker-character', version: 1, character: profile() }
    const { auth, calls } = fakeAuth(imported, exported)
    const client = createGatewayCharactersClient(auth)
    expect((await client.importDraft('{}')).note).toBe('Imported from file')
    expect(calls[0]).toEqual({ path: `${base}/import`, init: { method: 'POST', body: { text: '{}' } } })
    expect((await client.export(2)).version).toBe(1)
    await client.export()
    expect(calls.slice(1).map(call => call.init.query)).toEqual([{ revision: 2 }, undefined])
    await kind(client.importDraft(''), 'validation')
    await kind(client.importDraft('x'.repeat(32 * 1024 * 1024 + 1)), 'validation')
    await kind(client.export(0), 'validation')
  })
})
