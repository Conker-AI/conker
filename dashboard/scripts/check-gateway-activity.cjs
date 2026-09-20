const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..'), cache = new Map()
globalThis.crypto ??= require('node:crypto').webcrypto
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports
  const module = { exports: {} }; cache.set(relative, module)
  const output = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('require', 'module', 'exports', output)(request => {
    assert.ok(request.startsWith('.'), `Unexpected live activity dependency ${request}`)
    return load(`${path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))}.ts`)
  }, module, module.exports)
  return module.exports
}
const { createGatewayActivityClient, GatewayActivityMutationError, createTaskRequestId, allowedGatewayTaskTransitions } = load('src/lib/gateway/activity.ts')
const { GatewayError, createGatewayTransport } = load('src/lib/gateway/transport.ts')
const now = 1_700_000_000
const event = (sequence = 1) => ({ id: `evt_${sequence}`, sequence, kind: 'task_created', session_id: 'ses_one', task_id: 'task_one', run_id: null, action_id: null, from_status: null, to_status: 'planned', revision: 1, occurred_at: now, content_status: 'available' })
const task = () => ({ id: 'task_one', outcome: 'Review the result', criteria: [{ id: 'crit_one', text: 'Owner checked the output' }],
  session_id: 'ses_one', agent_id: 'companion', parent_task_id: null, run_ids: ['trn_one'], status: 'planned', status_source: 'owner', provenance: 'recorded', revision: 1,
  created_at: now, updated_at: now, archived_at: null, status_note: '', completed_criterion_ids: [], content_status: 'available', changes: [event()], changes_truncated: false })
const run = () => ({ id: 'trn_one', session_id: 'ses_one', status: 'outcome_unknown', acted: false, provider: 'local', model: 'configured', started_at: now, ended_at: now + 3,
  task_ids: ['task_one'], action: { id: 'act_one', state: 'outcome_unknown', job_id: null }, outputs: [], source: { kind: 'conversation', session_id: 'ses_one' }, provenance: 'recorded', content_status: 'available' })
