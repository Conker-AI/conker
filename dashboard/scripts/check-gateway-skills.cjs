const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..'), cache = new Map()
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports
  const module = { exports: {} }; cache.set(relative, module)
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('require', 'module', 'exports', code)(request => {
    if (request === 'zustand/vanilla') return require(request)
    if (request.startsWith('@/')) return load(`src/${request.slice(2)}.ts`)
    assert.ok(request.startsWith('.'), `Unexpected dependency ${request}`)
    return load(`${path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))}.ts`)
  }, module, module.exports)
  return module.exports
}
const { createGatewaySkillsClient, parseSkills, validateSkillIds } = load('src/lib/gateway/skills.ts')
const { createGatewayRuntimeClient, parseRuntimeSubmission } = load('src/lib/gateway/runtime.ts')
const { createGatewayTransport } = load('src/lib/gateway/transport.ts')
const { createGatewayRuntimeWorkspaceState, createRequestOptions, retainedRequestOptions } = load('src/components/gateway/runtime-state.ts')
const skill = { id: 'review-code', name: 'review-code', description: 'Review changes before applying them.', revision: 1, enabled: true, sha256: 'a'.repeat(64), createdAt: 1_800_000_000, updatedAt: 1_800_000_000, markdown: '---\nname: review-code\ndescription: Review changes before applying them.\n---\nRead the diff.' }
const requestId = 'request_skills_00001'
const receipt = { request_id: requestId, requested_session_id: 's_one', effective_session_id: null, turn_id: null, task_id: null, input_message_id: null, final_message_id: null, message_refs: [], state: 'preparing', status: 'preparing', acted: false, content_status: 'available', created_at: 1_800_000_000, updated_at: 1_800_000_000, pending_text: 'Review this change', failure_code: null, skill_ids: ['review-code'], model_id: 'chosen-model' }

