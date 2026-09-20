const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..'), cache = new Map()
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports
  const module = { exports: {} }; cache.set(relative, module)
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(request => {
    if (request === 'zustand/vanilla') return require(request)
    assert.ok(request.startsWith('.'), `Unexpected dependency ${request}`)
    return load(`${path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))}.ts`)
  }, module, module.exports)
  return module.exports
}
const { taskDispatchProblem, prepareTaskDispatch, readTaskDispatchSources, visibleTaskDispatchIntent } = load('src/components/gateway/task-dispatch-state.ts')
const { createGatewayRuntimeWorkspaceState, canSubmitRuntime, canReleaseTaskConflict, recoverSubmissionDraft } = load('src/components/gateway/runtime-state.ts')
const { createGatewayRuntimeClient } = load('src/lib/gateway/runtime.ts')
const { GatewayError } = load('src/lib/gateway/transport.ts')
const task = { id: 'tsk_one', sessionId: 'ses_one', revision: 3, status: 'planned', archivedAt: null, contentStatus: 'available', runIds: [], outcome: 'Write a café report', criteria: [{ id: 'criterion_one', text: 'Cite the sources' }] }
const session = { id: 'ses_one', status: 'open', turns: [], pendingSubmissions: [] }
const requestId = 'retained_task_request_001'
const prepared = prepareTaskDispatch(task, session, requestId)
assert.ok(prepared.text.includes(task.outcome) && prepared.text.includes(task.criteria[0].text))
assert.equal(prepared.taskExpectedRevision, 3)
assert.equal(prepared.sessionId, task.sessionId)
const taskAfterPreparation = JSON.stringify(task)
task.criteria[0].text = 'Changed after preparation'
assert.equal(prepared.criteria[0], 'Cite the sources', 'Review is an immutable authored snapshot')
task.criteria[0].text = 'Cite the sources'
assert.equal(JSON.stringify(task), taskAfterPreparation, 'Preparing work does not transition or complete the task')
for (const [changedTask, changedSession, expected] of [
  [{ ...task, revision: 4 }, session, /changed/],
  [{ ...task, archivedAt: '2026-09-20' }, session, /Restore/],
  [{ ...task, status: 'completed' }, session, /reopen/],
  [{ ...task, status: 'cancelled' }, session, /reopen/],
  [{ ...task, contentStatus: 'forgotten' }, session, /forgotten/],
  [task, { ...session, status: 'forgotten' }, /forgotten/],
  [task, { ...session, id: 'foreign' }, /match/],
  [task, { ...session, status: 'forked' }, /closed/],
  [{ ...task, runIds: Array.from({ length: 100 }, (_, i) => `run_${i}`) }, session, /100/],
  [task, { ...session, turns: [{ status: 'interrupted', acted: true, endedAt: '2026-09-20' }] }, /unresolved/],
  [task, { ...session, pendingSubmissions: [{ state: 'preparing' }] }, /unresolved/],
]) assert.match(taskDispatchProblem(changedTask, changedSession, 3), expected)
for (const status of ['planned', 'in_progress', 'blocked']) assert.equal(taskDispatchProblem({ ...task, status }, session, 3), null)
const largest = prepareTaskDispatch({ ...task, outcome: '😀'.repeat(1000), criteria: Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, text: '😀'.repeat(500) })) }, session, requestId)
assert.ok([...largest.text].length <= 16000 && Buffer.byteLength(JSON.stringify({ text: largest.text, request_id: requestId, task_id: task.id, task_expected_revision: 3 }), 'utf8') < 65536)
const workspace = createGatewayRuntimeWorkspaceState()
workspace.setState({ drafts: { ses_one: 'An unrelated chat draft' }, taskIntent: { taskId: task.id, sessionId: task.sessionId, open: true, prepared }, operation: 'send' })
assert.equal(workspace.getState().drafts.ses_one, 'An unrelated chat draft')
assert.equal(canSubmitRuntime('ordinary text', !!workspace.getState().operation, undefined, session), false, 'Task dispatch shares the chat operation lock')
workspace.getState().reset()
assert.equal(workspace.getState().taskIntent, null, 'Authentication reset discards private task input')

const taskConflict = { text: prepared.text, taskBinding: { taskId: task.id, taskExpectedRevision: 3 }, rejectionStatus: 409, notFound: true, checked: true }
assert.equal(canReleaseTaskConflict(taskConflict), true)
for (const missing of [{ rejectionStatus: undefined }, { notFound: false }, { checked: false }, { submission: { state: 'preparing' } }, { taskBinding: undefined }]) assert.equal(canReleaseTaskConflict({ ...taskConflict, ...missing }), false, 'Only confirmed rejected, absent task requests may be dismissed')
assert.equal(recoverSubmissionDraft({ ...taskConflict, submission: { taskId: task.id, contentStatus: 'available', pendingText: prepared.text } }, ''), '', 'Task input cannot silently become an unbound ordinary draft')