const requestId = 'request_1234567890123456'
const createInput = { requestId, outcome: 'Review the result', criteria: ['Owner checked the output'], sessionId: 'ses_one', parentTaskId: null, runIds: ['trn_one'] }
const updateInput = { expectedRevision: 1, outcome: createInput.outcome, criteria: createInput.criteria, parentTaskId: null, runIds: ['trn_one'] }
function setup(value) {
  const calls = []
  const client = createGatewayActivityClient({ request: async (...args) => { calls.push(args); return typeof value === 'function' ? value(...args) : structuredClone(value) } })
  return { client, calls }
}
const rejects = (promise, kind = 'invalid-response') => assert.rejects(promise, error => error instanceof GatewayError && error.kind === kind)
async function main() {
  const generated = new Set(Array.from({ length: 10 }, createTaskRequestId))
  assert.equal(generated.size, 10)
  for (const id of generated) assert.match(id, /^[A-Za-z0-9_-]{16,128}$/)
  let current = setup({ results: [task()], next_cursor: 'task_one' })
  const page = await current.client.listTasks({ sessionId: 'ses_one', limit: 1, cursor: 'task_previous' })
  assert.equal(page.nextCursor, 'task_one')
  assert.equal(page.results[0].createdAt, '2023-11-14T22:13:20.000Z')
  assert.equal(page.results[0].statusSource, 'owner')
  assert.equal(page.results[0].provenance, 'recorded')
  assert.deepEqual(current.calls[0], ['/api/pi/tasks', { query: { limit: 1, cursor: 'task_previous', session_id: 'ses_one' } }])
  assert.deepEqual(allowedGatewayTaskTransitions(page.results[0]), ['in_progress', 'blocked', 'cancelled'])
  assert.deepEqual(allowedGatewayTaskTransitions({ ...page.results[0], status: 'completed' }), ['planned'])
  assert.deepEqual(allowedGatewayTaskTransitions({ ...page.results[0], archivedAt: 'date' }), [])
  assert.deepEqual(allowedGatewayTaskTransitions({ ...page.results[0], contentStatus: 'forgotten' }), [])
  current = setup(task())
  assert.equal((await current.client.getTask('task_one')).id, 'task_one')
  await current.client.getTaskByRequest(requestId)
  assert.equal(current.calls[1][0], `/api/pi/tasks/requests/${requestId}`)
  current = setup(() => { throw new GatewayError('http', 404) })
  await assert.rejects(current.client.getTaskByRequest(requestId), error => error.status === 404)
  assert.equal(current.calls.length, 1, 'Missing request lookup never creates or replays a task')
  current = setup({ ...task(), revision: 7 })
  assert.equal((await current.client.createTask(createInput)).revision, 7, 'Idempotent create can return the current revision')
  assert.deepEqual(current.calls, [['/api/pi/tasks', { method: 'POST', body: { outcome: createInput.outcome, criteria: createInput.criteria, parent_task_id: null, run_ids: ['trn_one'], request_id: requestId, session_id: 'ses_one' } }]])
  current = setup(task())
  await current.client.updateTask('task_one', updateInput)
  assert.deepEqual(current.calls[0], ['/api/pi/tasks/task_one/update', { method: 'POST', body: { outcome: createInput.outcome, criteria: createInput.criteria, parent_task_id: null, run_ids: ['trn_one'], expected_revision: 1 } }])
  await current.client.transitionTask('task_one', { expectedRevision: 2, status: 'completed', note: 'I checked it', completedCriterionIds: ['crit_one'] })
  assert.deepEqual(current.calls[1][1].body, { expected_revision: 2, status: 'completed', note: 'I checked it', completed_criterion_ids: ['crit_one'] })
  await current.client.archiveTask('task_one', { expectedRevision: 3, archived: true })
  assert.deepEqual(current.calls[2][1].body, { expected_revision: 3, archived: true })
  assert.ok(current.calls.every(call => !/turns|resume|execute|run$/.test(call[0])), 'Task mutations never dispatch a run')
  for (const status of ['running', 'complete', 'failed', 'interrupted', 'awaiting_approval', 'awaiting_budget', 'action_in_progress', 'outcome_unknown', 'acted_no_reply']) {
    current = setup({ ...run(), status })
    const value = await current.client.getRun('trn_one')
    assert.equal(value.status, status)
    assert.deepEqual(value.outputs, [])
    assert.equal(value.source.sessionId, 'ses_one')
    assert.equal(value.endedAt, '2023-11-14T22:13:23.000Z')
  }
  current = setup({ results: [run()], next_cursor: 'trn_one' })
  assert.equal((await current.client.listRuns({ sessionId: 'ses_one', taskId: 'task_one' })).results[0].action.state, 'outcome_unknown')
  assert.deepEqual(current.calls[0][1].query, { limit: 50, session_id: 'ses_one', task_id: 'task_one' })
  current = setup({ results: [{ ...event(8), run_id: 'trn_one' }, { ...event(5), run_id: 'trn_one' }], next_cursor: '5' })
  assert.deepEqual((await current.client.listEvents({ cursor: '9', runId: 'trn_one', taskId: 'task_one' })).results.map(item => item.sequence), [8, 5])
  assert.deepEqual(current.calls[0][1].query, { limit: 50, cursor: '9', task_id: 'task_one', run_id: 'trn_one' })
  current = setup({ results: [{ ...event(10), kind: 'run_status', task_id: null, run_id: 'trn_one', revision: null, to_status: 'complete' }], next_cursor: null })
  assert.equal((await current.client.listEvents({ taskId: 'task_one' })).results[0].taskId, null, 'Task scope includes content-free events from currently linked runs without inventing direct task ownership')
  const forgotten = { ...task(), content_status: 'forgotten', outcome: 'PRIVATE', criteria: [{ text: 'PRIVATE', id: 'crit_private' }], status_note: 'PRIVATE', completed_criterion_ids: ['PRIVATE'], extra: 'PRIVATE' }
  const hidden = await setup(forgotten).client.getTask('task_one')
  assert.equal(hidden.outcome, '')
  assert.deepEqual(hidden.criteria, [])
  assert.deepEqual(hidden.completedCriterionIds, [])
  assert.equal(hidden.statusNote, '')
  assert.equal(hidden.changes[0].contentStatus, 'forgotten')
  assert.ok(!JSON.stringify(hidden).includes('PRIVATE'))
  const hiddenRun = await setup({ ...run(), content_status: 'forgotten', outputs: [{ body: 'PRIVATE' }], detail: 'PRIVATE' }).client.getRun('trn_one')
  assert.deepEqual(hiddenRun.outputs, [])
  assert.ok(!JSON.stringify(hiddenRun).includes('PRIVATE'))
  const hiddenEvents = await setup({ results: [{ ...event(), content_status: 'forgotten', detail: 'PRIVATE', args: 'PRIVATE' }], next_cursor: null }).client.listEvents()
  assert.ok(!JSON.stringify(hiddenEvents).includes('PRIVATE'), 'Journal projection contains identifiers/states only')
  for (const edit of [
    value => { value.id = 'wrong_task' }, value => { value.agent_id = 'invented-specialist' }, value => { value.status_source = 'executor' },
    value => { value.provenance = 'preview' }, value => { value.content_status = 'unknown' }, value => { value.revision = 0 },
    value => { value.created_at = Infinity }, value => { value.criteria.push(value.criteria[0]) }, value => { value.completed_criterion_ids = ['absent'] },
    value => { value.changes[0].session_id = 'wrong_session' }, value => { value.changes = [event(2), event(1)] },
    value => { value.run_ids = ['trn_one', 'trn_one'] }, value => { value.outcome = 'a'.repeat(1001) },
  ]) {
    const value = task(); edit(value)
    await rejects(setup(value).client.getTask('task_one'))
  }
  for (const value of [
    { ...run(), id: 'foreign_run' }, { ...run(), source: { kind: 'conversation', session_id: 'foreign_session' } },
    { ...run(), outputs: [{ id: 'invented' }] }, { ...run(), acted: 1 }, { ...run(), task_ids: ['a', 'a'] },
  ]) await rejects(setup(value).client.getRun('trn_one'))
  for (const value of [
    { results: [event(1), event(2)], next_cursor: null }, { results: [event(2), event(2)], next_cursor: null },
    { results: [event(2)], next_cursor: '3' }, { results: [], next_cursor: '2' },
    { results: [event()], next_cursor: '../bad' },
  ]) await rejects(setup(value).client.listEvents())
  await rejects(setup({ results: [task()], next_cursor: 'wrong' }).client.listTasks())
  await rejects(setup({ results: [task()], next_cursor: null }).client.listTasks({ sessionId: 'other' }))
  await rejects(setup({ results: [run()], next_cursor: null }).client.listRuns({ taskId: 'other' }))
  for (const id of ['', '../tasks', 'a/b', 'a%2Fb', 'a\n', 'a?b', 'x'.repeat(129)]) {
    current = setup(task())
    await rejects(current.client.getTask(id), 'validation')
    await rejects(current.client.getRun(id), 'validation')
    await rejects(current.client.updateTask(id, updateInput), 'validation')
    assert.equal(current.calls.length, 0)
  }
  current = setup(task())
  for (const options of [{ limit: 0 }, { limit: 201 }, { limit: 1.5 }, { cursor: '../bad' }]) await rejects(current.client.listTasks(options), 'validation')
  for (const cursor of ['-1', '1.5', '١', '1\n', '1'.repeat(19)]) await rejects(current.client.listEvents({ cursor }), 'validation')
  for (const input of [
    { ...createInput, requestId: 'short' }, { ...createInput, criteria: [] }, { ...createInput, criteria: ['same', 'SAME'] },
    { ...createInput, criteria: ['x'.repeat(501)] }, { ...createInput, runIds: ['trn_one', 'trn_one'] },
    { ...createInput, outcome: ' ' },
  ]) await rejects(current.client.createTask(input), 'validation')
  await rejects(current.client.updateTask('task_one', { ...updateInput, expectedRevision: 0 }), 'validation')
  await rejects(current.client.updateTask('task_one', { ...updateInput, runIds: undefined }), 'validation')
  await rejects(current.client.updateTask('task_one', { ...updateInput, parentTaskId: undefined }), 'validation')
  await rejects(current.client.transitionTask('task_one', { expectedRevision: 1, status: 'complete', note: 'review' }), 'validation')
  await rejects(current.client.archiveTask('task_one', { expectedRevision: 1, archived: 'true' }), 'validation')
  assert.equal(current.calls.length, 0, 'Local validation dispatches no request')
  for (const [kind, status, outcome] of [['http', 409, 'conflict'], ['http', 422, 'rejected'], ['network', undefined, 'unknown'], ['dependency', 503, 'unknown'], ['aborted', undefined, 'unknown'], ['session-changed', undefined, 'unknown'], ['response-too-large', undefined, 'unknown']]) {
    current = setup(() => { throw new GatewayError(kind, status) })
    await assert.rejects(current.client.createTask(createInput), error => error instanceof GatewayActivityMutationError && error.outcome === outcome && error.requestId === requestId)
    assert.equal(current.calls.length, 1, `${kind}: never replay an uncertain/conflicting create`)
    await assert.rejects(current.client.updateTask('task_one', updateInput), error => error.outcome === outcome && error.taskId === 'task_one')
    assert.equal(current.calls.length, 2)
  }
  current = setup({ ...task(), id: 'foreign' })
  await assert.rejects(current.client.updateTask('task_one', updateInput), error => error.outcome === 'unknown')
  assert.equal(current.calls.length, 1, 'Malformed write acknowledgement is uncertain, not rejected')
  current = setup({ ...task(), session_id: 'other_source', changes: [{ ...event(), session_id: 'other_source' }] })
  await assert.rejects(current.client.createTask(createInput), error => error.outcome === 'unknown')
  assert.equal(current.calls.length, 1, 'Create acknowledgement cannot silently change the fixed source conversation')
  const signal = new AbortController().signal
  for (const [response, invoke] of [
    [{ results: [], next_cursor: null }, client => client.listTasks({ signal })],
    [{ results: [], next_cursor: null }, client => client.listRuns({ signal })],
    [{ results: [], next_cursor: null }, client => client.listEvents({ signal })],
    [task(), client => client.getTask('task_one', { signal })], [run(), client => client.getRun('trn_one', { signal })],
    [task(), client => client.getTaskByRequest(requestId, { signal })], [task(), client => client.createTask(createInput, { signal })],
    [task(), client => client.updateTask('task_one', updateInput, { signal })],
    [task(), client => client.transitionTask('task_one', { expectedRevision: 1, status: 'in_progress', note: 'Owner started' }, { signal })],
    [task(), client => client.archiveTask('task_one', { expectedRevision: 1, archived: true }, { signal })],
  ]) {
    current = setup(response); await invoke(current.client)
    assert.equal(current.calls[0][1].signal, signal)
    assert.equal(current.calls.length, 1)
  }
  const wireCalls = []
  const transport = createGatewayTransport({ origin: 'https://conker.test', fetch: async (url, options) => {
    wireCalls.push({ url, options })
    const isWrite = options.method === 'POST'
    return new Response(JSON.stringify(isWrite ? { detail: { message: 'PRIVATE upstream error' } } : task()), {
      status: isWrite ? 503 : 200, headers: { 'Content-Type': 'application/json' },
    })
  } })
  const recovered = createGatewayActivityClient({ request: (route, options) => transport.request(route, { ...options, csrfToken: 'c'.repeat(32) }) })
  await assert.rejects(recovered.createTask(createInput), error => {
    assert.equal(error.outcome, 'unknown')
    assert.equal(error.requestId, requestId)
    assert.ok(!JSON.stringify(error).includes('PRIVATE'))
    return true
  })
  assert.equal(wireCalls.length, 1)
  assert.equal((await recovered.getTaskByRequest(requestId)).id, 'task_one')
  assert.equal(wireCalls.length, 2)
  assert.equal(wireCalls[0].options.method, 'POST')
  assert.equal(wireCalls[1].options.method, 'GET')
  assert.ok(wireCalls[1].url.endsWith(`/tasks/requests/${requestId}`))
  console.log('Gateway activity DTO, privacy, revision, pagination and uncertain-write checks passed.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
