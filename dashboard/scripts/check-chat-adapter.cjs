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
    await build({ absWorkingDir: root, entryPoints: ['./src/lib/chat/gateway-adapter.ts'], tsconfigRaw: { compilerOptions: { baseUrl: '.', paths: { '@/*': ['./src/*'] } } }, outfile: output, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent', plugins: [{
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
    const { gatewayChatContract } = require(output)
    const message = { id: 'm1', sessionId: 'a', sequence: 7, role: 'assistant', createdAt: '2026-09-25T10:00:00Z', content: { kind: 'text', text: 'Saved answer' } }
    const base = { sessionId: 'a', epoch: 1, active: true, current: { id: 'a', status: 'open', messages: [message], turns: [], pendingSubmissions: [] }, draft: 'Next', pending: false, sendPending: false, detailPending: false, forgotten: false, reviewed: false, notice: null, error: null, rejected: null, inFlight: null, preview: null }
    let state = { ...base }, calls = []
    const handlers = Object.fromEntries(['send', 'setDraft', 'checkHistory', 'stop', 'copy', 'check', 'retrySameRequest', 'restoreDraft', 'releaseUnstarted', 'acknowledgeFound', 'acknowledgeUnknown'].map(name => [name, (...args) => { calls.push([name, ...args]) }]))
    const project = () => gatewayChatContract(state, () => state, () => handlers)
    const run = async action => { assert.equal(action.availability, 'enabled'); await action.run() }
    let chat = project()
    assert.equal(chat.source, 'gateway'); assert.equal(chat.messages[0].sequence, 7)
    assert.deepEqual(chat.messages[0].content, message.content)
    for (const name of ['edit', 'retry', 'fork', 'pin', 'rateUp', 'rateDown', 'redact', 'saveArtifact']) assert.equal(chat.messages[0].actions[name].availability, 'unsupported')
    await run(chat.messages[0].actions.copy); assert.equal(calls.at(-1)[1].id, 'm1')
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
    state = { ...state, preview: { sessionId: 'a', text: '', resetVersion: 2, end: 'done' } }; chat = project()
    assert.equal(chat.generation.previewText, ''); assert.equal(chat.generation.resetVersion, 2); assert.equal(chat.generation.phase, 'ended'); assert.equal(chat.submission.kind, 'sending', 'Preview completion never proves persisted completion')
    state = { ...state, inFlight: { ...state.inFlight, stopping: true } }; assert.equal(project().generation.stop.availability, 'disabled')
    state = { ...state, sessionId: 'b' }; assert.equal(project().generation, null); assert.equal(project().submission.kind, 'idle', 'Another session must not inherit the sending input')
    state = { ...base, rejected: 'Request rejected' }; assert.deepEqual(project().submission, { kind: 'rejected', message: 'Request rejected' })
    console.log('Chat adapter: mapping, stale callbacks, privacy, parked locks, recovery, task separation, forks and preview lifecycle passed.')
  } finally { await fs.rm(temporary, { recursive: true, force: true }) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
