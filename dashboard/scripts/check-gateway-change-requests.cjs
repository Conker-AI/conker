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
    load(request.startsWith('@/') ? `src/${request.slice(2)}.ts` : `${path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))}.ts`), module, module.exports)
  return module.exports
}

const { createChangeRequestsClient } = load('src/lib/gateway/change-requests.ts')
const { createGatewayTransport, isConversationWrite } = load('src/lib/gateway/transport.ts')
const id = `creq_${'a'.repeat(32)}`, base = `/api/control/pi/change-requests/${id}`
const job = {
  id, kind: 'ai_job', title: 'Cron job: Morning check', summary: 'Every day at 08:00.', sessionId: `ses_${'b'.repeat(16)}`, state: 'open', result: null, createdAt: 1, decidedAt: null,
  payload: { name: 'Morning check', instructions: 'Tell me what needs me today.', agentId: 'companion', timing: { kind: 'daily', time: '08:00', day: 0, hours: 24 }, timeZone: 'UTC', enabled: true },
}
const draft = { ...job, kind: 'tool_draft', title: 'Tool: Digest', payload: { document: { id: 'digest', nodes: [] }, issues: [], description: 'A digest' } }
const memory = { ...job, kind: 'memory', title: 'Remember: exam', payload: { text: 'The exam is on Thursday.' } }

