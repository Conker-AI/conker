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
  new Function('require', 'module', 'exports', code)(request => request === 'zod' ? require('zod') :
    load(`${path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))}.ts`), module, module.exports)
  return module.exports
}

const { createGatewayJobsClient, GatewayJobMutationError } = load('src/lib/gateway/jobs.ts')
const { createGatewayTransport, GatewayError } = load('src/lib/gateway/transport.ts')
const jobId = `job_${'a'.repeat(32)}`, runId = `scheduled_${'b'.repeat(32)}`
const job = {
  schemaVersion: 1, id: jobId, revision: 3, createdAt: 1, nextAt: 2,
  definition: { name: 'Daily brief', instructions: 'Prepare the pinned brief.', agentId: 'companion', timing: { kind: 'daily', time: '07:30', day: 0, hours: 24 }, timeZone: 'UTC', enabled: true, state: 'enabled', target: { kind: 'tool', id: 'calendar.read', publishedVersion: 2, digest: 'c'.repeat(64), inputsConfigured: true }, overlap: 'skip', requireBudget: false, budgetAllowanceConfigured: false },
  authority: 'none', contentIncluded: false, execution: 'not-triggered',
}
const run = { schemaVersion: 1, id: runId, jobId, jobRevision: 3, scheduledAt: 2, startedAt: 2, status: 'ready', manual: true, budgetBound: false, receiptRecorded: false, outcomeCode: null, authority: 'none', contentIncluded: false, execution: 'admitted-only' }

async function main() {
  const calls = []
  let result = { schemaVersion: 1, results: [job], nextCursor: null }
  const client = createGatewayJobsClient({ request: async (...args) => { calls.push(args); return structuredClone(result) } })
  assert.deepEqual((await client.list()).results, [job])
  assert.deepEqual(calls.pop(), ['/api/control/pi/jobs', { query: { limit: 100 }, signal: undefined }])
  result = job; assert.equal((await client.get(jobId)).id, jobId)
  await client.setEnabled(jobId, false, 3); assert.equal(calls.pop()[0], `/api/control/pi/jobs/${jobId}/state`)
  result = { ...run, replayed: false }; assert.equal((await client.runNow(jobId, 'browser:1234567890abcdef')).replayed, false)
  result = { schemaVersion: 1, results: [run], nextCursor: null }; assert.deepEqual((await client.runs(jobId)).results, [run])
  result = run; await client.provisionBudget(runId); await client.resume(runId); await client.reconcile(runId)
  result = { ...run, replayed: false }; await client.cancel(runId)
  result = { ...job, authority: 'execute' }; await assert.rejects(client.get(jobId), error => error.kind === 'invalid-response')
  result = { ...job, definition: { ...job.definition, target: { ...job.definition.target, args: { secret: true } } } }; await assert.rejects(client.get(jobId), error => error.kind === 'invalid-response')
  const conflict = createGatewayJobsClient({ request: async () => { throw new GatewayError('http', 409) } })
  await assert.rejects(conflict.setEnabled(jobId, false, 3), error => error instanceof GatewayJobMutationError && error.outcome === 'conflict')
  const uncertain = createGatewayJobsClient({ request: async () => { throw new GatewayError('network') } })
  await assert.rejects(uncertain.runNow(jobId, 'browser:1234567890abcdef'), error => error instanceof GatewayJobMutationError && error.outcome === 'unknown')

  let requests = 0
  const transport = createGatewayTransport({ origin: 'https://localhost:8050', fetch: async () => { requests++; return new Response(JSON.stringify(job), { headers: { 'content-type': 'application/json' } }) } })
  await transport.request('/api/control/pi/jobs')
  await transport.request(`/api/control/pi/jobs/${jobId}`)
  await transport.request(`/api/control/pi/jobs/${jobId}/runs`)
  await transport.request(`/api/control/pi/jobs/${jobId}/state`, { method: 'POST', csrfToken: 'x'.repeat(43), body: { expected_revision: 3, enabled: false } })
  await transport.request(`/api/control/pi/jobs/runs/${runId}/cancel`, { method: 'POST', csrfToken: 'x'.repeat(43), body: {} })
  await assert.rejects(transport.request('/api/control/pi/jobs', { method: 'POST', csrfToken: 'x'.repeat(43), body: {} }), error => error.kind === 'validation')
  await assert.rejects(transport.request(`/api/control/pi/jobs/${jobId}/update`, { method: 'POST', csrfToken: 'x'.repeat(43), body: {} }), error => error.kind === 'validation')
  await assert.rejects(transport.request(`/api/control/pi/jobs/runs/${runId}/budget`, { method: 'POST', csrfToken: 'x'.repeat(43), body: {} }), error => error.kind === 'validation')
  assert.equal(requests, 5)

  const ui = fs.readFileSync(path.join(root, 'src/components/gateway/jobs-workspace.tsx'), 'utf8')
  assert.match(ui, /A successful admission is not a claim that execution completed/)
  assert.match(ui, /retrying uses the same durable request identity/)
  assert.match(ui, /Receipts and inputs stay server-side/)
  console.log('Gateway Jobs passed: redacted DTOs, exact routes, durable manual admission, recovery controls, and no browser authoring of raw targets.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
