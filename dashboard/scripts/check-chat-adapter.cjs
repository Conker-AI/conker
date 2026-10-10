const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { createRequire } = require('node:module')
const root = path.resolve(__dirname, '..')
const { build } = createRequire(require.resolve('vite', { paths: [root] }))('esbuild')

async function main() {
  const cache = path.join(root, 'node_modules/.cache')
  await fs.mkdir(cache, { recursive: true })
  const temporary = await fs.mkdtemp(path.join(cache, 'chat-adapter-'))
  try {
    const output = path.join(temporary, 'adapter.cjs')
    await build({ absWorkingDir: root, stdin: { contents: 'export { gatewayChatContract } from "./src/lib/chat/gateway-adapter"; export { ChatTranscript } from "./src/components/chat/transcript";', resolveDir: root }, jsx: 'automatic', tsconfigRaw: { compilerOptions: { baseUrl: '.', paths: { '@/*': ['./src/*'] } } }, outfile: output, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent', plugins: [{
      // Node can read workspace files even when esbuild cannot enumerate a Windows ancestor.
      name: 'workspace-files', setup(bundle) {
        bundle.onResolve({ filter: /.*/ }, async args => {
          const name = args.path.startsWith('@/') ? path.join(root, 'src', args.path.slice(2)) : args.path
          if (!name.startsWith('.') && !path.isAbsolute(name)) return { path: name, external: true }
          const resolved = path.resolve(args.resolveDir || root, name)
          for (const file of [resolved, `${resolved}.ts`, `${resolved}.tsx`]) {
            if (await fs.stat(file).then(value => value.isFile(), () => false)) return { path: file }
          }
        })
        bundle.onLoad({ filter: /\.tsx?$/ }, async args => ({ contents: await fs.readFile(args.path, 'utf8'), loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts', resolveDir: path.dirname(args.path) }))
      },
    }] })
    const { gatewayChatContract, ChatTranscript } = require(output)
    const { createElement } = require('react')
    const { renderToStaticMarkup } = require('react-dom/server')
    const message = { id: 'm1', sessionId: 'a', sequence: 7, role: 'assistant', createdAt: '2026-09-25T10:00:00Z', content: { kind: 'text', text: 'Saved answer' } }
    const base = { sessionId: 'a', epoch: 1, active: true, current: { id: 'a', status: 'open', messages: [message], turns: [], pendingSubmissions: [] }, draft: 'Next', pending: false, sendPending: false, detailPending: false, forgotten: false, reviewed: false, notice: null, error: null, rejected: null, inFlight: null, preview: null }
    let state = { ...base }, calls = []
    const handlers = Object.fromEntries(['send', 'setDraft', 'checkHistory', 'stop', 'copy', 'saveArtifact', 'check', 'retrySameRequest', 'restoreDraft', 'releaseUnstarted', 'acknowledgeFound', 'acknowledgeUnknown', 'resumeTurn', 'reviewTurn'].map(name => [name, (...args) => { calls.push([name, ...args]) }]))
    const project = () => gatewayChatContract(state, () => state, () => handlers)
    const run = async action => { assert.equal(action.availability, 'enabled'); await action.run() }
    let chat = project()
    assert.equal(chat.source, 'gateway'); assert.equal(chat.messages[0].sequence, 7)
    assert.deepEqual(chat.messages[0].content, message.content)
    for (const name of ['edit', 'retry', 'fork', 'pin', 'rateUp', 'rateDown', 'redact']) assert.equal(chat.messages[0].actions[name].availability, 'unsupported')
    await run(chat.messages[0].actions.copy); assert.equal(calls.at(-1)[1].id, 'm1')
    await run(chat.messages[0].actions.saveArtifact); assert.equal(calls.at(-1)[0], 'saveArtifact')
    await run(chat.send); assert.equal(calls.at(-1)[0], 'send')
    for (const change of [{ epoch: 2 }, { active: false }, { sessionId: 'b' }, { forgotten: true }, { pending: true }]) {
      state = { ...base, ...change }; calls = []; await chat.send.run(); assert.equal(calls.length, 0, 'Stale send must recheck eligibility')
    }
    state = { ...base, forgotten: true }; calls = []; await chat.messages[0].actions.copy.run(); assert.equal(calls.length, 0)
    assert.deepEqual(project().messages[0].content, { kind: 'unavailable', reason: 'forgotten' }); assert.equal(project().draft, '')
    for (const status of ['awaiting_approval', 'awaiting_budget', 'acted_no_reply', 'action_in_progress', 'outcome_unknown', 'interrupted']) {
      state = { ...base, current: { ...base.current, turns: [{ status, acted: true, endedAt: 'yesterday' }] } }; assert.equal(project().send.availability, 'disabled')
    }
    for (const content of [{ kind: 'unavailable', reason: 'forgotten' }, { kind: 'unavailable', reason: 'unsupported' }]) {
      state = { ...base, current: { ...base.current, messages: [{ ...message, content }] } }; assert.equal(project().messages[0].actions.copy.availability, 'disabled')
    }
    const attempt = { requestId: 'request_1', requestedSessionId: 'a', text: 'Original request', checked: true, notFound: true }
    state = { ...base, attempt }; chat = project()
    assert.equal(chat.submission.kind, 'uncertain'); assert.equal(chat.send.availability, 'disabled')
    assert.equal(chat.submission.attempt.requestId, 'request_1'); await run(chat.submission.actions.retrySameRequest)
    calls = []; state = { ...state, attempt: { ...attempt, requestId: 'request_2' } }; await chat.submission.actions.retrySameRequest.run(); assert.equal(calls.length, 0)
    const receipt = { state: 'bound', sessionId: 'fork', turnId: 'turn_1', status: 'acted_no_reply', acted: true, contentStatus: 'available', pendingText: 'Original request' }
    state = { ...base, attempt: { ...attempt, accepted: true, turnId: 'turn_1', submission: receipt } }; chat = project()
    assert.equal(chat.submission.kind, 'accepted-awaiting-history'); assert.equal(chat.submission.attempt.effectiveSessionId, 'fork'); assert.equal(chat.submission.status, 'acted_no_reply'); assert.equal(chat.submission.acted, true)
    for (const preparation of ['preparing', 'preparation_failed', 'preparation_interrupted', 'forgotten']) {
      state = { ...base, draft: '', attempt: { ...attempt, submission: { ...receipt, state: preparation } } }; chat = project()
      assert.equal(chat.submission.preparation, preparation)
      assert.equal(chat.submission.actions.releaseUnstarted.availability, ['preparation_failed', 'preparation_interrupted'].includes(preparation) ? 'enabled' : 'disabled')
    }
    state = { ...base, draft: '', attempt: { ...attempt, submission: receipt } }; assert.equal(project().submission.actions.restoreDraft.availability, 'enabled')
    state = { ...state, attempt: { ...state.attempt, taskBinding: { taskId: 'task' } } }; assert.equal(project().submission.actions.restoreDraft.availability, 'disabled')
    state = { ...base, attempt: { ...attempt, taskBinding: { taskId: 'task' }, rejectionStatus: 409 } }; chat = project(); assert.equal(chat.submission.actions.retrySameRequest.availability, 'disabled'); assert.equal(chat.submission.actions.releaseUnstarted.availability, 'enabled')
    state = { ...base, attempt: { text: 'Legacy', checked: false }, reviewed: true }; assert.equal(project().submission.actions.acknowledgeUnknown.availability, 'disabled')
    state = { ...state, attempt: { ...state.attempt, checked: true }, reviewed: false }; assert.equal(project().submission.actions.acknowledgeFound.availability, 'disabled')
    state = { ...state, reviewed: true }; assert.equal(project().submission.actions.acknowledgeFound.availability, 'enabled')
    state = { ...base, sendPending: true, inFlight: { requestId: 'request_1', requestedSessionId: 'a', input: { kind: 'text', text: 'sent' }, stopping: false }, preview: { sessionId: 'a', text: 'partial', resetVersion: 0 } }; chat = project()
    assert.equal(chat.submission.kind, 'sending'); assert.equal(chat.generation.phase, 'streaming'); await run(chat.generation.stop)
    assert.equal(chat.draft, '')
    assert.equal(state.draft, 'Next', 'Presentation must not discard the retained draft')
    const waiting = { ...chat, messages: [], generation: { ...chat.generation, previewText: '' } }
    const pendingMarkup = renderToStaticMarkup(createElement(ChatTranscript, { chat: waiting }))
    assert.match(pendingMarkup, /Submitted message awaiting saved history/)
    assert.match(pendingMarkup, /Waiting for saved history/)
    assert.doesNotMatch(pendingMarkup, /No saved messages/)
    const persistedMarkup = renderToStaticMarkup(createElement(ChatTranscript, { chat: { ...waiting, submission: { ...waiting.submission, inputSaved: true } } }))
    assert.doesNotMatch(persistedMarkup, /Submitted message awaiting saved history/)
    state = { ...state, forgotten: true }
    assert.deepEqual(project().submission.attempt.input, { kind: 'unavailable', reason: 'forgotten' })
    assert.doesNotMatch(renderToStaticMarkup(createElement(ChatTranscript, { chat: { ...project(), messages: [] } })), /Submitted message awaiting saved history/)
    state = { ...state, forgotten: false, attempt: { ...attempt, submission: { ...receipt, inputMessageId: message.id } } }
    assert.equal(project().submission.inputSaved, true, 'Only an exact saved input ID retires the pending message')
    state = { ...state, attempt: undefined }
    state = { ...state, preview: { sessionId: 'a', text: '', resetVersion: 2, end: 'done' } }; chat = project()
    assert.equal(chat.generation.previewText, ''); assert.equal(chat.generation.resetVersion, 2); assert.equal(chat.generation.phase, 'ended'); assert.equal(chat.submission.kind, 'sending', 'Preview completion never proves persisted completion')
    state = { ...state, inFlight: { ...state.inFlight, stopping: true } }; assert.equal(project().generation.stop.availability, 'disabled')
    state = { ...state, sessionId: 'b' }; assert.equal(project().generation, null); assert.equal(project().submission.kind, 'idle', 'Another session must not inherit the sending input')
    state = { ...base, rejected: 'Request rejected' }; assert.deepEqual(project().submission, { kind: 'rejected', message: 'Request rejected' })
    assert.equal(project().draft, 'Next', 'A failed send restores the retained draft')
    const failedTurn = { id: 'turn_failed', sessionId: 'a', status: 'failed', acted: false, startedAt: '2026-10-10T12:00:00Z', endedAt: '2026-10-10T12:00:01Z', detail: 'The model requested an unavailable tool. This request was not executed.', action: null, approvalRequestId: null }
    const failedState = { ...base, current: { ...base.current, messages: [{ ...message, role: 'user', content: { kind: 'text', text: 'A saved user request' } }], turns: [failedTurn] } }
    state = failedState; calls = []; chat = project()
    assert.equal(chat.outcomes.length, 1); assert.match(chat.outcomes[0].title, /couldn’t finish/)
    assert.match(chat.outcomes[0].consequence, /No tool action is recorded/); assert.match(chat.outcomes[0].description, /tool that is unavailable/)
    assert.deepEqual(chat.outcomes[0].controls.map(control => control.label), ['Check saved history', 'Review tools'])
    state = { ...failedState, current: { ...failedState.current, turns: [{ ...failedTurn, detail: 'model requested unavailable tool' }] } }
    assert.ok(project().outcomes[0].controls.some(control => control.label === 'Review tools'), 'Historical unavailable-tool failures keep the same fixed guidance')
    state = failedState
    const failedMarkup = renderToStaticMarkup(createElement(ChatTranscript, { chat }))
    assert.match(failedMarkup, /<section[^>]*aria-label="Conker couldn’t finish the reply"/)
    assert.match(failedMarkup, /A saved user request/); assert.match(failedMarkup, /Check saved history/)
    assert.equal(calls.length, 0, 'Rendering a durable failure never retries model or tool work')
    await run(chat.outcomes[0].controls[0].action); assert.deepEqual(calls, [['checkHistory']]); assert.equal(state.draft, 'Next')
    const oldReview = chat.outcomes[0].controls[1].action
    for (const patch of [{ epoch: 2 }, { active: false }, { forgotten: true }, { sessionId: 'b' }, { current: { ...failedState.current, turns: [{ ...failedTurn, status: 'complete' }] } }]) {
      calls = []; state = { ...failedState, ...patch }; await oldReview.run(); assert.equal(calls.length, 0, 'Outcome navigation rechecks the saved source and turn')
    }
    state = { ...failedState, forgotten: true }; assert.deepEqual(project().outcomes, [])
    state = { ...failedState, current: { ...failedState.current, turns: [{ ...failedTurn, detail: 'PRIVATE provider payload' }] } }; assert.ok(!renderToStaticMarkup(createElement(ChatTranscript, { chat: project() })).includes('PRIVATE'))
    const later = { ...failedTurn, id: 'turn_later', startedAt: '2026-10-10T13:00:00Z', endedAt: '2026-10-10T13:00:01Z', status: 'complete', detail: null }
    state = { ...failedState, current: { ...failedState.current, turns: [later, failedTurn] } }; assert.deepEqual(project().outcomes, [], 'A later success removes old terminal failure from the main transcript')
    for (const status of ['failed', 'interrupted']) for (const actionState of ['dispatching', 'in_progress', 'outcome_unknown', 'unknown']) {
      state = { ...failedState, current: { ...failedState.current, turns: [{ ...failedTurn, status, action: { id: 'action_a', state: actionState, jobId: null } }, later] } }
      const outcome = project().outcomes[0]; assert.ok(outcome, 'An older unconfirmed action stays visible even before acted is set')
      assert.match(outcome.consequence, /not confirmed/)
      assert.ok(outcome.controls.some(control => control.label === 'Review saved action'))
      assert.ok(!outcome.controls.some(control => control.label === 'Ask only for the reply'))
    }
    for (const status of ['outcome_unknown', 'action_in_progress', 'awaiting_budget']) {
      state = { ...failedState, current: { ...failedState.current, turns: [{ ...failedTurn, status, action: { id: 'action_a', state: 'outcome_unknown', jobId: null } }, later] } }
      const outcome = project().outcomes[0]; assert.ok(outcome); assert.match(outcome.consequence, /not confirmed/)
      assert.deepEqual(outcome.controls.map(control => control.label), ['Check saved history', 'Review saved action'], 'Uncertain action never receives generic Retry or reply-only recovery')
    }
    for (const acted of [false, true]) {
      state = { ...failedState, current: { ...failedState.current, turns: [{ ...failedTurn, status: 'interrupted', acted }] } }
      assert.equal(project().outcomes[0].title, 'This turn was interrupted'); assert.ok(!project().outcomes[0].controls.some(control => control.label === 'Ask only for the reply'))
    }
    const unreplied = { ...failedTurn, status: 'acted_no_reply', acted: true, action: { id: 'action_a', state: 'completed', jobId: null } }
    state = { ...failedState, pending: true, current: { ...failedState.current, turns: [unreplied] } }; calls = []; chat = project()
    const resume = chat.outcomes[0].controls.find(control => control.label === 'Ask only for the reply').action
    assert.equal(resume.availability, 'enabled', 'A separate unsendable composer draft does not block recovery of a saved reply')
    await run(resume); assert.deepEqual(calls, [['resumeTurn', failedTurn.id]], 'Explicit recovery targets the same saved turn, never send')
    for (const patch of [{ operationPending: true }, { active: false }, { forgotten: true }, { epoch: 4 }, { sessionId: 'b' }, { current: { ...failedState.current, turns: [{ ...unreplied, status: 'outcome_unknown' }] } }]) {
      calls = []; state = { ...failedState, current: { ...failedState.current, turns: [unreplied] }, ...patch }; await resume.run(); assert.equal(calls.length, 0)
    }
    state = { ...failedState, current: { ...failedState.current, turns: [{ ...unreplied, acted: false }] } }; assert.ok(!project().outcomes[0].controls.some(control => control.label === 'Ask only for the reply'))
    state = { ...failedState, current: { ...failedState.current, turns: [{ ...unreplied, status: 'awaiting_approval', approvalRequestId: 'approval_a' }] } }
    chat = project(); assert.ok(!chat.outcomes[0].description.includes('Nothing has been done')); assert.match(chat.outcomes[0].consequence, /action was recorded/)
    calls = []; await run(chat.outcomes[0].controls.find(control => control.label === 'Review action').action); assert.deepEqual(calls, [['reviewTurn', failedTurn.id, 'approval']])
    console.log('Chat adapter: mapping, stale callbacks, privacy, saved outcomes, explicit safe recovery, task separation, forks and preview lifecycle passed.')
  } finally { await fs.rm(temporary, { recursive: true, force: true }) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