async function main() {
  const calls = []
  let reply = { schemaVersion: 1, results: [job, draft, memory] }
  const client = createChangeRequestsClient({ request: async (...args) => { calls.push(args); return structuredClone(reply) } })
  assert.deepEqual((await client.list()).map(item => item.kind), ['ai_job', 'tool_draft', 'memory'])
  reply = { schemaVersion: 1, results: [{ ...job, kind: 'grant_access' }] }
  await assert.rejects(client.list(), error => error.kind === 'invalid-response', 'Only the three kinds Conker may ask for are shown')
  reply = { schemaVersion: 1, results: [{ ...memory, payload: { text: 'x', memoryId: 'm1' } }] }
  await assert.rejects(client.list(), error => error.kind === 'invalid-response', 'A memory request is exactly its text')

  reply = { ...job, state: 'approved', result: { jobId: `job_${'c'.repeat(32)}` }, decidedAt: 2 }
  await client.approve(id)
  assert.deepEqual(calls.at(-1), [`${base}/approve`, { method: 'POST', body: {} }], 'Approving sends nothing but the decision')
  reply = { ...draft, state: 'approved', result: { draftId: 'digest' }, decidedAt: 2 }
  await client.saved(id, 'digest')
  assert.deepEqual(calls.at(-1), [`${base}/saved`, { method: 'POST', body: { draftId: 'digest' } }])
  await assert.rejects(client.saved(id, '../digest'), error => error.kind === 'validation')
  await assert.rejects(client.approve('creq_bad'), error => error.kind === 'validation')
  reply = { ...job, state: 'declined', decidedAt: 2 }
  await client.decline(id)
  assert.deepEqual(calls.at(-1), [`${base}/decline`, { method: 'POST', body: {} }])
  await client.decline(id, '  Make it weekly instead ')
  assert.deepEqual(calls.at(-1), [`${base}/decline`, { method: 'POST', body: { reply: 'Make it weekly instead' } }], 'Change sends his words with the decline')
  await client.decline(id, '   ')
  assert.deepEqual(calls.at(-1)[1].body, {}, 'Blank words are no Change')

  const { createAsksClient } = load('src/lib/gateway/asks.ts')
  const askId = `ask_${'d'.repeat(32)}`, askBase = `/api/control/pi/asks/${askId}`
  const question = { id: askId, sessionId: `ses_${'b'.repeat(16)}`, chatTitle: 'Plan my week', question: 'Fix the login today?', options: ['Yes, fix it', 'Not now'], state: 'open', answer: null, chosen: null, createdAt: 1, answeredAt: null }
  const asked = []
  let answer = { schemaVersion: 1, results: [question] }
  const asks = createAsksClient({ request: async (...args) => { asked.push(args); return structuredClone(answer) } })
  assert.equal((await asks.list())[0].question, 'Fix the login today?')
  answer = { schemaVersion: 1, results: [{ ...question, options: ['Only one'] }] }
  await assert.rejects(asks.list(), error => error.kind === 'invalid-response', 'A question has 2 to 4 options')
  answer = { ...question, state: 'answered', answer: 'Yes, fix it', chosen: true, answeredAt: 2 }
  await asks.answer(askId, 'Yes, fix it', true)
  assert.deepEqual(asked.at(-1), [`${askBase}/answer`, { method: 'POST', body: { text: 'Yes, fix it', chosen: true } }])
  await assert.rejects(asks.answer(askId, '  ', false), error => error.kind === 'validation', 'A blank answer is never sent')
  answer = { ...question, state: 'dismissed', answeredAt: 2 }
  await asks.dismiss(askId)
  assert.deepEqual(asked.at(-1), [`${askBase}/dismiss`, { method: 'POST', body: {} }])
  await assert.rejects(asks.dismiss('ask_bad'), error => error.kind === 'validation')

  let requests = 0
  const transport = createGatewayTransport({ origin: 'https://localhost:8050', fetch: async () => { requests++; return new Response(JSON.stringify(job), { headers: { 'content-type': 'application/json' } }) } })
  await transport.request('/api/control/pi/change-requests')
  await transport.request(base)
  for (const action of ['decline', 'saved']) await transport.request(`${base}/${action}`, { method: 'POST', csrfToken: 'x'.repeat(43), body: {} })
  await assert.rejects(transport.request(`${base}/edit`, { method: 'POST', csrfToken: 'x'.repeat(43), body: {} }), error => error.kind === 'validation', 'A request is never edited from the browser')
  assert.equal(requests, 4)
  assert.equal(isConversationWrite(`${base}/approve`), false, 'Approving asks for the password')
  assert.equal(isConversationWrite(`${base}/decline`), true, 'Declining creates nothing')
  assert.equal(isConversationWrite(`${base}/saved`), true, 'Recording a draft id follows the password-verified save in Tools')
  assert.equal(isConversationWrite('/api/owner/editor-drafts/digest'), false, 'Saving the draft in Tools asks for the password')
  assert.equal(isConversationWrite(`/api/control/pi/asks/ask_${'d'.repeat(32)}/answer`), true, 'Answering Conker is like typing in that chat')
  assert.equal(isConversationWrite(`/api/control/pi/asks/ask_${'d'.repeat(32)}/dismiss`), true, 'Dismissing a question sends nothing')

  assert.equal(isConversationWrite('/api/control/pi/memory/remember'), false, 'Adding a memory by hand asks for the password too')
  const { createGatewayControlClient } = load('src/lib/gateway/control.ts')
  const remembered = []
  const control = createGatewayControlClient({ request: async (...args) => { remembered.push(args); return { memoryId: 'm1', status: 'remembered' } }, audio: async () => ({}), getSession: () => null }, () => {})
  assert.equal((await control.rememberMemory('add_' + 'a'.repeat(32), 'My exam is on Thursday.')).status, 'remembered')
  assert.deepEqual(remembered.at(-1), ['/api/control/pi/memory/remember', { method: 'POST', body: { request_id: 'add_' + 'a'.repeat(32), text: 'My exam is on Thursday.' }, signal: undefined }])
  await assert.rejects(control.rememberMemory('add_' + 'a'.repeat(32), '   '), error => error.kind === 'validation', 'A blank memory is never sent')
  const hook = fs.readFileSync(path.join(root, 'src/components/inbox/change-requests.ts'), 'utf8')
  assert.ok(hook.indexOf('drafts.save(') < hook.indexOf('client.saved('), 'A tool request is saved in Tools before it is marked approved')
  assert.match(hook, /savedAs\.current\.get\(request\.id\)/, 'Retrying an approval never saves a second draft')
  const card = fs.readFileSync(path.join(root, 'src/components/inbox/change-request-card.tsx'), 'utf8')
  for (const label of ['What it does each run', 'Tools it calls', 'Connections it uses', 'Saved word for word']) assert.ok(card.includes(label), `The card shows: ${label}`)
  for (const file of ['src/components/inbox/reply-box.tsx', 'src/components/inbox/ask-card.tsx', 'src/components/inbox/approval-card.tsx', 'src/components/inbox/change-request-card.tsx']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8')
    assert.ok(!/<Button(?![^>]*type="button")[^>]*onClick/.test(source), `${file}: every clickable button is type="button" (a card can sit inside a form)`)
  }
  console.log('Gateway change requests passed: three kinds only, exact payloads, verified approval, save-then-record tool drafts, and no browser edits.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
