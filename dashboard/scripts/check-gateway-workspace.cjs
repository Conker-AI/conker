const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const file = path.resolve(__dirname, '../src/components/gateway/runtime-state.ts')
const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const loaded = { exports: {} }
new Function('require', 'module', 'exports', code)(request => {
  if (request === 'zustand/vanilla') return require(request)
  throw new Error(`Unexpected live workspace state dependency: ${request}`)
}, loaded, loaded.exports)
const { createGatewayRuntimeWorkspaceState, canSubmitRuntime, checkedAttempt, resolveAttempt, recoverSubmissionDraft } = loaded.exports
const detail = { id: 'a', status: 'open', turns: [] }
assert.equal(canSubmitRuntime('hello', false, undefined, detail), true)
for (const args of [
  ['', false, undefined, detail], ['   ', false, undefined, detail], ['a'.repeat(16001), false, undefined, detail],
  ['hello', true, undefined, detail], ['hello', false, undefined, null],
  ['hello', false, undefined, { ...detail, status: 'forgotten' }],
  ['hello', false, undefined, { ...detail, status: 'closed' }],
  ['hello', false, undefined, { ...detail, status: 'forked' }],
  ['hello', false, undefined, { ...detail, pendingSubmissions: [{ state: 'preparing' }] }],
  ['hello', false, undefined, { ...detail, turns: [{ id: 'turn', endedAt: null, status: 'running' }] }],
  ['hello', false, { text: 'earlier', checked: false }, detail],
]) assert.equal(canSubmitRuntime(...args), false)
for (const status of ['awaiting_approval', 'awaiting_budget', 'acted_no_reply', 'action_in_progress', 'outcome_unknown']) {
  assert.equal(canSubmitRuntime('next', false, undefined, { ...detail, turns: [{ id: 'turn', endedAt: '2026-09-20T12:00:00Z', status }] }), false, `Parked ${status} must block sending even with endedAt populated`)
}
assert.equal(canSubmitRuntime('next', false, undefined, { ...detail, turns: [{ id: 'turn', endedAt: '2026-09-20T12:00:00Z', status: 'completed' }] }), true)
assert.equal(canSubmitRuntime('😀'.repeat(16000), false, undefined, detail), true, 'Character bounds count Unicode code points')
const attempt = { text: 'sent once', turnId: 'turn', checked: false }
assert.throws(() => resolveAttempt(attempt, attempt.text, 'found'), /Check the chat first/)
const checked = checkedAttempt(attempt)
assert.equal(attempt.checked, false, 'History checking does not mutate the original attempt')
assert.equal(canSubmitRuntime('next', false, checked, detail), false, 'A successful GET never silently unlocks sending')
assert.deepEqual(resolveAttempt(checked, attempt.text, 'found'), { draft: '' })
assert.deepEqual(resolveAttempt(checked, 'revised draft', 'found'), { draft: 'revised draft' }, 'Acknowledgement preserves later edits')
assert.deepEqual(resolveAttempt(checked, attempt.text, 'allow-new'), { draft: attempt.text }, 'Acknowledgement does not send or discard text')
const workspace = createGatewayRuntimeWorkspaceState()
workspace.setState({ selected: 'a', drafts: { a: 'local text' }, uncertain: { a: attempt }, operation: 'send', title: 'New title', createUnknown: 'unchecked' })
const retained = workspace.getState()
assert.equal(retained.drafts.a, 'local text')
assert.equal(retained.uncertain.a.turnId, 'turn')
assert.equal(retained.operation, 'send', 'In-flight lock survives view unmount because root owns the store')
const epoch = retained.epoch
retained.reset()
assert.equal(workspace.getState().epoch, epoch + 1, 'Reset invalidates callbacks from old session operations')
assert.deepEqual(workspace.getState().drafts, {})
assert.deepEqual(workspace.getState().uncertain, {})
assert.equal(workspace.getState().selected, null)
assert.equal(workspace.getState().operation, null)
assert.equal(workspace.getState().title, '')
assert.equal(workspace.getState().createUnknown, null)
console.log('Gateway workspace send guards, explicit uncertainty resolution, retained drafts/locks and auth-reset epoch checks passed.')

assert.equal(canSubmitRuntime('next', false, undefined, { ...detail, turns: [{ status: 'interrupted', acted: true, endedAt: '2026-09-20T12:00:00Z' }] }), false)
assert.equal(canSubmitRuntime('next', false, undefined, { ...detail, turns: [{ status: 'interrupted', acted: false, endedAt: '2026-09-20T12:00:00Z' }] }), true)
const interrupted = { text: '', checked: true, requestId: 'saved_request_identity', submission: { state: 'preparation_interrupted', contentStatus: 'available', pendingText: 'Saved before crash' } }
assert.equal(recoverSubmissionDraft(interrupted, ''), 'Saved before crash')
assert.equal(recoverSubmissionDraft(interrupted, 'Newer draft'), 'Newer draft')
assert.equal(recoverSubmissionDraft({ ...interrupted, submission: { ...interrupted.submission, contentStatus: 'forgotten' } }, ''), '')
