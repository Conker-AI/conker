const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const cache = new Map()
function load(relative) {
  const file = path.resolve(root, relative)
  if (cache.has(file)) return cache.get(file).exports
  const result = { exports: {} }; cache.set(file, result)
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(name => {
    if (name === 'zustand/vanilla') return require(name)
    if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(file), name + '.ts')))
    if (name.startsWith('@/')) return load('src/' + name.slice(2) + '.ts')
    throw new Error('Unexpected activity state dependency: ' + name)
  }, result, result.exports)
  return result.exports
}
const { createGatewayActivityWorkspaceState, draftFromTask, validateTaskDraft, eligibleTaskParents, forgetActivityDrafts, maskForgottenTask, visibleReferenceRuns } = load('src/components/gateway/activity-state.ts')
const { createGatewayRuntimeWorkspaceState } = load('src/components/gateway/runtime-state.ts')
const { createGatewaySourcePrivacyState, maskForgottenConversation } = load('src/components/gateway/source-privacy.ts')
const { bindGatewayWorkspaceReset } = load('src/components/gateway/auth-workspace-reset.ts')
const { createGatewayAuthStore } = load('src/lib/gateway/auth-store.ts')

const task = { id: 'task_a', sessionId: 'session_a', agentId: 'companion', outcome: 'Private outcome', criteria: [{ id: 'criterion_a', text: 'Private criterion' }], parentTaskId: null, runIds: ['turn_a'], status: 'planned', statusSource: 'owner', provenance: 'recorded', revision: 3, createdAt: '2026-09-20T00:00:00Z', updatedAt: '2026-09-20T00:00:00Z', archivedAt: null, statusNote: 'Private review', completedCriterionIds: [], contentStatus: 'available', changes: [], changesTruncated: false }
const draft = draftFromTask(task)
assert.equal(draft.revision, 3)
assert.equal(draft.sessionId, 'session_a')
assert.deepEqual(draft.runIds, ['turn_a'])
assert.notEqual(draft.runIds, task.runIds, 'Editing links must not mutate canonical task references')
assert.equal(validateTaskDraft(draft), null)
assert.match(validateTaskDraft({ ...draft, outcome: ' ' }), /outcome/)
assert.match(validateTaskDraft({ ...draft, criteria: 'same\nSAME' }), /distinct/)
assert.match(validateTaskDraft({ ...draft, criteria: 'x'.repeat(501) }), /500/)
assert.match(validateTaskDraft({ ...draft, sessionId: '' }), /conversation/)
assert.equal(validateTaskDraft({ ...draft, outcome: '😀'.repeat(1000) }), null)
const parents = [task, { ...task, id: 'other_source', sessionId: 'different' }, { ...task, id: 'terminal', status: 'completed' }, { ...task, id: 'archive', archivedAt: task.createdAt }, { ...task, id: 'hidden', contentStatus: 'forgotten' }, { ...task, id: 'child', parentTaskId: task.id }, { ...task, id: 'valid' }]
assert.deepEqual(eligibleTaskParents(parents, task.sessionId, task.id).map(item => item.id), ['valid'], 'Parent selection rejects self, cycles, other sources, terminal, archived and forgotten references')
const oldReferences = { sessionId: 'session_a', runs: [{ id: 'old_run', sessionId: 'session_a' }], cursor: 'old_cursor', pending: false, error: 'Old source failed' }
assert.deepEqual(visibleReferenceRuns(oldReferences, 'session_b'), { sessionId: 'session_b', runs: [], cursor: null, pending: true, error: null }, 'Switching source immediately hides old rows, cursor and error before the next effect starts')
assert.deepEqual(visibleReferenceRuns(oldReferences, undefined), { sessionId: null, runs: [], cursor: null, pending: false, error: null }, 'No source has an explicit idle state, not a false loading or empty-result claim')
const currentReferences = { sessionId: 'session_b', runs: [{ id: 'new_run', sessionId: 'session_b' }], cursor: 'new_cursor', pending: false, error: null }
assert.equal(visibleReferenceRuns(currentReferences, 'session_b'), currentReferences)
assert.equal(visibleReferenceRuns(oldReferences, 'session_b').cursor, null, 'Even a late old-source completion cannot expose its pagination token in the current picker')

