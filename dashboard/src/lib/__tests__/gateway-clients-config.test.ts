import { describe, expect, it } from 'vitest'
import { chatFeatureFix, chatFeatureMessage, chatFeatureTextFix } from '../gateway/chat-feature-errors'
import { createGatewayMcpClient, readClassMessage, type McpDiscovery, type McpTool } from '../gateway/mcp'
import { SKILL_BROWSER_MAX_BYTES, SKILL_MAX_CHARACTERS, createGatewaySkillsClient, parseSkill, parseSkills, skillImportBytes, validateSkillIds } from '../gateway/skills'
import { createGatewayProposalClient, parseProposal } from '../gateway/proposals'
import { createRecallNoticesClient } from '../gateway/recall-notices'
import { GatewayError } from '../gateway/transport'

type Call = { path: string; init: Record<string, unknown> }
function fakeAuth(...answers: unknown[]) {
  const calls: Call[] = []
  const queue = [...answers]
  const request = async (path: string, init: Record<string, unknown> = {}) => {
    calls.push({ path, init })
    return queue.length > 1 ? queue.shift() : queue[0]
  }
  return { calls, auth: { request } as never }
}
const kind = (promise: Promise<unknown>, expected: string) => expect(promise).rejects.toMatchObject({ name: 'GatewayError', kind: expected })
const hex = (character: string, length = 32) => character.repeat(length)

describe('chat feature errors', () => {
  it('turns refusal codes into plain words', () => {
    expect(chatFeatureMessage(new GatewayError('http', 409, undefined, 'revision_conflict'))).toBe('This changed somewhere else. Reload the chat and try again.')
    expect(chatFeatureMessage(new GatewayError('http', 409, undefined, 'session_busy'))).toBe('Conker is still answering in this chat. Try again when it finishes.')
    expect(chatFeatureMessage(new GatewayError('http', 404, undefined, 'not_found'))).toBe('This is no longer available.')
  })

  it('falls back to the standard message for anything else', () => {
    expect(chatFeatureMessage(new Error('boom'))).toBe(new GatewayError('network').message)
    expect(chatFeatureMessage(new GatewayError('http', 500))).toBe(new GatewayError('http').message)
    expect(chatFeatureMessage(new GatewayError('http', 500, undefined, 'mystery' as never))).toBe(new GatewayError('http').message)
  })

  it('points the fixable refusals at the Models settings', () => {
    expect(chatFeatureFix(new GatewayError('http', 400, undefined, 'not_configured'))).toEqual({ label: 'Choose a model', to: '/settings?tab=models' })
    expect(chatFeatureFix(new GatewayError('http', 400, undefined, 'unknown_model'))).toEqual({ label: 'Open Models', to: '/settings?tab=models' })
    expect(chatFeatureFix(new GatewayError('http', 400, undefined, 'unavailable'))).toEqual({ label: 'Open Models', to: '/settings?tab=models' })
    expect(chatFeatureFix(new GatewayError('http', 400, undefined, 'session_closed'))).toBeUndefined()
    expect(chatFeatureFix(new GatewayError('network'))).toBeUndefined()
  })

  it('finds the fix again from the sentence alone', () => {
    expect(chatFeatureTextFix('No model is set up for this.')).toEqual({ label: 'Choose a model', to: '/settings?tab=models' })
    expect(chatFeatureTextFix('That model is not set up.')).toEqual({ label: 'Open Models', to: '/settings?tab=models' })
    expect(chatFeatureTextFix('This chat is closed.')).toBeUndefined()
    expect(chatFeatureTextFix('anything else')).toBeUndefined()
  })
})

