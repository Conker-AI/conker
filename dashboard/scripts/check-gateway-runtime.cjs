const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..'), cache = new Map()
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports
  const module = { exports: {} }
  cache.set(relative, module)
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('require', 'module', 'exports', code)(request => {
    assert.ok(request.startsWith('.'), `Unexpected dependency ${request}`)
    return load(`${path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))}.ts`)
  }, module, module.exports)
  return module.exports
}
const { createGatewayRuntimeClient, RuntimeMutationError } = load('src/lib/gateway/runtime.ts')
const { GatewayError, createGatewayTransport } = load('src/lib/gateway/transport.ts')
const session = { id: 's_one', parent_id: null, title: 'A real session', status: 'open', created_at: 1_700_000_000, closed_at: null, summary: null }
const memory = { configured: false, pending_ingestion: 2, blocked_delivery: 0, pending_deletion: 0, notices: ['Memory delivery pending.'], retrieval: { secret: 'Do not expose raw retrieval' } }
const message = { id: 'msg_one', session_id: session.id, seq: 1, role: 'user', content: 'Owner text', created_at: session.created_at }
const turn = { id: 'trn_one', session_id: session.id, status: 'acted_no_reply', acted: 1, started_at: session.created_at, ended_at: null,
  provider: 'local', model: 'configured-model', input_tokens: 8, output_tokens: null, cost_usd: null, detail: 'Reply unavailable',
  action: { id: 'action_one', state: 'completed', job_id: 'job_one' }, memory }