const activity = createGatewayActivityWorkspaceState(), conversation = createGatewayRuntimeWorkspaceState(), privacy = createGatewaySourcePrivacyState()
const input = { requestId: 'request_identity_1234', outcome: 'Private outcome', criteria: ['Private criterion'], sessionId: task.sessionId, parentTaskId: null, runIds: ['turn_a'] }
activity.setState({ drafts: { create: { ...draft, requestId: input.requestId }, ['edit:' + task.id]: draft, unrelated: { ...draft, sessionId: 'other' } }, reviews: { review: { taskId: task.id, sessionId: task.sessionId, status: 'completed', revision: 3, note: 'Private review', checked: ['criterion_a'] } }, dialog: { kind: 'create' }, mutation: { key: 'create', kind: 'create', phase: 'unknown', input, requestId: input.requestId } })
forgetActivityDrafts(activity, new Set([task.sessionId]), new Set([task.id]))
assert.deepEqual(Object.keys(activity.getState().drafts), ['unrelated'])
assert.deepEqual(activity.getState().reviews, {})
assert.equal(activity.getState().dialog, null)
assert.equal(activity.getState().mutation.input, undefined, 'Forgetting scrubs immutable retry payload too')
assert.equal(activity.getState().mutation.requestId, input.requestId, 'Content-free request identity remains for reconciliation')
assert.equal(activity.getState().mutation.phase, 'unknown', 'Forgetting cannot silently unlock an uncertain write')
const masked = maskForgottenTask(task)
assert.ok(!JSON.stringify(masked).includes('Private'))
assert.equal(task.outcome, 'Private outcome', 'Masking does not modify caller-owned source objects')
assert.deepEqual(masked.runIds, ['turn_a'])
privacy.getState().markForgotten([task.sessionId])
privacy.getState().markForgotten([task.sessionId])
assert.deepEqual(privacy.getState().sessionIds, [task.sessionId])
const lateAvailable = { id: task.sessionId, title: 'Private title', summary: 'Private summary', status: 'open', messages: [{ id: 'message_a', role: 'assistant', content: { kind: 'text', text: 'Private message' } }], turns: [{ detail: 'Private turn detail' }] }
const safeLate = privacy.getState().sessionIds.includes(lateAvailable.id) ? maskForgottenConversation(lateAvailable) : lateAvailable
assert.ok(!JSON.stringify(safeLate).includes('Private'), 'A late available response cannot restore known-forgotten conversation content')
assert.equal(safeLate.messages[0].content.reason, 'forgotten')

async function authBindingChecks() {
  const sessionA = { authenticated: true, sessionId: 'owner_session_a', expiresAt: 2000000000, setupRequired: false }
  let canonical = null, next = sessionA, failure = false, deferred = null
  const client = {
    getSession: () => canonical, subscribe: () => () => {},
    bootstrap: async () => { canonical = next; return canonical },
    revalidate: async () => { if (deferred) await deferred; if (failure) throw new Error('offline'); canonical = next; return canonical },
    login: async () => { canonical = next; return canonical },
    logout: async () => { if (failure) throw new Error('offline'); canonical = null },
  }
  const auth = createGatewayAuthStore({ client })
  const unbind = bindGatewayWorkspaceReset(auth, [activity, conversation, privacy])
  await auth.getState().bootstrap()
  const seed = () => {
    conversation.setState({ drafts: { session_a: 'unsent' }, uncertain: { session_a: { text: 'possibly sent', checked: false } } })
    activity.setState({ drafts: { create: draft }, mutation: { key: 'create', kind: 'create', phase: 'unknown', requestId: input.requestId, input } })
    privacy.getState().markForgotten(['forgotten_source'])
  }
  seed()
  let release
  deferred = new Promise(resolve => { release = resolve })
  const before = activity.getState().epoch
  const checking = auth.getState().revalidate()
  assert.equal(auth.getState().phase, 'checking')
  assert.equal(activity.getState().epoch, before)
  assert.equal(conversation.getState().drafts.session_a, 'unsent')
  assert.equal(activity.getState().mutation.phase, 'unknown')
  release(); await checking; deferred = null
  assert.equal(activity.getState().epoch, before, 'Same verified owner preserves both draft stores and locks')
  next = { ...sessionA, sessionId: 'owner_session_b' }
  await auth.getState().revalidate()
  assert.deepEqual(activity.getState().drafts, {})
  assert.deepEqual(conversation.getState().uncertain, {})
  assert.deepEqual(privacy.getState().sessionIds, [])
  assert.ok(activity.getState().epoch > before)
  const staleEpoch = activity.getState().epoch
  let deliver
  const late = new Promise(resolve => { deliver = resolve }).then(() => {
    if (activity.getState().epoch === staleEpoch) activity.setState({ drafts: { create: draft } })
  })
  next = { ...sessionA, authenticated: false }
  await auth.getState().revalidate(); deliver(); await late
  assert.deepEqual(activity.getState().drafts, {}, 'An operation captured before auth loss cannot restore drafts after reset')
  for (const target of ['setup-required', 'error', 'logoutUnconfirmed']) {
    next = sessionA; failure = false; await auth.getState().login('unused test string'); seed()
    if (target === 'setup-required') { next = { ...sessionA, authenticated: false, setupRequired: true }; await auth.getState().revalidate() }
    else if (target === 'error') { failure = true; await auth.getState().revalidate() }
    else { failure = true; await auth.getState().logout(); assert.equal(auth.getState().logoutUnconfirmed, true) }
    assert.deepEqual(activity.getState().drafts, {}, target)
    assert.equal(activity.getState().mutation, null, target)
    assert.deepEqual(conversation.getState().drafts, {}, target)
    assert.deepEqual(privacy.getState().sessionIds, [], target)
  }
  unbind(); auth.dispose()
}
authBindingChecks().then(() => console.log('Gateway activity draft validation, reference eligibility, privacy scrubbing, permanent tombstones, actual auth transitions and late-write reset checks passed.')).catch(error => { console.error(error); process.exitCode = 1 })