describe('MCP client', () => {
  const digest = hex('a', 64)
  const url = 'https://tools.example.com/mcp'
  const tool: McpTool = { id: 'mcp.notes', name: 'Notes', description: 'Take notes', status: 'active', authorization: 'owner_confirmation', url, tool_name: 'notes', schema_hash: digest, secret_ref: null, version: 1, digest: hex('b', 64) }
  const found: McpDiscovery = {
    schemaVersion: 1,
    server: { url, name: 'Notes server', version: '1' },
    tools: [
      { name: 'notes', description: ' Take notes ', inputSchema: { type: 'object' }, schemaHash: digest },
      { name: 'blank', description: '  ', inputSchema: {}, schemaHash: digest },
    ],
  }

  it('lists tools and refuses a bad row', async () => {
    const { auth, calls } = fakeAuth({ schemaVersion: 1, tools: [tool] })
    expect(await createGatewayMcpClient(auth).list()).toEqual([tool])
    expect(calls[0].path).toBe('/api/owner/mcp/tools')
    await kind(createGatewayMcpClient(fakeAuth({ schemaVersion: 1, tools: [{ ...tool, authorization: 'auto' }] }).auth).list(), 'invalid-response')
  })

  it('discovers only over plain https without credentials, ports or queries', async () => {
    const { auth, calls } = fakeAuth(found)
    const client = createGatewayMcpClient(auth)
    expect(await client.discover(url, 'MY_SECRET')).toEqual(found)
    expect(calls[0]).toEqual({ path: '/api/owner/mcp/discover', init: { method: 'POST', body: { url, secret_ref: 'MY_SECRET' } } })
    for (const bad of [
      'http://tools.example.com/mcp',
      'https://u:p@tools.example.com/',
      'https://tools.example.com:8443/',
      'https://tools.example.com/?a=1',
      'https://tools.example.com/#x',
      'https://tools.example.com/a b',
      'not a url',
      'https://tools.example.com/' + 'a'.repeat(2048),
    ]) {
      await kind(client.discover(bad, null), 'validation')
    }
    await kind(client.discover(url, 'lowercase'), 'validation')
    await kind(createGatewayMcpClient(fakeAuth({ ...found, server: { ...found.server, url: 'https://other.example.com/mcp' } }).auth).discover(url, null), 'invalid-response')
    expect(calls).toHaveLength(1)
  })

  it('imports exactly one named tool and checks what came back', async () => {
    const saved = { schemaVersion: 1, tool }
    const { auth, calls } = fakeAuth(saved)
    const client = createGatewayMcpClient(auth)
    expect(await client.import(found, 'notes', 'mcp.notes', null)).toEqual(tool)
    expect(calls[0].init.body).toEqual({ id: 'mcp.notes', name: 'notes', description: 'Take notes', url, tool_name: 'notes', input_schema: { type: 'object' }, schema_hash: digest, secret_ref: null })
    await client.import(found, 'blank', 'mcp.notes', null).catch(() => undefined)
    expect((calls[1].init.body as { description: string }).description).toBe('MCP tool blank')
    await kind(client.import(found, 'missing', 'mcp.notes', null), 'validation')
    await kind(client.import(found, 'notes', 'Bad Id', null), 'validation')
    await kind(client.import({ ...found, tools: [found.tools[0], found.tools[0]] }, 'notes', 'mcp.notes', null), 'validation')
    await kind(client.import({ nope: true } as never, 'notes', 'mcp.notes', null), 'validation')
    await kind(createGatewayMcpClient(fakeAuth({ schemaVersion: 1, tool: { ...tool, id: 'mcp.other' } }).auth).import(found, 'notes', 'mcp.notes', null), 'invalid-response')
  })

  it('switches a tool on or off and checks the new state', async () => {
    const { auth, calls } = fakeAuth({ schemaVersion: 1, tool: { ...tool, status: 'disabled' } })
    const client = createGatewayMcpClient(auth)
    expect((await client.setEnabled(tool, false)).status).toBe('disabled')
    expect(calls[0]).toEqual({ path: '/api/owner/mcp/tools/mcp.notes/state', init: { method: 'POST', body: { expected_digest: tool.digest, enabled: false } } })
    await kind(client.setEnabled(tool, true), 'invalid-response')
    await kind(client.setEnabled({ ...tool, id: 'bad' }, true), 'validation')
    await kind(client.setEnabled(tool, 'yes' as never), 'validation')
  })

  const access = { schemaVersion: 1, toolId: 'mcp.notes', actorId: 'a1', actorName: 'Agent', enabled: true, requiredScope: 'tool:mcp.notes', digest: tool.digest }

  it('reads an agent’s access and checks the reply is about this tool and version', async () => {
    const client = createGatewayMcpClient(fakeAuth(access).auth)
    expect(await client.access(tool)).toEqual(access)
    await kind(createGatewayMcpClient(fakeAuth({ ...access, toolId: 'mcp.other' }).auth).access(tool), 'invalid-response')
    await kind(createGatewayMcpClient(fakeAuth({ ...access, digest: hex('c', 64) }).auth).access(tool), 'invalid-response')
    await kind(createGatewayMcpClient(fakeAuth({ ...access, requiredScope: 'tool:other' }).auth).access(tool), 'invalid-response')
    await kind(client.access({ ...tool, version: 0 }), 'validation')
  })

  it('sets an agent’s access and checks the reply says what was asked', async () => {
    const { auth, calls } = fakeAuth(access)
    const client = createGatewayMcpClient(auth)
    expect(await client.setAccess(tool, true)).toEqual(access)
    expect(calls[0]).toEqual({ path: '/api/owner/mcp/tools/mcp.notes/access', init: { method: 'POST', body: { enabled: true, expected_digest: tool.digest } } })
    await kind(client.setAccess(tool, false), 'invalid-response')
    await kind(client.setAccess(tool, 1 as never), 'validation')
    await kind(createGatewayMcpClient(fakeAuth({ ...access, digest: hex('c', 64) }).auth).setAccess(tool, true), 'invalid-response')
    await kind(createGatewayMcpClient(fakeAuth({ ...access, toolId: 'mcp.zzz' }).auth).setAccess(tool, true), 'invalid-response')
    await kind(createGatewayMcpClient(fakeAuth({ ...access, requiredScope: 'x' }).auth).setAccess(tool, true), 'invalid-response')
  })

  it('sends a read class for the version he saw and returns the stored class', async () => {
    const { auth, calls } = fakeAuth({ schemaVersion: 1, tool: { ...tool, read_class: 'observe', version: 2 } })
    const client = createGatewayMcpClient(auth)
    expect((await client.setClass({ ...tool, read_class: 'act_outward' }, 'observe')).read_class).toBe('observe')
    expect(calls[0]).toEqual({ path: '/api/owner/mcp/tools/mcp.notes/class', init: { method: 'POST', body: { read_class: 'observe', expected_version: 1 } } })
    // What ToolGate stored is shown as it is, even when it is not what was asked.
    const kept = createGatewayMcpClient(fakeAuth({ schemaVersion: 1, tool: { ...tool, read_class: 'act_outward', version: 2 } }).auth)
    expect((await kept.setClass(tool, 'observe')).read_class).toBe('act_outward')
    await kind(client.setClass(tool, 'auto' as never), 'validation')
    await kind(client.setClass({ ...tool, version: 0 }, 'observe'), 'validation')
    expect(calls).toHaveLength(1)
    await kind(createGatewayMcpClient(fakeAuth({ schemaVersion: 1, tool: { ...tool, id: 'mcp.other', read_class: 'observe' } }).auth).setClass(tool, 'observe'), 'invalid-response')
    await kind(createGatewayMcpClient(fakeAuth({ schemaVersion: 1, tool }).auth).setClass(tool, 'observe'), 'invalid-response')
    await kind(createGatewayMcpClient(fakeAuth({ schemaVersion: 1, tool: { ...tool, read_class: 'auto' } }).auth).setClass(tool, 'observe'), 'invalid-response')
  })
})