async function main() {
  const calls = []
  let response = { schemaVersion: 1, results: [skill] }
  const auth = { request: async (...args) => { calls.push(args); return structuredClone(response) } }
  const client = createGatewaySkillsClient(auth)
  const rows = await client.list()
  assert.equal(rows[0].markdown, undefined, 'Collection metadata never imports instructions into a chat')
  assert.equal(calls.pop()[0], '/api/control/pi/skills')
  response = skill
  assert.equal((await client.get('review-code')).markdown, skill.markdown)
  assert.equal(calls.pop()[0], '/api/control/pi/skills/review-code')
  await client.import(skill.markdown, 0)
  assert.deepEqual(calls.pop(), ['/api/control/pi/skills/import', { method: 'POST', body: { markdown: skill.markdown, expected_revision: 0 } }])
  await client.import(skill.markdown, 1, 'review-code')
  assert.deepEqual(calls.pop()[1].body, { markdown: skill.markdown, expected_revision: 1, expected_id: 'review-code' }, 'Replacement binds the inspected identity and revision')
  response = { ...skill, enabled: false, revision: 2 }
  assert.equal((await client.setEnabled('review-code', false, 1)).enabled, false)
  assert.deepEqual(calls.pop()[1].body, { enabled: false, expected_revision: 1 })
  for (const id of ['../secret', 'with/slash', 'UPPER', 'has--gaps', '', 'a'.repeat(65)]) await assert.rejects(client.get(id), error => error.kind === 'validation')
  assert.equal(calls.length, 0, 'Invalid identifiers do not reach transport')
  await assert.rejects(client.import('x'.repeat(32_001), 0), error => error.kind === 'validation')
  await assert.rejects(client.import('🙂'.repeat(16_000), 0), error => error.kind === 'too-large')
  await assert.rejects(client.setEnabled('review-code', false, 0), error => error.kind === 'validation')
  assert.throws(() => parseSkills({ schemaVersion: 1, results: [skill, skill] }), error => error.kind === 'invalid-response')
  assert.throws(() => parseSkills({ schemaVersion: 1, results: [{ ...skill, enabled: 'yes' }] }), error => error.kind === 'invalid-response')
  for (const ids of [['a', 'b', 'c', 'd'], ['a', 'a'], ['../bad'], null]) assert.throws(() => validateSkillIds(ids), error => error.kind === 'validation')
  response = { submission: receipt }
  const runtime = createGatewayRuntimeClient(auth)
  const saved = await runtime.submitRequest('s_one', 'Review this change', requestId, { modelId: 'chosen-model', skillIds: ['review-code'] })
  assert.deepEqual(calls.pop()[1].body, { text: 'Review this change', request_id: requestId, model_id: 'chosen-model', skill_ids: ['review-code'] })
  assert.deepEqual(saved.skillIds, ['review-code'])
  assert.equal(saved.modelId, 'chosen-model')
  response = { submission: { ...receipt, think: true } }
  const thinkingRequest = await runtime.submitRequest('s_one', 'Think this through', requestId, createRequestOptions('', [], true))
  assert.equal(calls.pop()[1].body.think, true)
  assert.equal(thinkingRequest.think, true)
  assert.equal(retainedRequestOptions({ text: '', checked: true, submission: thinkingRequest }).think, true, 'Retry restores explicit thinking from the admitted request')
  await assert.rejects(runtime.submitRequest('s_one', 'Analyze', requestId, { think: 'true' }), error => error.kind === 'validation')
  response = { schemaVersion: 1, session_id: 's_one', content_status: 'available', results: [{ session_id: 's_one', turn_id: 'turn_one', input_message_id: 'message_one', created_at: 1800000000, status: 'queued', model: null, provider: null, result: null, detail: null }] }
  assert.equal((await runtime.getThinking('s_one')).results[0].inputMessageId, 'message_one')
  assert.equal(calls.pop()[0], '/api/pi/sessions/s_one/thinking')
  response.content_status = 'forgotten'
  assert.deepEqual(await runtime.getThinking('s_one'), { forgotten: true, results: [] }, 'Forgotten results are never retained from a stale response')
  calls.pop()
  response = { submission: { ...receipt, model_id: null } }
  await runtime.submitRequest('s_one', 'Review this change', requestId, createRequestOptions('', ['review-code']))
  assert.deepEqual(calls.pop()[1].body, { text: 'Review this change', request_id: requestId, skill_ids: ['review-code'] }, 'Automatic plus skills omits the empty composer model instead of failing preflight')
  assert.deepEqual(retainedRequestOptions({ text: 'Review', checked: false, requestOptions: { modelId: '', skillIds: ['review-code'] } }), { skillIds: ['review-code'] }, 'Previously retained Automatic attempts can be retried without an empty model override')
  const options = retainedRequestOptions({ text: '', checked: true, submission: saved })
  assert.deepEqual(options, { modelId: 'chosen-model', skillIds: ['review-code'] }, 'Reload recovers frozen submission options, not current composer choices')
  assert.deepEqual(retainedRequestOptions({ text: '', checked: false, requestOptions: { modelId: 'original', skillIds: ['a'] }, submission: saved }), { modelId: 'original', skillIds: ['a'] })
  const forgotten = parseRuntimeSubmission({ ...receipt, state: 'forgotten', content_status: 'forgotten', skill_ids: ['private-skill'], model_id: 'private-model' })
  assert.deepEqual(forgotten.skillIds, [])
  assert.equal(forgotten.modelId, null)
  await assert.rejects(runtime.submitRequest('s_one', 'Review', requestId, { skillIds: ['a', 'a'] }), error => error.kind === 'validation')
  assert.equal(calls.length, 0)
  const unicode = { ...skill, markdown: '🙂'.repeat(32_000) }
  const transport = createGatewayTransport({ origin: 'https://conker.test', fetch: async () => new Response(JSON.stringify(unicode), { headers: { 'Content-Type': 'application/json' } }) })
  const wideReader = createGatewaySkillsClient({ request: (route, options) => transport.request(route, options) })
  assert.equal((await wideReader.get('review-code')).markdown, unicode.markdown, 'The actual gateway transport accepts a valid large Unicode source created through CLI')
  const workspace = createGatewayRuntimeWorkspaceState()
  workspace.setState({ skillChoices: { s_one: ['review-code'] }, thinkChoices: { s_one: true }, uncertain: { s_one: { text: 'Review', checked: false, requestOptions: options } } })
  assert.deepEqual(workspace.getState().skillChoices.s_one, ['review-code'], 'An uncertain attempt retains the visible selection')
  workspace.getState().reset()
  assert.deepEqual(workspace.getState().skillChoices, {}, 'Changing browser identity clears selections')
  assert.deepEqual(workspace.getState().thinkChoices, {}, 'Changing browser identity clears thinking opt-in')
  console.log('Skills metadata, revision-bound import/state, bounded selection, durable request replay and privacy checks passed.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
