const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const root = path.resolve(__dirname, '..'), cache = new Map()
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports
  const module = { exports: {} }; cache.set(relative, module)
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(request => {
    if (request === 'zustand/vanilla') return require(request)
    const target = request.startsWith('@/') ? `src/${request.slice(2)}` : path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))
    return load(`${target}.ts`)
  }, module, module.exports)
  return module.exports
}
const { parseOwnerRequest, createGatewayOwnerClient, OwnerDecisionError } = load('src/lib/gateway/owner.ts')
const { createGatewayOwnerState, ownerDecisionEligibility, canReleaseExpiredOwnerDecision } = load('src/components/gateway/owner-state.ts')
const { GatewayError, createGatewayTransport } = load('src/lib/gateway/transport.ts')
const fixture = () => ({ id: 'request_one', kind: 'verification', title: 'Echo an exact value', details: 'Immutable tool request', actor: 'Companion', severity: 'warning', status: 'pending', created_at: '2026-09-20T12:00:00+00:00', updated_at: '2026-09-20T12:00:00+00:00', decision: null,
  action: { subject_type: 'tool', subject_id: 'approval.test-echo', version: 1, args: { value: 'Test only' } }, approval: { expires_at: '2026-09-20T12:05:00+00:00', consumed_at: null, origin_valid: true }, reviewable: true, unavailable_reason: null,
  payload: { nonce: 'DO NOT COPY', created_by_agent_key: 'DO NOT COPY', secret: 'DO NOT COPY' }, nonce: 'DO NOT COPY' })
async function main() {
  const parsed = parseOwnerRequest(fixture())
  assert.ok(!JSON.stringify(parsed).includes('DO NOT COPY'))
  assert.deepEqual(parsed.action.args, { value: 'Test only' })
  assert.deepEqual(ownerDecisionEligibility(parsed, Date.parse('2026-09-20T12:01:00Z')), { approve: true, reject: true, expired: false })
  assert.deepEqual(ownerDecisionEligibility(parsed, Date.parse('2026-09-20T12:06:00Z')), { approve: false, reject: true, expired: true })
  const expired = { ...parsed, reviewable: false, unavailableReason: 'expired' }
  assert.equal(canReleaseExpiredOwnerDecision(expired, { status: 'approved', note: '', checked: true, conflict: true }), true)
  for (const attempt of [undefined, { status: 'approved', note: '', checked: true }, { status: 'approved', note: '', checked: false, conflict: true }, { status: 'rejected', note: '', checked: true, conflict: true }]) assert.equal(canReleaseExpiredOwnerDecision(expired, attempt), false)
  assert.equal(canReleaseExpiredOwnerDecision(parsed, { status: 'approved', note: '', checked: true, conflict: true }), false)
  for (const reason of ['invalid_origin', 'invalid_action', 'arguments_unavailable', 'consumed', 'already_decided']) {
    const value = { ...parsed, reviewable: false, unavailableReason: reason }
    assert.equal(ownerDecisionEligibility(value, Date.now()).reject, false)
  }
  for (const mutate of [value => value.id = '../traversal', value => value.kind = 'info', value => value.status = 'unknown', value => value.reviewable = 'true',
    value => value.approval.origin_valid = false, value => value.approval.consumed_at = '2026-09-20T12:00:01Z', value => value.approval.expires_at = null,
    value => value.action.args = null, value => value.action.version = 0, value => value.action.subject_type = 'automation', value => value.action.args.value = 'x'.repeat(32769), value => value.action.args.value = 9007199254740993,
    value => value.decision = { status: 'approved', actor: 'owner', note: '', at: value.created_at }, value => value.created_at = 'invalid',
    value => value.unavailable_reason = 'provider raw error', value => value.title = 'x'.repeat(1025)]) {
    const value = fixture(); mutate(value); assert.throws(() => parseOwnerRequest(value), error => error.kind === 'invalid-response')
  }
  assert.throws(() => parseOwnerRequest(fixture(), 'request_other'))
  const requests = []
  const client = createGatewayOwnerClient({ request: async (route, options) => { requests.push([route, options]); return route === '/api/owner/requests' ? { results: [fixture()], next_cursor: null } : fixture() } })
  assert.equal((await client.listRequests()).results.length, 1)
  assert.deepEqual(requests[0], ['/api/owner/requests', { query: { limit: 50 }, signal: undefined }])
  await client.getRequest('request_one')
  assert.equal(requests[1][0], '/api/owner/requests/request_one')
  await assert.rejects(client.getRequest('a/b'), error => error.kind === 'validation')
  await assert.rejects(client.listRequests({ limit: 201 }))
  const calls = [], approved = { ...fixture(), status: 'approved', reviewable: false, unavailable_reason: 'already_decided', decision: { status: 'approved', actor: 'owner', note: 'Exact note', at: '2026-09-20T12:01:00Z' } }
  const success = createGatewayOwnerClient({ request: async (...args) => { calls.push(args); return approved } })
  assert.equal((await success.decide('request_one', 'approved', 'Exact note')).status, 'approved')
  assert.deepEqual(calls, [['/api/owner/requests/request_one/decision', { method: 'POST', body: { status: 'approved', note: 'Exact note' }, signal: undefined }]])
  let attempts = 0
  const unknown = createGatewayOwnerClient({ request: async () => { attempts++; throw new GatewayError('network') } })
  await assert.rejects(unknown.decide('request_one', 'approved', ''), error => error instanceof OwnerDecisionError && error.outcome === 'unknown')
  assert.equal(attempts, 1, 'Never retry a decision automatically')
  assert.equal(new OwnerDecisionError(new GatewayError('verification-cancelled'), 'request_one').outcome, 'rejected')
  assert.equal(new OwnerDecisionError(new GatewayError('http', 409), 'request_one').outcome, 'conflict')
  const wrongRecord = createGatewayOwnerClient({ request: async () => ({ ...approved, id: 'wrong' }) })
  await assert.rejects(wrongRecord.decide('request_one', 'approved', ''), error => error.outcome === 'unknown')
  const duplicate = createGatewayOwnerClient({ request: async () => ({ results: [fixture(), fixture()], next_cursor: null }) })
  await assert.rejects(duplicate.listRequests(), error => error.kind === 'invalid-response')
  const state = createGatewayOwnerState()
  state.setState({ notes: { request_one: 'Private draft' }, attempts: { request_one: { status: 'approved', note: 'Private draft', checked: false } }, pendingId: 'request_one' })
  state.getState().reset()
  assert.equal(state.getState().epoch, 1); assert.deepEqual(state.getState().notes, {}); assert.deepEqual(state.getState().attempts, {}); assert.equal(state.getState().pendingId, null)
  const paths = []
  const transport = createGatewayTransport({ origin: 'https://conker.test', fetch: async (url) => { paths.push(String(url)); return new Response(JSON.stringify(fixture()), { headers: { 'content-type': 'application/json' } }) } })
  await transport.request('/api/owner/requests/request_one')
  assert.equal(paths.length, 1)
  console.log('Gateway owner request, decision and recovery checks passed.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