describe('MCP read class refusal words', () => {
  const coded = (status: number, code?: string) => readClassMessage(new GatewayError('http', status, undefined, code as never))
  it('words each refusal code and never shows server text', () => {
    expect(coded(422, 'act_outward_hint')).toBe('It still asks every time: its server doesn’t say this tool is read-only.')
    expect(coded(409, 'schema_changed')).toBe('It still asks every time: its server now describes this tool differently. Import the new version to review it.')
    expect(coded(422, 'unsupported_schema')).toBe(coded(409, 'schema_changed'))
    expect(coded(409, 'definition_conflict')).toBe('This tool changed since you opened it. Reload it, then choose again.')
    expect(coded(422, 'refused')).toBe('Conker didn’t change it. Reload the tool, then choose again.')
    expect(coded(409)).toBe(coded(422, 'refused'))
    expect(coded(404)).toBe('This tool is no longer saved. Reload the list.')
  })
  it('falls back to the transport words for anything else', () => {
    expect(readClassMessage(new GatewayError('verification-cancelled'))).toBe(new GatewayError('verification-cancelled').message)
    expect(readClassMessage(new Error('boom'))).toBe(new GatewayError('network').message)
  })
})

describe('skills client', () => {
  const sha = hex('a', 64)
  const row = (extra: Record<string, unknown> = {}) => ({ id: 'meeting-notes', name: 'meeting-notes', description: 'Takes notes', revision: 2, enabled: true, sha256: sha, createdAt: 1, updatedAt: 2, ...extra })

  it('measures the import request in bytes', () => {
    expect(skillImportBytes('é', 0)).toBe(new TextEncoder().encode('{"markdown":"é","expected_revision":0}').byteLength)
    expect(skillImportBytes('a', 1, 'x')).toBeGreaterThan(skillImportBytes('a', 1))
    expect(SKILL_BROWSER_MAX_BYTES).toBe(61440)
  })

  it('validates up to three distinct skill ids', () => {
    expect(validateSkillIds(['a', 'b-c'])).toEqual(['a', 'b-c'])
    for (const bad of [['a', 'a'], ['a', 'b', 'c', 'd'], ['Bad'], ['x'.repeat(65)], [7 as never], 'a' as never]) expect(() => validateSkillIds(bad)).toThrow(expect.objectContaining({ kind: 'validation' }))
  })

  it('reads one skill and refuses every malformed field', () => {
    expect(parseSkill(row())).toEqual(row())
    const bad = (value: unknown) => expect(() => parseSkill(value)).toThrow(expect.objectContaining({ kind: 'invalid-response' }))
    for (const value of [null, [], 'x']) bad(value)
    for (const extra of [
      { id: 'Bad Id', name: 'Bad Id' },
      { id: 'x'.repeat(65), name: 'x'.repeat(65) },
      { name: 'other' },
      { description: 1 },
      { description: 'x'.repeat(1025) },
      { revision: 0 },
      { revision: 1.5 },
      { revision: '2' },
      { enabled: 'yes' },
      { sha256: 'abc' },
      { sha256: 4 },
      { createdAt: Infinity },
      { createdAt: '1' },
      { updatedAt: NaN },
      { updatedAt: '1' },
    ])
      bad(row(extra))
  })

  it('reads a list and refuses a bad envelope or duplicate ids', () => {
    expect(parseSkills({ schemaVersion: 1, results: [row(), row({ id: 'b', name: 'b' })] })).toHaveLength(2)
    const bad = (value: unknown) => expect(() => parseSkills(value)).toThrow(expect.objectContaining({ kind: 'invalid-response' }))
    bad(null)
    bad('x')
    bad({ schemaVersion: 2, results: [] })
    bad({ schemaVersion: 1, results: 'no' })
    bad({ schemaVersion: 1, results: new Array(1001).fill(row()) })
    bad({ schemaVersion: 1, results: [row(), row()] })
  })

  it('lists, gets, imports and toggles through the gateway', async () => {
    const record = row({ markdown: '# Notes' })
    const { auth, calls } = fakeAuth(record)
    const client = createGatewaySkillsClient(auth)
    expect(await client.get('meeting-notes')).toEqual(record)
    expect(await client.import('# Notes', 0)).toEqual(record)
    expect(await client.import('# Notes', 2, 'meeting-notes')).toEqual(record)
    expect(await client.setEnabled('meeting-notes', false, 2)).toEqual(record)
    expect(calls.map(call => [call.path, call.init.body])).toEqual([
      ['/api/control/pi/skills/meeting-notes', undefined],
      ['/api/control/pi/skills/import', { markdown: '# Notes', expected_revision: 0 }],
      ['/api/control/pi/skills/import', { markdown: '# Notes', expected_revision: 2, expected_id: 'meeting-notes' }],
      ['/api/control/pi/skills/meeting-notes/state', { enabled: false, expected_revision: 2 }],
    ])
    expect(await createGatewaySkillsClient(fakeAuth({ schemaVersion: 1, results: [row()] }).auth).list()).toEqual([row()])
  })

  it('refuses bad requests before sending anything', async () => {
    const { auth, calls } = fakeAuth(row({ markdown: '' }))
    const client = createGatewaySkillsClient(auth)
    await kind(client.get('Bad Id'), 'validation')
    await kind(client.import('   ', 0), 'validation')
    await kind(client.import('x'.repeat(SKILL_MAX_CHARACTERS + 1), 0), 'validation')
    await kind(client.import('x', -1), 'validation')
    await kind(client.import('x', 1.5), 'validation')
    await kind(client.import('x', 0, 'Bad Id'), 'validation')
    await kind(client.import('é'.repeat(SKILL_MAX_CHARACTERS), 0), 'too-large')
    await kind(client.setEnabled('meeting-notes', 'yes' as never, 1), 'validation')
    await kind(client.setEnabled('meeting-notes', true, 0), 'validation')
    await kind(client.setEnabled('Bad Id', true, 1), 'validation')
    expect(calls).toEqual([])
  })

  it('refuses replies about a different skill or with a bad body', async () => {
    const other = row({ id: 'other', name: 'other', markdown: '' })
    await kind(createGatewaySkillsClient(fakeAuth(other).auth).get('meeting-notes'), 'invalid-response')
    await kind(createGatewaySkillsClient(fakeAuth(other).auth).import('x', 0, 'meeting-notes'), 'invalid-response')
    await kind(createGatewaySkillsClient(fakeAuth(other).auth).setEnabled('meeting-notes', true, 1), 'invalid-response')
    await kind(createGatewaySkillsClient(fakeAuth(row()).auth).get('meeting-notes'), 'invalid-response')
    await kind(createGatewaySkillsClient(fakeAuth(row({ markdown: 'x'.repeat(SKILL_MAX_CHARACTERS + 1) })).auth).get('meeting-notes'), 'invalid-response')
  })
})