async function main() {
  const retainedIntent = { taskId: task.id, sessionId: task.sessionId, open: true, prepared }
  assert.equal(visibleTaskDispatchIntent(retainedIntent, [task.sessionId]), null, 'Known forgetting hides prepared input before effects clear retained state')
  assert.equal(visibleTaskDispatchIntent({ ...retainedIntent, sessionId: 'other' }, [prepared.sessionId]), null, 'A prepared source cannot bypass the synchronous render guard')
  assert.equal(visibleTaskDispatchIntent(retainedIntent, ['unrelated']), retainedIntent, 'Unrelated forgetting preserves this task draft')
  let secondReads = 0
  const marks = [], signal = new AbortController().signal
  await assert.rejects(readTaskDispatchSources(task.id, { getTask: async () => ({ ...task, contentStatus: 'forgotten' }) }, { getSession: async () => { secondReads++; throw new GatewayError('network') } }, id => marks.push(id), signal), /forgotten/)
  assert.deepEqual(marks, [task.sessionId], 'Canonical task forgetting is propagated immediately')
  assert.equal(secondReads, 0, 'A failing or indefinitely pending second read cannot delay the tombstone')
  marks.length = 0
  await assert.rejects(readTaskDispatchSources(task.id, { getTask: async () => task }, { getSession: async () => ({ ...session, status: 'forgotten' }) }, id => marks.push(id), signal), /forgotten/)
  assert.deepEqual(marks, [task.sessionId], 'Canonical session forgetting also propagates before preparation')
  console.log('PASS task dispatch immediate forgotten-source propagation and synchronous retained-input hiding')
  const bodies = [], calls = []
  let first = true
  const receipt = { request_id: requestId, requested_session_id: task.sessionId, effective_session_id: task.sessionId, turn_id: 'trn_one', task_id: task.id, input_message_id: 'msg_one', final_message_id: null, message_refs: [{ message_id: 'msg_one', purpose: 'input', action_id: null, seq: 1 }], state: 'bound', status: 'awaiting_approval', acted: false, pending_text: null, failure_code: null, content_status: 'available', created_at: 1_700_000_000, updated_at: 1_700_000_000 }
  const client = createGatewayRuntimeClient({ request: async (route, options) => {
    calls.push(route)
    if (options?.method === 'POST') { bodies.push(structuredClone(options.body)); if (first) { first = false; throw new GatewayError('network') } return { submission: receipt } }
    throw new GatewayError('http', 404)
  } })
  const binding = { taskId: prepared.taskId, taskExpectedRevision: prepared.taskExpectedRevision }
  await assert.rejects(client.submitRequest(prepared.sessionId, prepared.text, prepared.requestId, binding), error => error.outcome === 'unknown')
  assert.equal(bodies.length, 1, 'An uncertain dispatch never auto-retries')
  await assert.rejects(client.getSubmission(requestId, task.sessionId), error => error.status === 404)
  const replay = await client.submitRequest(prepared.sessionId, prepared.text, prepared.requestId, binding)
  assert.deepEqual(bodies[0], bodies[1], 'Explicit same-ID retry retains text, task and original revision byte-for-byte')
  assert.equal(replay.taskId, task.id)
  assert.equal(replay.status, 'awaiting_approval', 'A linked run is not declared successful')
  const failed = { ...receipt, state: 'preparation_failed', status: 'preparation_failed', effective_session_id: null, turn_id: null, input_message_id: null, message_refs: [], pending_text: prepared.text, failure_code: 'task_fork_required' }
  const recovery = createGatewayRuntimeClient({ request: async () => failed })
  assert.equal((await recovery.getSubmission(requestId, task.sessionId)).failureCode, 'task_fork_required')
  const forgotten = createGatewayRuntimeClient({ request: async () => ({ ...failed, state: 'forgotten', content_status: 'forgotten', pending_text: 'PRIVATE', failure_code: 'SECRET' }) })
  const masked = await forgotten.getSubmission(requestId, task.sessionId)
  assert.equal(masked.failureCode, null)
  assert.equal(masked.pendingText, null)
  assert.ok(!JSON.stringify(masked).includes('PRIVATE'))
  assert.equal(calls.length, 3)
  console.log('Task dispatch saved-input bounds, lifecycle/revision guards, shared lock, reset, exact retry identity and private recovery checks passed.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
