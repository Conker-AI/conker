const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const root = path.resolve(__dirname, '..'), cache = new Map()
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports
  const module = { exports: {} }; cache.set(relative, module)
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'module', 'exports', code)(request => {
    if (['react', 'react/jsx-runtime', 'zustand', 'zustand/vanilla', 'zod'].includes(request)) return require(request)
    if (request === '@/components/ui/button') return { Button: ({ children }) => React.createElement('button', null, children) }
    const base = request.startsWith('@/') ? `src/${request.slice(2)}` : path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))
    assert.ok(request.startsWith('.') || request.startsWith('@/'), request)
    return load(base + (fs.existsSync(path.join(root, base + '.tsx')) ? '.tsx' : '.ts'))
  }, module, module.exports)
  return module.exports
}
const { createGatewayTurnUsageClient, parseTurnUsage, usageFields } = load('src/lib/gateway/turn-usage.ts')
const { createGatewayRuntimeClient } = load('src/lib/gateway/runtime.ts')
const { createGatewayTransport, GatewayError } = load('src/lib/gateway/transport.ts')
const { startTurnUsageRead } = load('src/components/gateway/turn-usage-read.ts')
const { TurnUsageReport } = load('src/components/gateway/turn-usage-content.tsx')
const { TurnUsageDisclosure } = load('src/components/gateway/turn-usage-disclosure.tsx')
const { createGatewaySourcePrivacyState } = load('src/components/gateway/source-privacy.ts')
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
function call(patch = {}) {
  return { id: 'call_one', lane: 'foreground', role: 'answer', provider_id: 'configured-provider', model_id: 'configured-model', provider: 'requested-adapter', model: 'requested-route', actual_provider: 'actual-provider', actual_model: 'actual-model', status: 'reported', failure_kind: null, started_at: 100, ended_at: 101, elapsed_ms: 1000, input_tokens: 300, output_tokens: 20, cached_tokens: null, cost_usd: null, ...patch }
}
function wire(attempts = [call()], coverage = 'complete') {
  function lane(name) {
    const rows = attempts.filter(row => row.lane === name)
    const values = usageFields.map(field => {
      const observed = rows.map(row => field === 'summed_call_ms' ? row.elapsed_ms : row[field])
      const missing = observed.filter(value => value === null).length
      const known = observed.reduce((sum, value) => sum + (value ?? 0), 0), complete = coverage === 'complete' && missing === 0
      return { field, missing, known, complete }
    })
    return { attempt_count: rows.length, pending_count: rows.filter(row => row.status === 'pending').length, reported_count: rows.filter(row => row.status === 'reported').length, failed_count: rows.filter(row => row.status === 'failed').length,
      totals: Object.fromEntries(values.map(row => [row.field, row.complete ? row.known : null])), known_subtotal: Object.fromEntries(values.map(row => [row.field, row.known])), complete: Object.fromEntries(values.map(row => [row.field, row.complete])), unknown_counts: Object.fromEntries(values.map(row => [row.field, row.missing])) }
  }
  return { schemaVersion: 1, turn_id: 'turn_one', session_id: 'session_one', content_status: 'available', scope: 'turn_provider_attempts', coverage, foreground: lane('foreground'), thinking: lane('thinking'), attempts, attempts_truncated: false }
}
const parse = value => parseTurnUsage(value, 'turn_one', 'session_one')
const render = value => renderToStaticMarkup(React.createElement(TurnUsageReport, { usage: parse(value) })).replace(/<[^>]*>/g, '')
async function main() {
  if (process.argv[2]) {
    const backend = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
    const checked = parseTurnUsage(backend, backend.turn_id, backend.session_id)
    assert.ok(checked.foreground.attempt_count > 0 && checked.thinking.attempt_count > 0)
    console.log('Actual isolated Pi serialization accepted by the frontend parser for both lanes')
  }
  const valid = wire(), parsed = parse(valid)
  assert.equal(parsed.foreground.totals.input_tokens, 300)
  assert.equal(parsed.foreground.totals.cost_usd, null)
  assert.equal(parsed.foreground.known_subtotal.cost_usd, 0)
  const complete = render(valid)
  assert.ok(complete.includes('Input tokens · total') && complete.includes('300'))
  assert.ok(complete.includes('Not reported') && !complete.includes('$0'), 'Missing cost is not a zero price')
  assert.ok(complete.includes('No recorded calls') && complete.includes('which may overlap'))
  assert.ok(complete.includes('Configured provider / model') && complete.includes('configured-model') && complete.includes('Requested adapter / route') && complete.includes('requested-route') && complete.includes('Reported provider / model') && complete.includes('actual-model'))
  const partial = wire([call({ cost_usd: 0, cached_tokens: 0 }), call({ id: 'call_two', started_at: 102, ended_at: null, status: 'pending', elapsed_ms: null, input_tokens: null, output_tokens: null })])
  assert.ok(render(partial).includes('known subtotal') && render(partial).includes('$0.00'), 'An explicitly reported zero remains known evidence')
  assert.ok(render(partial).includes('Outcome unrecorded') && render(partial).includes('awaiting report') && render(partial).includes('Result reported') && !render(partial).includes('Completed'), 'Call accounting does not assert a live worker or a published answer')
  const legacy = wire([call()], 'legacy_partial')
  assert.equal(parse(legacy).foreground.totals.input_tokens, null)
  assert.ok(render(legacy).includes('Older work has incomplete call records') && render(legacy).includes('Input tokens · known subtotal'))
  const overflow = wire([call({ cost_usd: 1e308 })])
  overflow.foreground.known_subtotal.cost_usd = null; overflow.foreground.totals.cost_usd = null; overflow.foreground.complete.cost_usd = false
  assert.ok(render(overflow).includes('Unavailable') && render(overflow).includes('Recorded values exceed display limits'), 'An unrepresentable aggregate must not display as zero or unreported')
  overflow.foreground.complete.cost_usd = true
  assert.throws(() => parse(overflow), error => error.kind === 'invalid-response')
  const thinking = wire([call(), call({ id: 'call_two', lane: 'thinking', role: 'thinking', status: 'failed', failure_kind: 'preempted', elapsed_ms: 2400, input_tokens: null, output_tokens: null })])
  assert.ok(render(thinking).includes('Yielded capacity') && render(thinking).includes('2.4 s'))
  assert.equal(parse(thinking).foreground.totals.summed_call_ms, 1000, 'Background time stays out of conversation total')
  for (const change of [
    value => { value.turn_id = 'foreign' }, value => { value.session_id = 'foreign' }, value => { value.content_status = 'forgotten' },
    value => { value.attempts[0].input_tokens = -1 }, value => { value.attempts[0].elapsed_ms = 0.2 }, value => { value.attempts[0].cost_usd = Infinity },
    value => { value.attempts[0].role = 'raw-provider-secret' }, value => { value.attempts[0].failure_kind = 'raw exception text' },
    value => { value.foreground.totals.cost_usd = 0 }, value => { value.foreground.unknown_counts.input_tokens = 2 },
    value => { value.foreground.complete.cost_usd = true }, value => { value.coverage = 'legacy_partial' },
    value => { value.attempts.push(value.attempts[0]) }, value => { value.attempts = [] },
  ]) { const value = structuredClone(valid); change(value); assert.throws(() => parse(value), error => error.kind === 'invalid-response') }
  assert.equal(parse(wire([call({ actual_model: '😀'.repeat(300) })])).attempts[0].actual_model.length, 600)
  const truncated = wire(Array.from({ length: 101 }, (_, i) => call({ id: `call_${String(i).padStart(3, '0')}`, started_at: i + 100 })))
  truncated.attempts = truncated.attempts.slice(-100); truncated.attempts_truncated = true
  assert.ok(render(truncated).includes('latest 100 calls') && render(truncated).includes('101 recorded calls'))

  const requests = [], transport = createGatewayTransport({ origin: 'https://usage.test', fetch: async (url, options) => { requests.push([url, options]); return new Response(JSON.stringify(valid), { headers: { 'Content-Type': 'application/json' } }) } })
  const api = createGatewayTurnUsageClient({ request: (route, options) => transport.request(route, options) })
  await api.get('turn_one', 'session_one')
  assert.equal(requests[0][0], 'https://usage.test/api/pi/turns/turn_one/usage')
  await assert.rejects(api.get('../owner', 'session_one'), error => error.kind === 'validation')
  await assert.rejects(transport.request('/api/pi/turns/turn_one/usage', { query: { include: 'text' } }), error => error.kind === 'validation')
  await assert.rejects(transport.request('/api/pi/turns/turn_one/usage', { method: 'POST', body: {}, csrfToken: 'c'.repeat(32) }), error => error.kind === 'validation')
  const canceled = new AbortController(); canceled.abort()
  await assert.rejects(api.get('turn_one', 'session_one', { signal: canceled.signal }), error => error.kind === 'aborted')
  assert.equal(requests.length, 1, 'Invalid or canceled reads never reach fetch')
  assert.equal((await createGatewayRuntimeClient({ request: async () => valid }).getTurnUsage('turn_one', 'session_one')).turn_id, 'turn_one', 'Runtime lazy client uses exact receipt parser')

  let fetching = 0
  const sourcePrivacy = createGatewaySourcePrivacyState(), client = { getTurnUsage: async () => { fetching++; return parsed } }
  const closed = renderToStaticMarkup(React.createElement(TurnUsageDisclosure, { client, turnId: 'turn_one', sessionId: 'session_one', sourcePrivacy }))
  assert.ok(closed.includes('Calls &amp; usage') && !closed.includes('Loading usage'))
  assert.equal(fetching, 0, 'Closed disclosure never fetches or renders a read')
  const forgottenPrivacy = require('zustand/vanilla').createStore(() => ({ sessionIds: ['session_one'] }))
  assert.equal(renderToStaticMarkup(React.createElement(TurnUsageDisclosure, { client, turnId: 'turn_one', sessionId: 'session_one', sourcePrivacy: forgottenPrivacy })), '')
  for (const reason of ['closed', 'forgotten']) {
    const response = deferred(), results = []; let available = true, signal
    const request = startTurnUsageRead({ getTurnUsage: (_, __, options) => { signal = options.signal; return response.promise } }, 'turn_one', 'session_one', () => available, result => results.push(result))
    await Promise.resolve()
    if (reason === 'closed') request.cancel(); else available = false
    response.resolve(parsed); await request.done
    assert.deepEqual(results.map(row => row.status), ['loading'], `${reason} must fence late private data`)
    if (reason === 'closed') assert.equal(signal.aborted, true)
  }
  for (const failure of [new GatewayError('http', 404), new GatewayError('session-changed'), new GatewayError('network')]) {
    const results = [], request = startTurnUsageRead({ getTurnUsage: async () => { throw failure } }, 'turn_one', 'session_one', () => true, result => results.push(result))
    await request.done
    assert.equal(results[1].status, 'error'); assert.equal(results[1].unavailable, failure.status === 404)
    assert.ok(!JSON.stringify(results).includes('actual-model'), 'Failed auth or missing source cannot retain a previous receipt')
  }
  console.log('Turn usage: strict receipts, complete/partial/unknown metrics, identities, lazy transport and privacy/cancel recovery checks passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
