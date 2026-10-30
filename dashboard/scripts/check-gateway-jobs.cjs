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
const { createGatewayTransport, GatewayError, needsNoPassword } = load('src/lib/gateway/transport.ts')
const jobId = `job_${'a'.repeat(32)}`, runId = `scheduled_${'b'.repeat(32)}`
const job = {
  schemaVersion: 1, id: jobId, revision: 3, createdAt: 1, nextAt: 2,
  definition: { name: 'Daily brief', instructionsConfigured: true, agentId: 'companion', timing: { kind: 'daily', time: '07:30', day: 0, hours: 24 }, timeZone: 'UTC', enabled: true, state: 'enabled', target: { kind: 'tool', id: 'calendar.read', publishedVersion: 2, digest: 'c'.repeat(64), inputsConfigured: true }, overlap: 'skip', requireBudget: false, budgetAllowanceConfigured: false },
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
  result = { ...job, definition: { ...job.definition, instructions: 'Tell me what today holds.' } }; assert.equal((await client.get(jobId)).definition.instructions, 'Tell me what today holds.', 'A job page can show its own words')
  result = { ...job, definition: { ...job.definition, instructions: 'x'.repeat(4001) } }; await assert.rejects(client.get(jobId), error => error.kind === 'invalid-response', 'Instructions stay within what Pi stores')
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

  // AI jobs: the agent carries out the owner's instructions; the browser creates these only.
  const session = `ses_${'c'.repeat(16)}`, noteId = `note_${'d'.repeat(32)}`
  const aiJob = { ...job, definition: { ...job.definition, timing: { kind: 'weekly', time: '21:00', day: 0, hours: 24 }, target: { kind: 'agent', sessionId: session } } }
  const agentCalls = []
  let agentReply = aiJob
  const agents = createGatewayJobsClient({ request: async (...args) => { agentCalls.push(args); return structuredClone(agentReply) } })
  assert.equal((await agents.get(jobId)).definition.target.kind, 'agent', 'An AI job parses with its chat')
  agentReply = { ...aiJob, definition: { ...aiJob.definition, target: { kind: 'agent', sessionId: session, args: {} } } }
  await assert.rejects(agents.get(jobId), error => error.kind === 'invalid-response', 'An AI job never carries raw tool inputs')
  agentReply = aiJob
  const created = await agents.createAgentJob({ name: 'Weekly life review', instructions: 'Look at my week.', timing: { kind: 'weekly', time: '21:00', day: 0, hours: 24 }, timeZone: 'Asia/Jerusalem' })
  assert.equal(created.id, jobId)
  assert.deepEqual(agentCalls.at(-1)[0], '/api/control/pi/jobs/agent')
  assert.equal(agentCalls.at(-1)[1].method, 'POST')
  await assert.rejects(agents.createAgentJob({ name: ' ', instructions: 'x', timing: { kind: 'interval', time: '00:00', day: 0, hours: 2 }, timeZone: 'UTC' }), error => error.kind === 'validation')
  agentReply = { schemaVersion: 1, results: [{ id: noteId, jobId, sessionId: session, messageId: null, title: 'Physics exam on Thursday', detail: 'I can make notes.', createdAt: 1 }] }
  assert.equal((await agents.agentNotes())[0].title, 'Physics exam on Thursday')
  agentReply = { schemaVersion: 1, results: [{ id: noteId, jobId, sessionId: session, messageId: null, title: '', detail: '', createdAt: 1 }] }
  await assert.rejects(agents.agentNotes(), error => error.kind === 'invalid-response', 'A note always says what needs the owner')
  agentReply = { id: noteId, dismissed: true, changed: true }
  assert.equal((await agents.dismissNote(noteId)).dismissed, true)
  await assert.rejects(agents.dismissNote('note_bad'), error => error.kind === 'validation')
  let agentRequests = 0
  const agentTransport = createGatewayTransport({ origin: 'https://localhost:8050', fetch: async () => { agentRequests++; return new Response(JSON.stringify(aiJob), { headers: { 'content-type': 'application/json' } }) } })
  await agentTransport.request('/api/control/pi/jobs/agent/notes')
  await agentTransport.request(`/api/control/pi/jobs/agent/notes/${noteId}/dismiss`, { method: 'POST', csrfToken: 'x'.repeat(43), body: {} })
  await assert.rejects(agentTransport.request('/api/control/pi/jobs', { method: 'POST', csrfToken: 'x'.repeat(43), body: {} }), error => error.kind === 'validation', 'The browser never creates raw tool jobs')
  assert.equal(agentRequests, 2)

  // A watched AI job starts when a get tool has something new; the view never carries the inputs.
  agentReply = { ...aiJob, definition: { ...aiJob.definition, watch: { toolId: 'mcp.telegram.messages', everyMinutes: 5, inputsConfigured: true, lastCheckedAt: null, problem: 'needs_approval' } } }
  assert.equal((await agents.get(jobId)).definition.watch.problem, 'needs_approval')
  agentReply = { ...aiJob, definition: { ...aiJob.definition, watch: { toolId: 'mcp.telegram.messages', everyMinutes: 5, inputsConfigured: true, lastCheckedAt: null, problem: null, args: { chat: 'x' } } } }
  await assert.rejects(agents.get(jobId), error => error.kind === 'invalid-response', 'A watch summary never carries its inputs')
  agentReply = aiJob
  await agents.createAgentJob({ name: 'Study group', instructions: 'Tell me what the group needs.', timing: { kind: 'interval', time: '00:00', day: 0, hours: 24 }, timeZone: 'UTC', watch: { toolId: 'mcp.telegram.messages', args: { chat: 'study group' }, everyMinutes: 5 } })
  assert.deepEqual(agentCalls.at(-1)[1].body.watch, { toolId: 'mcp.telegram.messages', args: { chat: 'study group' }, everyMinutes: 5 })
  await assert.rejects(agents.createAgentJob({ name: 'x', instructions: 'y', timing: { kind: 'interval', time: '00:00', day: 0, hours: 24 }, timeZone: 'UTC', watch: { toolId: 'mcp.telegram.messages', args: {}, everyMinutes: 1 } }), error => error.kind === 'validation', 'Watches look at most every five minutes')

  // Webhooks: the secret comes back once, in a strict shape; the browser never sends it anywhere.
  agentReply = { jobId, token: `hook_${'Q'.repeat(43)}`, header: 'X-Conker-Hook-Token', path: `/hooks/${jobId}` }
  assert.equal((await agents.issueHook(jobId)).header, 'X-Conker-Hook-Token')
  assert.deepEqual(agentCalls.at(-1)[0], `/api/control/pi/jobs/${jobId}/hook`)
  agentReply = { jobId, token: 'short', header: 'X-Conker-Hook-Token', path: `/hooks/${jobId}` }
  await assert.rejects(agents.issueHook(jobId), error => error.kind === 'invalid-response')
  agentReply = { jobId, revoked: true }
  assert.equal((await agents.revokeHook(jobId)).revoked, true)
  agentReply = { ...aiJob, definition: { ...aiJob.definition, target: { kind: 'agent', sessionId: session, webhook: true, clock: false } } }
  assert.equal((await agents.get(jobId)).definition.target.clock, false, 'A job can start only from its webhook')
  const hookTransport = createGatewayTransport({ origin: 'https://localhost:8050', fetch: async () => new Response(JSON.stringify({ jobId, revoked: true }), { headers: { 'content-type': 'application/json' } }) })
  await hookTransport.request(`/api/control/pi/jobs/${jobId}/hook/revoke`, { method: 'POST', csrfToken: 'x'.repeat(43), body: {} })
  await assert.rejects(hookTransport.request(`/api/control/pi/jobs/${jobId}/hook/rotate`, { method: 'POST', csrfToken: 'x'.repeat(43), body: {} }), error => error.kind === 'validation')

  // Make this job mine: strict shape, exact route and body, a changed revision is a conflict, never a silent success.
  const madeByConker = { ...aiJob, definition: { ...aiJob.definition, createdBy: 'conker', adoptedAt: null, turnedOff: 'chat_forgotten', enabled: false, state: 'paused' } }
  agentReply = madeByConker; assert.equal((await agents.get(jobId)).definition.adoptedAt, null, 'adoptedAt may be null')
  agentReply = { ...madeByConker, definition: { ...madeByConker.definition, createdBy: 'owner', adoptedAt: '2026-10-30T09:15:00+00:00', turnedOff: null } }
  assert.equal((await agents.adoptJob(jobId, 3)).definition.adoptedAt, '2026-10-30T09:15:00+00:00')
  assert.deepEqual(agentCalls.at(-1)[0], `/api/control/pi/jobs/${jobId}/adopt`)
  assert.deepEqual(agentCalls.at(-1)[1], { method: 'POST', body: { expected_revision: 3 } })
  agentReply = { ...madeByConker, definition: { ...madeByConker.definition, adoptedAt: 'yesterday' } }
  await assert.rejects(agents.get(jobId), error => error.kind === 'invalid-response', 'adoptedAt is an ISO time')
  await assert.rejects(agents.adoptJob(jobId, 0), error => error.kind === 'validation')
  await assert.rejects(agents.adoptJob('job_bad', 3), error => error.kind === 'validation')
  await assert.rejects(conflict.adoptJob(jobId, 3), error => error instanceof GatewayJobMutationError && error.outcome === 'conflict', 'A changed revision is a conflict')
  await assert.rejects(uncertain.adoptJob(jobId, 3), error => error instanceof GatewayJobMutationError && error.outcome === 'unknown')
  const adoptTransport = createGatewayTransport({ origin: 'https://localhost:8050', fetch: async () => new Response(JSON.stringify(aiJob), { headers: { 'content-type': 'application/json' } }) })
  await adoptTransport.request(`/api/control/pi/jobs/${jobId}/adopt`, { method: 'POST', csrfToken: 'x'.repeat(43), body: { expected_revision: 3 } })
  assert.match(fs.readFileSync(path.join(root, 'src/lib/gateway/verification.ts'), 'utf8'), /title: 'Make this job yours'/, 'The password prompt says what it is for')
  assert.equal(needsNoPassword(`/api/control/pi/jobs/${jobId}/adopt`, { expected_revision: 3 }), false, 'Adopting asks for the password')

  const ui = fs.readFileSync(path.join(root, 'src/components/gateway/jobs-workspace.tsx'), 'utf8')
  assert.match(ui, /Queued is not finished: Run history shows the result/, 'Run now never claims the run finished')
  assert.match(ui, /Try again resends the same request, so it can’t run twice/, 'An unknown outcome retries with the same request identity')
  assert.match(ui, /Inputs and results stay on your server/, 'Receipts and inputs are not shown in the browser')
  assert.match(ui, /What it does/, 'A job page shows what the job does')
  assert.match(ui, /doesn’t send them to this page yet/, 'A Pi that keeps the instructions to itself is said plainly, not hidden')
  assert.match(ui, /type="button"[^>]*onClick=\{\(\) => void makeMine\(\)\}[^>]*>\{adopting \? 'Making it yours…' : 'Make this job mine'\}/, 'A secondary button, with a sending state')
  assert.match(ui, /job\.definition\.createdBy === 'conker' && <><Button type="button"/, 'Only jobs Conker made offer it')
  assert.match(ui, /It can be turned back on after/, 'A job turned off with its chat says it can be turned on after')
  assert.match(ui, /cause\.outcome === 'conflict'[\s\S]*control\.jobs\.get\(job\.id\)[\s\S]*nothing was changed/, 'A changed job is reloaded and said so')
  assert.match(ui, /Could not make it yours: /, 'A failure says why')
  assert.match(ui, /'Conker' : 'you'/, 'Made by becomes you once adopted')
  assert.ok(ui.indexOf('await control.jobs.adoptJob') < ui.indexOf('This job is yours now'), 'Success is only said after the server answers')
  assert.ok(ui.indexOf('await control.jobs.adoptJob') < ui.indexOf('This job is yours now') && /role=\{adoptNote\.ok \? 'status' : 'alert'\}/.test(ui), 'Success is only said after the server answers')
  console.log('Gateway Jobs passed: redacted DTOs, exact routes, durable manual admission, recovery controls, and no browser authoring of raw targets.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