describe('proposals client', () => {
  const evidence = { messageId: 'm1', available: true, sessionId: 's1', excerpt: 'said so', createdAt: 5 }
  const proposal = (extra: Record<string, unknown> = {}) => ({
    id: 'p1',
    title: 'Title',
    noticed: 'N',
    suggestion: 'S',
    ifApproved: 'I',
    evidence: [evidence],
    state: 'open',
    createdAt: 5,
    decidedAt: null,
    grantsExecutionAuthority: false,
    ...extra,
  })

  it('reads a proposal with available and removed evidence', () => {
    const { grantsExecutionAuthority: _drop, ...expected } = proposal({ evidence: [evidence, { messageId: 'm2', available: false }], state: 'accepted', decidedAt: 9 })
    void _drop
    expect(parseProposal(proposal({ evidence: [evidence, { messageId: 'm2', available: false }], state: 'accepted', decidedAt: 9 }))).toEqual(expected)
  })

  it('refuses a proposal that grants authority or is malformed', () => {
    const bad = (value: unknown) => expect(() => parseProposal(value)).toThrow(expect.objectContaining({ kind: 'invalid-response' }))
    bad(null)
    bad([])
    bad(proposal({ grantsExecutionAuthority: true }))
    bad(proposal({ grantsExecutionAuthority: undefined }))
    bad(proposal({ state: 'deleted' }))
    bad(proposal({ state: 3 }))
    bad(proposal({ evidence: [] }))
    bad(proposal({ evidence: 'x' }))
    bad(proposal({ evidence: new Array(11).fill(evidence) }))
    bad(proposal({ evidence: [{ messageId: 'm', available: 'maybe' }] }))
    bad(proposal({ evidence: [{ ...evidence, excerpt: 'x'.repeat(401) }] }))
    bad(proposal({ id: 'has space' }))
    bad(proposal({ title: 'x'.repeat(201) }))
    bad(proposal({ createdAt: 0 }))
    bad(proposal({ decidedAt: 0 }))
  })

  it('lists open proposals, at most fifty', async () => {
    const { auth, calls } = fakeAuth({ proposals: [proposal()] })
    expect(await createGatewayProposalClient(auth).list()).toHaveLength(1)
    expect(calls[0]).toEqual({ path: '/api/pi/proposals', init: { query: { state: 'open', limit: 50 }, signal: undefined } })
    await kind(createGatewayProposalClient(fakeAuth({ proposals: new Array(51).fill(proposal()) }).auth).list(), 'invalid-response')
    await kind(createGatewayProposalClient(fakeAuth({ proposals: 'x' }).auth).list(), 'invalid-response')
  })

  it('records a decision and refuses a reply that is not decided or is another proposal', async () => {
    const decided = proposal({ state: 'declined', decidedAt: 6 })
    const { auth, calls } = fakeAuth(decided)
    const client = createGatewayProposalClient(auth)
    expect((await client.decide('p1', 'decline')).state).toBe('declined')
    expect(calls[0]).toEqual({ path: '/api/pi/proposals/p1/decision', init: { method: 'POST', body: { decision: 'decline' } } })
    await kind(client.decide('bad id', 'accept'), 'validation')
    await kind(client.decide('p1', 'maybe' as never), 'validation')
    await kind(createGatewayProposalClient(fakeAuth(proposal()).auth).decide('p1', 'accept'), 'invalid-response')
    await kind(createGatewayProposalClient(fakeAuth(proposal({ id: 'p2', state: 'accepted', decidedAt: 6 })).auth).decide('p1', 'accept'), 'invalid-response')
  })
})