const detail = () => ({ ...session, messages: [structuredClone(message)], turns: [structuredClone(turn)], memory: structuredClone(memory) })
function clientReturning(value) {
  const calls = []
  const client = createGatewayRuntimeClient({ request: async (...args) => { calls.push(args); return typeof value === 'function' ? value(...args) : structuredClone(value) } })
  return { client, calls }
}
async function main() {
  let setup = clientReturning({ results: [session] })
  assert.deepEqual(await setup.client.listSessions(), [{ id: 's_one', parentId: null, title: session.title, status: 'open', createdAt: '2023-11-14T22:13:20.000Z', closedAt: null, summary: null }])
  assert.deepEqual(setup.calls, [['/api/pi/sessions', { query: { limit: 200 } }]])
  setup = clientReturning(detail())
  const loaded = await setup.client.getSession('s_one')
  assert.deepEqual(loaded.messages[0].content, { kind: 'text', text: 'Owner text' })
  assert.equal(loaded.turns[0].status, 'acted_no_reply')
  assert.equal(loaded.turns[0].acted, true)
  assert.equal(loaded.turns[0].costUsd, null)
  assert.equal(loaded.turns[0].action.jobId, 'job_one')
  assert.equal(loaded.memory.pendingIngestion, 2)
  assert.ok(!JSON.stringify(loaded).includes('Do not expose raw retrieval'))
  // Host forgetting retains list/detail records with this fourth session state.
  const forgotten = detail()
  Object.assign(forgotten, { status: 'forgotten', title: 'SECRET old title', summary: 'SECRET old summary', closed_at: session.created_at + 1 })
  forgotten.messages[0].content = 'SECRET old text'
  forgotten.turns[0].detail = 'SECRET old turn detail'
  const forgottenList = await clientReturning({ results: [session, { ...forgotten, id: 's_forgotten' }] }).client.listSessions()
  assert.equal(forgottenList.length, 2)
  assert.equal(forgottenList[1].status, 'forgotten')
  assert.equal(forgottenList[1].title, '')
  assert.equal(forgottenList[1].summary, null)
  const forgottenDetail = await clientReturning(forgotten).client.getSession('s_one')
  assert.deepEqual(forgottenDetail.messages[0].content, { kind: 'unavailable', reason: 'forgotten' })
  assert.equal(forgottenDetail.turns[0].detail, null)
  assert.ok(!JSON.stringify(forgottenDetail).includes('SECRET'), 'Session-level forgetting hides stale content even without message tombstone flags')
  for (const status of ['running', 'failed', 'interrupted', 'awaiting_approval', 'awaiting_budget', 'outcome_unknown', 'complete']) {
    const value = detail(); value.turns[0].status = status
    assert.equal((await clientReturning(value).client.getSession('s_one')).turns[0].status, status)
  }
  for (const role of ['user', 'assistant', 'system', 'tool']) {
    const value = detail(); value.messages[0].role = role
    assert.equal((await clientReturning(value).client.getSession('s_one')).messages[0].role, role)
  }
  for (const replacement of [
    { content_status: 'forgotten', content: 'SECRET STALE TEXT', receipt_id: 'receipt_one', forgotten_at: 100 },
    { content: { toolResult: 'SECRET RAW OBJECT' } }, { content: 'x'.repeat(65_537) },
    { content_status: 'future-redaction-state', content: 'SECRET STALE TEXT' },
  ]) {
    const value = detail(); Object.assign(value.messages[0], replacement)
    const parsed = await clientReturning(value).client.getSession('s_one')
    assert.equal(parsed.messages[0].content.kind, 'unavailable')
    assert.ok(!JSON.stringify(parsed).includes('SECRET'))
  }
  for (const change of [
    value => { value.id = 'foreign' }, value => { value.messages[0].session_id = 'foreign' },
    value => { value.turns[0].session_id = 'foreign' }, value => { value.messages.push(value.messages[0]) },
    value => { value.messages.push({ ...value.messages[0], id: 'msg_two' }) },
    value => { value.created_at = Infinity }, value => { value.memory.configured = 'yes' },
    value => { value.turns[0].acted = 2 }, value => { value.messages[0].role = 'invented' },
  ]) {
    const value = detail(); change(value)
    await assert.rejects(clientReturning(value).client.getSession('s_one'), error => error.kind === 'invalid-response')
  }
  await assert.rejects(clientReturning({ results: Array(201).fill(session) }).client.listSessions())
  await assert.rejects(clientReturning({ results: [session, session] }).client.listSessions())
  setup = clientReturning({ session_id: 's_new' })
  assert.deepEqual(await setup.client.createSession('Title'), { sessionId: 's_new' })
  assert.deepEqual(setup.calls, [['/api/pi/sessions', { method: 'POST', body: { title: 'Title' } }]])
  setup = clientReturning({ session_id: 's_fork', forked_from: 's_one', turn_id: 'trn_new', acted: false, message: { content: 'Response is not canonical history' } })
  assert.deepEqual(await setup.client.submitTurn('s_one', 'Ask'), { requestedSessionId: 's_one', sessionId: 's_fork', forkedFrom: 's_one', turnId: 'trn_new', acted: false, requiresReconciliation: true })
  assert.equal(setup.calls.length, 1, 'Successful receipt causes no implicit read or second mutation')
  assert.deepEqual(setup.calls[0], ['/api/pi/sessions/s_one/turns', { method: 'POST', body: { text: 'Ask' } }])
  setup = clientReturning({ turn_id: 'trn_one', status: 'acted_no_reply', acted: true, message: null })
  const receipt = await setup.client.submitTurn('s_one', 'Ask')
  assert.equal(receipt.sessionId, undefined)
  assert.equal(receipt.status, 'acted_no_reply')
  assert.equal(receipt.requiresReconciliation, true)
  for (const badId of ['../auth', 's%2fone', 'a/b', '', 'x'.repeat(129), 'a?limit=3', 'a\\b']) {
    setup = clientReturning({})
    await assert.rejects(setup.client.getSession(badId), error => error.kind === 'validation')
    await assert.rejects(setup.client.submitTurn(badId, 'Ask'), error => error.kind === 'validation')
    assert.equal(setup.calls.length, 0)
  }
  setup = clientReturning({})
  for (const value of ['', '  ', 'a'.repeat(16_001)]) await assert.rejects(setup.client.submitTurn('s_one', value), error => error.kind === 'validation')
  await assert.rejects(setup.client.createSession('a'.repeat(1025)))
  assert.equal(setup.calls.length, 0)
  setup = clientReturning({ turn_id: 'trn_one' })
  await setup.client.submitTurn('s_one', '🙂'.repeat(16_000))
  assert.equal(setup.calls.length, 1, 'Pi validates Unicode code points, not UTF-16 length')
  for (const [kind, status, outcome] of [['network', undefined, 'unknown'], ['aborted', undefined, 'unknown'], ['session-changed', undefined, 'unknown'], ['response-too-large', undefined, 'unknown'], ['dependency', 503, 'unknown'], ['http', 422, 'rejected'], ['browser-expired', undefined, 'rejected']]) {
    setup = clientReturning(() => { throw new GatewayError(kind, status) })
    await assert.rejects(setup.client.submitTurn('s_one', 'Ask'), error => error instanceof RuntimeMutationError && error.outcome === outcome && error.sessionId === 's_one')
    assert.equal(setup.calls.length, 1, `${kind}: never replay a mutation`)
  }
  setup = clientReturning({ turn_id: '../bad' })
  await assert.rejects(setup.client.submitTurn('s_one', 'Ask'), error => error.outcome === 'unknown')
  assert.equal(setup.calls.length, 1)
  setup = clientReturning({ session_id: null })
  await assert.rejects(setup.client.createSession(), error => error.outcome === 'unknown')
  assert.equal(setup.calls.length, 1, 'Uncertain create never duplicates a session')
  const signal = new AbortController().signal
  for (const [response, invoke] of [
    [{ results: [] }, client => client.listSessions({ signal })],
    [detail(), client => client.getSession('s_one', { signal })],
    [{ session_id: 's_two' }, client => client.createSession('Title', { signal })],
    [{ turn_id: 'trn_two' }, client => client.submitTurn('s_one', 'Ask', { signal })],
  ]) {
    setup = clientReturning(response)
    await invoke(setup.client)
    assert.equal(setup.calls[0][1].signal, signal, 'View teardown may abort transport; it never asserts server cancellation')
  }
  let requests = 0
  const transport = createGatewayTransport({ origin: 'https://conker.test', fetch: async () => {
    requests++
    return new Response(JSON.stringify({ detail: { turn_id: 'trn_stored', message: 'PRIVATE upstream error', memory: { content: 'PRIVATE' } } }), { status: 503, headers: { 'Content-Type': 'application/json' } })
  } })
  const client = createGatewayRuntimeClient({ request: (route, options) => transport.request(route, { ...options, csrfToken: 'c'.repeat(32) }) })
  await assert.rejects(client.submitTurn('s_one', 'Ask'), error => {
    assert.equal(error.turnId, 'trn_stored')
    assert.equal(error.outcome, 'unknown')
    assert.ok(!JSON.stringify(error).includes('PRIVATE'))
    return true
  })
  assert.equal(requests, 1)
  console.log('Gateway runtime contract checks passed.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
