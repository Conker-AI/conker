// Team runs in the browser: strict reads, the exact bodies Pi accepts, plain-word refusals, what the owner may do next
// in each state, and the transport allowlist (read one run by id, run a role, check, finish; never list or start).
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..'), cache = new Map()
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports
  const module = { exports: {} }; cache.set(relative, module)
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(request => request === 'zod' ? require('zod') : load(`${path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))}.ts`), module, module.exports)
  return module.exports
}
const { createTeamRunsClient, TeamRunError } = load('src/lib/gateway/team-runs.ts')
const { createGatewayTransport, GatewayError } = load('src/lib/gateway/transport.ts')
const { nextRoles, runSummary, usageOf, RUN_STATE_WORDS } = load('src/lib/team-run-view.ts')
const { createFakeTeamRuns, FAKE_TEAM_RUN_ID } = load('src/dev/fake-gateway-team-runs.ts')
const { createFakeTeams } = load('src/dev/fake-gateway-teams.ts')

const fail = status => { throw new GatewayError('http', status) }
let tick = 0
const teams = createFakeTeams(() => 1_000_000 + tick++, fail, () => ++tick)
const team = teams('/api/control/pi/collaboration/teams/team_' + '9'.repeat(32), 'GET', {})
function fresh() {
  const handle = createFakeTeamRuns(() => 1_000_000, fail, () => team.definition, () => team.id)
  const calls = []
  const auth = { request: async (url, options = {}) => { calls.push([url, options]); return structuredClone(handle(url, options.method ?? 'GET', options)) } }
  return { client: createTeamRunsClient(auth), calls }
}

