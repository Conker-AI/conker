const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const workspaceSource = fs.readFileSync(path.resolve(__dirname, '../src/components/gateway/runtime-workspace.tsx'), 'utf8')
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

assert.match(workspaceSource, /GatewayModelPicker compact client=\{control\} value=\{firstModel\}/,
  'The first-message composer must expose the answer model before dispatch')
assert.match(workspaceSource, /GatewayAgentPicker compact client=\{control\} value=\{firstAgent\}/,
  'The first-message composer must expose the durable agent before creating the conversation')
assert.match(workspaceSource, /client\.drafts\.start\(savedStart!\.requestId, savedStart!\.revision, signal\)/,
  'Session creation atomically promotes the exact saved intent, including agent and privacy')
assert.match(workspaceSource, /GatewayModelPicker compact client=\{control\} value=\{firstModel\}[^\n]+manualRequired=\{firstPrivacy\.harnessDisabled\}/,
  'Disabling the harness before creation must require an explicit answer model')
assert.match(workspaceSource, /firstPrivacy\.harnessDisabled && !firstModel/,
  'The first message must stay blocked until the required manual model is selected')
assert.doesNotMatch(workspaceSource, /new-chat-composer"[^\n]+autoFocus/,
  'The new-chat composer must not unconditionally open a mobile keyboard')
assert.match(workspaceSource, /matchMedia\('\(pointer: fine\) and \(min-width: 768px\)'\)/,
  'Desktop fine-pointer devices may still receive convenient composer focus')
assert.match(workspaceSource, /GatewayModelPicker compact[^\n]+[\s\S]*NewChatPrivacyControl[^\n]+[\s\S]*<NewChatMediaPlaceholders \/>[\s\S]*NewChatVoiceControl[^\n]+[\s\S]*aria-label="Send message"/,
  'The first-message composer toolbar must keep identity, privacy, call, dictation and send controls together')
const extrasSource = fs.readFileSync(path.join(__dirname, '../src/components/gateway/new-chat-extras.tsx'), 'utf8')
assert.match(extrasSource, /Voice call: send a message first, then call from the chat header\.[\s\S]*Video calls are not connected yet\./, 'Call and video placeholders stay honest about being unavailable (behind More)')
assert.match(extrasSource, /starters\.map\(item => <Button key=\{item\.label\}[^\n]*\{item\.label\}<\/Button>/,
  'Conversation starters show their words, so their names are visible and accessible')
assert.doesNotMatch(workspaceSource, /to="\/memory"[\s\S]{0,500}NewChatPrivacyControl|to="\/tools"[\s\S]{0,500}NewChatPrivacyControl/,
  'Global Memory and Tools destinations must not masquerade as per-chat composer controls')
assert.match(workspaceSource, /GatewaySessionAgentControl[^\n]+activeAgentId=\{activeAgentId\}[^\n]+onSaved=/,
  'An open conversation must expose an explicit future-turn agent handoff')
assert.match(workspaceSource, /createRequestOptions\(promotedDraft.modelId, promotedDraft.skillIds, promotedDraft.think, promotedDraft.revision, promotedDraft.researchMode, Boolean\(modeHints\.current\.new\?\.isAnalysis\)\)/,
  'First-message options and exact draft revision cross atomic session promotion')
assert.match(workspaceSource, /createRequestOptions\(modelOverride \?\? composer\?\.modelId/)
assert.match(workspaceSource, /client.submitRequest\([^\n]+\.\.\.requestOptions/,
  'The exact resolved model choice must be sent to the runtime')

assert.equal(canSubmitRuntime('next', false, undefined, { ...detail, turns: [{ status: 'interrupted', acted: true, endedAt: '2026-09-20T12:00:00Z' }] }), false)
assert.equal(canSubmitRuntime('next', false, undefined, { ...detail, turns: [{ status: 'interrupted', acted: false, endedAt: '2026-09-20T12:00:00Z' }] }), true)
const interrupted = { text: '', checked: true, requestId: 'saved_request_identity', submission: { state: 'preparation_interrupted', contentStatus: 'available', pendingText: 'Saved before crash' } }
assert.equal(recoverSubmissionDraft(interrupted, ''), 'Saved before crash')
assert.equal(recoverSubmissionDraft(interrupted, 'Newer draft'), 'Newer draft')
assert.equal(recoverSubmissionDraft({ ...interrupted, submission: { ...interrupted.submission, contentStatus: 'forgotten' } }, ''), '')