describe('recall notices client', () => {
  const id = `mrn_${hex('a')}`
  const notice = {
    kind: 'memory-recall',
    id,
    title: 'T',
    since: 1,
    memoryId: 'm1',
    change: 'corrected',
    answers: 2,
    chats: 1,
    sessionIds: ['s1'],
    sessions: [{ id: 's1', title: 'Chat' }],
    source: { kind: 'memory-recall', noticeId: id, memoryId: 'm1' },
  }

  it('lists notices and refuses a bad one', async () => {
    const { auth, calls } = fakeAuth({ items: [notice] })
    expect(await createRecallNoticesClient(auth).list()).toEqual([notice])
    expect(calls[0].path).toBe('/api/control/pi/memory/recall-notices')
    await kind(createRecallNoticesClient(fakeAuth({ items: [{ ...notice, change: 'deleted' }] }).auth).list(), 'invalid-response')
  })

  it('dismisses a card by id and checks the reply names the same id', async () => {
    const { auth, calls } = fakeAuth({ id, dismissed: true, changed: true })
    const client = createRecallNoticesClient(auth)
    await client.dismiss(id)
    expect(calls[0]).toEqual({ path: `/api/control/pi/memory/recall-notices/${id}/dismiss`, init: { method: 'POST', body: {}, signal: undefined } })
    await kind(client.dismiss('nope'), 'validation')
    await kind(createRecallNoticesClient(fakeAuth({ id: `mrn_${hex('b')}`, dismissed: true, changed: true }).auth).dismiss(id), 'invalid-response')
    await kind(createRecallNoticesClient(fakeAuth({ id, dismissed: false, changed: true }).auth).dismiss(id), 'invalid-response')
  })
})