async function main() {
  const { client, calls } = fresh()
  const run = await client.get(FAKE_TEAM_RUN_ID)
  assert.equal(calls.pop()[0], `/api/control/pi/team-runs/${FAKE_TEAM_RUN_ID}`)
  assert.equal(run.state, 'ready'); assert.equal(run.steps.length, 1)
  await assert.rejects(client.get('teamrun_nope'), error => error.kind === 'validation')

  // Between roles: only the handoffs from the last role that ran, and the run is not over.
  const next = nextRoles(run)
  assert.deepEqual(next.map(item => [item.roleName, item.handoffId]), [['Reviewer', 'plan_review']])
  assert.match(runSummary(run), /Planner answered.*Reviewer is next/)
  assert.deepEqual(usageOf(run), { tokens: 1452, costUsd: null, unknownAnswers: 0 })

  // The exact body Pi accepts: a background step with the handoff reviewed, at the run's revision.
  const stepped = await client.step(run, { roleId: 'reviewer', handoffId: 'plan_review', reviewed: true })
  const [stepUrl, stepOptions] = calls.pop()
  assert.equal(stepUrl, `/api/control/pi/team-runs/${FAKE_TEAM_RUN_ID}/steps`)
  assert.equal(stepOptions.method, 'POST')
  assert.deepEqual(Object.keys(stepOptions.body).sort(), ['background', 'conditionReviewed', 'expected_revision', 'handoffId', 'request_id', 'roleId'])
  assert.equal(stepOptions.body.background, true); assert.equal(stepOptions.body.conditionReviewed, true); assert.equal(stepOptions.body.expected_revision, run.revision)
  assert.match(stepOptions.body.request_id, /^[A-Za-z0-9_-]{16,128}$/)
  assert.equal(stepped.state, 'running'); assert.equal(nextRoles(stepped).length, 0)
  assert.match(runSummary(stepped), /Reviewer is working/)
  const finished = await client.get(FAKE_TEAM_RUN_ID)
  assert.equal(finished.state, 'ready'); assert.equal(finished.steps.length, 2)
  assert.deepEqual(nextRoles(finished), []); assert.match(runSummary(finished), /last role/)

  // Refusals: a stale revision, a step without the reviewed handoff, ending a run.
  const second = fresh()
  const base = await second.client.get(FAKE_TEAM_RUN_ID)
  await assert.rejects(second.client.step({ ...base, revision: base.revision + 5 }, { roleId: 'reviewer', handoffId: 'plan_review', reviewed: true }), error => error instanceof TeamRunError && error.stale)
  await assert.rejects(second.client.step(base, { roleId: 'reviewer' }), error => error instanceof TeamRunError && error.code === 'handoff_required')
  const ended = await second.client.finish(base, 'completed')
  assert.equal(ended.state, 'completed'); assert.match(runSummary(ended), /finished/); assert.deepEqual(nextRoles(ended), [])
  assert.equal(second.calls.at(-1)[1].body.state, 'completed'); assert.deepEqual(Object.keys(second.calls.at(-1)[1].body).sort(), ['expected_revision', 'state'])

  // A reply that drifts from Pi's shape is refused, not shown.
  const drift = createTeamRunsClient({ request: async () => ({ ...structuredClone(base), state: 'paused' }) })
  await assert.rejects(drift.get(FAKE_TEAM_RUN_ID), error => error.kind === 'invalid-response')
  const extra = createTeamRunsClient({ request: async () => ({ ...structuredClone(base), surprise: 1 }) })
  await assert.rejects(extra.get(FAKE_TEAM_RUN_ID), error => error.kind === 'invalid-response')
  const otherRun = createTeamRunsClient({ request: async () => ({ ...structuredClone(base), id: `teamrun_${'b'.repeat(32)}` }) })
  await assert.rejects(otherRun.get(FAKE_TEAM_RUN_ID), error => error.kind === 'invalid-response')

  // The daily spending cap off is a coded refusal in plain words (the screen links to where it is set).
  const capped = createTeamRunsClient({ request: async () => { throw new GatewayError('http', 409, undefined, 'spending_cap_off') } })
  await assert.rejects(capped.step(base, { roleId: 'reviewer', handoffId: 'plan_review', reviewed: true }), error => error instanceof TeamRunError && error.code === 'spending_cap_off' && /daily spending cap is off/.test(error.message))
  const unreadable = createTeamRunsClient({ request: async () => { throw new GatewayError('dependency', 503, undefined, 'spending_cap_unavailable') } })
  await assert.rejects(unreadable.reconcile(FAKE_TEAM_RUN_ID), error => error.code === 'spending_cap_unavailable')

  // Every state has words, and the states that cannot go on offer nothing to start.
  for (const state of ['held', 'blocked', 'interrupted']) {
    const scenario = { ...base, state, steps: [{ ...base.steps[0], state: state === 'held' ? 'held' : state }] }
    assert.deepEqual(nextRoles(scenario), []); assert.ok(RUN_STATE_WORDS[state]); assert.ok(runSummary(scenario).length > 20)
  }
  assert.match(runSummary({ ...base, state: 'held' }), /Inbox/); assert.match(runSummary({ ...base, state: 'interrupted' }), /only be cancelled/)
  assert.deepEqual(nextRoles({ ...base, steps: [] }).map(item => [item.roleName, item.handoffId]), [['Planner', null]])
  const unmeasured = usageOf({ ...base, modelCalls: [{ ...base.modelCalls[0], state: 'unknown', input_tokens: null, output_tokens: null }] })
  assert.equal(unmeasured.tokens, 0); assert.equal(unmeasured.unknownAnswers, 1)

  // The transport: one run by id, its steps, check and finish; never a list or a start from the browser.
  let requests = 0
  const transport = createGatewayTransport({ origin: 'https://localhost:8050', fetch: async () => { requests++; return new Response('{}', { headers: { 'content-type': 'application/json' } }) } })
  const csrfToken = 'x'.repeat(43), id = `/api/control/pi/team-runs/${FAKE_TEAM_RUN_ID}`
  await transport.request(id)
  for (const action of ['steps', 'reconcile', 'finish']) await transport.request(`${id}/${action}`, { method: 'POST', csrfToken, body: {} })
  assert.equal(requests, 4)
  await assert.rejects(transport.request('/api/control/pi/team-runs'), error => error.kind === 'validation')
  await assert.rejects(transport.request(`/api/control/pi/team-runs/from-team/team_${'a'.repeat(32)}`, { method: 'POST', csrfToken, body: {} }), error => error.kind === 'validation')
  await assert.rejects(transport.request(`${id}/steps`), error => error.kind === 'validation')
  await assert.rejects(transport.request(`${id}/delete`, { method: 'POST', csrfToken, body: {} }), error => error.kind === 'validation')

  // Pi's refusal code survives the transport on the run routes, and nothing else of its text.
  const refused = createGatewayTransport({ origin: 'https://localhost:8050', fetch: async () => new Response(JSON.stringify({ detail: { code: 'spending_cap_off', message: 'secret words' } }), { status: 409, headers: { 'content-type': 'application/json' } }) })
  await assert.rejects(refused.request(`${id}/steps`, { method: 'POST', csrfToken, body: {} }), error => error.status === 409 && error.code === 'spending_cap_off' && !/secret/.test(error.message))

  const ui = fs.readFileSync(path.join(root, 'src/components/gateway/team-runs.tsx'), 'utf8')
  assert.match(ui, /Conker keeps no list of runs/); assert.match(ui, /to="\/settings\?group=money"/); assert.match(ui, /Nothing runs unless you start it here/)
  assert.doesNotMatch(ui, /teamrun_[0-9a-f]{32}/, 'no run id is baked into the screen')
  console.log('Gateway team runs passed: strict reads, exact step and finish bodies, plain refusals, per-state next steps, and a transport that never lists or starts a run.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
