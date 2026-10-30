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

  // A tool request fills in while Conker drafts it; requests filed before that have no status and are ready.
  const { toolDraftStatus, isDrafting, isAsking } = load('src/lib/gateway/change-requests.ts')
  const drafting = { ...draft, payload: { description: 'A digest', status: 'drafting' } }
  const ready = { ...draft, payload: { description: 'A digest', status: 'ready', document: { id: 'digest', nodes: [] }, issues: [{ code: 'missing_tool', message: 'Step read uses a tool you do not have.', nodeId: 'read' }, 'A plain note'], steps: ['Read the chat.', 'List the deadlines.'] } }
  const failed = { ...draft, payload: { description: 'A digest', status: 'failed', error: 'Pi restarted while drafting. Try again.' } }
  reply = { schemaVersion: 1, results: [drafting, ready, failed, draft] }
  const listed = await client.list()
  assert.deepEqual(listed.map(toolDraftStatus), ['drafting', 'ready', 'failed', 'ready'], 'An older request without a status is ready')
  assert.deepEqual(listed.map(isDrafting), [true, false, false, false], 'Only drafting is not yet a decision')
  assert.deepEqual(listed[1].payload.issues, ['Step read uses a tool you do not have.', 'A plain note'], 'Check notes read as plain words, whatever their shape')
  assert.deepEqual(listed[1].payload.steps, ['Read the chat.', 'List the deadlines.'])
  assert.deepEqual(listed[3].payload.steps, [], 'No steps is an empty list, not an error')
  assert.equal(listed[2].payload.error, 'Pi restarted while drafting. Try again.')
  reply = { schemaVersion: 1, results: [{ ...draft, payload: { description: 'A digest', status: 'thinking' } }] }
  await assert.rejects(client.list(), error => error.kind === 'invalid-response', 'An unknown drafting state is not guessed')

  // The drafter asked a question: needs_detail carries it, the chat it was asked in, and (on any status) what was said.
  const asking = { ...draft, payload: { description: 'A digest', status: 'needs_detail', question: 'Which search engine?', askedIn: `ses_${'b'.repeat(16)}`, conversation: [{ role: 'builder', content: 'Which chat?' }, { role: 'owner', content: 'The study group.' }] } }
  reply = { schemaVersion: 1, results: [asking, { ...asking, payload: { description: 'A digest', status: 'needs_detail' } }, { ...asking, payload: { description: 'A digest', status: 'needs_detail', question: null, askedIn: null, conversation: null } }, { ...drafting, payload: { ...drafting.payload, conversation: asking.payload.conversation } }, { ...failed, payload: { ...failed.payload, conversation: [] } }, { ...ready, payload: { ...ready.payload, conversation: asking.payload.conversation } }] }
  const listedAsking = await client.list()
  assert.deepEqual(listedAsking.map(toolDraftStatus), ['needs_detail', 'needs_detail', 'needs_detail', 'drafting', 'failed', 'ready'])
  assert.deepEqual(listedAsking.map(isAsking), [true, true, true, false, false, false], 'Only needs_detail waits for his answer')
  assert.deepEqual(listedAsking.map(isDrafting), [false, false, false, true, false, false], 'A question is for him: it counts as needing him')
  assert.equal(listedAsking[0].payload.question, 'Which search engine?')
  assert.equal(listedAsking[0].payload.askedIn, `ses_${'b'.repeat(16)}`)
  assert.deepEqual(listedAsking[5].payload.conversation.map(turn => turn.role), ['builder', 'owner'], 'The conversation shows on any status')
  for (const bad of [{ question: 5 }, { askedIn: '' }, { conversation: [{ role: 'system', content: 'x' }] }, { conversation: [{ role: 'owner' }] }, { conversation: 'hi' }])
    for (const payload of [{ ...asking.payload, ...bad }, { ...drafting.payload, ...bad }].filter(item => 'conversation' in bad || item.status === 'needs_detail')) {
      reply = { schemaVersion: 1, results: [{ ...asking, payload }] }
      await assert.rejects(client.list(), error => error.kind === 'invalid-response', `Loose types are refused: ${JSON.stringify(bad)}`)
    }

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

  // Try again, Change (new words), a new tool from his own words, and "it is live".
  reply = drafting
  await client.retry(id)
  assert.deepEqual(calls.at(-1), [`${base}/retry`, { method: 'POST', body: {} }], 'Try again sends no words')
  await client.retry(id, '  A digest of the whole week ')
  assert.deepEqual(calls.at(-1), [`${base}/retry`, { method: 'POST', body: { description: 'A digest of the whole week' } }], 'Change sends his new words')
  await assert.rejects(client.retry(id, '  '), error => error.kind === 'validation', 'Blank words are never sent')
  // The answer goes to the same retry route as `answer`, never with `description`; blank or oversized text is never sent.
  reply = { ...asking, payload: { ...drafting.payload, conversation: asking.payload.conversation } }
  assert.equal(toolDraftStatus(await client.answer(id, '  DuckDuckGo, and read the pages. ')), 'drafting', 'Pi answers with the card drafting again')
  assert.deepEqual(calls.at(-1), [`${base}/retry`, { method: 'POST', body: { answer: 'DuckDuckGo, and read the pages.' } }])
  await assert.rejects(client.answer(id, '   '), error => error.kind === 'validation')
  await assert.rejects(client.answer(id, 'x'.repeat(4001)), error => error.kind === 'validation')
  await assert.rejects(client.answer('creq_bad', 'yes'), error => error.kind === 'validation')
  await client.draft(' Sum up my study chat ', 'tooldraft_' + 'e'.repeat(32))
  assert.deepEqual(calls.at(-1), ['/api/control/pi/tool-drafts', { method: 'POST', body: { description: 'Sum up my study chat', request_id: 'tooldraft_' + 'e'.repeat(32) } }])
  await assert.rejects(client.draft('x'.repeat(4001), 'tooldraft_' + 'e'.repeat(32)), error => error.kind === 'validation', 'At most 4000 characters')
  await assert.rejects(client.draft('Sum up', 'short'), error => error.kind === 'validation', 'A submission id Pi can make idempotent')
  reply = { ...job, state: 'approved' }
  await assert.rejects(client.draft('Sum up my study chat', 'tooldraft_' + 'e'.repeat(32)), error => error.kind === 'invalid-response', 'A new tool request answers with a tool request')
  reply = { ...ready, state: 'approved', result: { draftId: 'digest' } }
  assert.equal((await client.published(id, 'editor-' + 'f'.repeat(32), 'Digest')).id, id)
  assert.deepEqual(calls.at(-1), [`${base}/published`, { method: 'POST', body: { toolId: 'editor-' + 'f'.repeat(32), name: 'Digest' } }])
  reply = { recorded: true }
  assert.equal(await client.published(id, 'editor-' + 'f'.repeat(32), 'Digest'), null, 'Any answer records it; only a request answer is read')
  await assert.rejects(client.published(id, '', 'Digest'), error => error.kind === 'validation')

  // Which request a draft came from survives leaving the editor, in this browser only.
  const store = new Map()
  globalThis.localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) }
  const { rememberDraftOrigin, draftOrigin, forgetDraftOrigin } = load('src/lib/tool-draft-origin.ts')
  rememberDraftOrigin('digest', id)
  assert.equal(draftOrigin('digest'), id)
  assert.equal(draftOrigin('digest', `creq_${'9'.repeat(32)}`), `creq_${'9'.repeat(32)}`, 'The address wins')
  assert.equal(draftOrigin('digest', '../x'), id, 'A malformed address is ignored')
  forgetDraftOrigin('digest')
  assert.equal(draftOrigin('digest'), null)
  store.set('conker.tool-draft-origins', '{broken')
  assert.equal(draftOrigin('digest'), null, 'Broken storage reads as nothing')
  globalThis.localStorage = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
  assert.doesNotThrow(() => rememberDraftOrigin('digest', id), 'Blocked storage never breaks Review')
  delete globalThis.localStorage

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
  for (const action of ['decline', 'saved', 'retry', 'published']) await transport.request(`${base}/${action}`, { method: 'POST', csrfToken: 'x'.repeat(43), body: {} })
  await transport.request('/api/control/pi/tool-drafts', { method: 'POST', csrfToken: 'x'.repeat(43), body: {} })
  await assert.rejects(transport.request(`${base}/edit`, { method: 'POST', csrfToken: 'x'.repeat(43), body: {} }), error => error.kind === 'validation', 'A request is never edited from the browser')
  assert.equal(requests, 7)
  for (const route of [`${base}/retry`, `${base}/published`, '/api/control/pi/tool-drafts']) assert.equal(isConversationWrite(route), true, `${route} creates nothing real: no password`)
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
  assert.match(hook, /DRAFTING_POLL_MS = \d+/, 'A drafting card fills in by itself')
  assert.match(hook, /setInterval\(\(\) => \{ if \(document\.visibilityState === 'visible'\) void load\(\) \}, DRAFTING_POLL_MS\)/, 'It reads again only while the page is in view')
  assert.ok(hook.indexOf('navigate(`/tools?draft=') > hook.indexOf('client.saved('), 'Review opens the saved draft in Tools')
  const card = fs.readFileSync(path.join(root, 'src/components/inbox/change-request-card.tsx'), 'utf8')
  // The answer box: a real form with one submit button, the typed text kept until Pi took it, 409 read again.
  assert.match(card, /<form [^>]*onSubmit=/, 'The answer box is a form')
  assert.match(card, /<Button type="submit" size="sm"[^>]*>\{busy \? 'Sending…' : 'Answer'\}<\/Button>/, 'Answer is the one submit button')
  assert.equal((card.match(/type="submit"/g) ?? []).length, 1, 'Every other button is type="button"')
  assert.match(card, /if \(await onAnswer\(text\.trim\(\)\)\) setText\(''\)/, 'The text is cleared only after Pi took the answer')
  assert.match(card, /Your answer is kept\./, 'A failed send says the text is kept')
  assert.match(card, /gatewayConversationLink\(sessionId\)/, 'The chat link uses the one chat route helper')
  assert.match(card, /turn\.role === 'builder' \? 'Conker asked' : 'You said'/, 'The conversation reads Conker asked / You said')
  assert.match(hook, /cause\.status === 409\) \{\s*await load\(\)/, 'A 409 reads the list again')
  assert.match(hook, /That question was already answered\./, 'A 409 says the question was already answered')
  assert.match(hook, /replace\(await client\.answer\(request\.id, text\)\)/, 'The card shows what Pi answered, never a made-up state')
  for (const label of ['Conker needs one detail to draft this tool', 'Your answer', 'Questions and answers so far', 'What it does each run', 'Tools it calls', 'Connections it uses', 'Saved word for word', 'Conker is drafting this tool…', 'Couldn’t draft it:', 'Try again', 'Draft again', "'Review'", 'What it does, step by step']) assert.ok(card.includes(label), `The card shows: ${label}`)
  for (const file of ['src/components/gateway/owner-workspace.tsx', 'src/components/gateway/inbox-attention.tsx']) assert.match(fs.readFileSync(path.join(root, file), 'utf8'), /isDrafting\(item\)/, `${file}: a tool still being drafted does not count as needing him`)
  for (const file of ['src/components/inbox/reply-box.tsx', 'src/components/inbox/ask-card.tsx', 'src/components/inbox/approval-card.tsx', 'src/components/inbox/change-request-card.tsx', 'src/components/inbox/agent-note-card.tsx', 'src/components/gateway/proposals-panel.tsx', 'src/components/inbox/inbox-card.tsx', 'src/components/gateway/describe-tool.tsx']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8')
    assert.ok(!/<Button(?![^>]*type="button")[^>]*onClick/.test(source), `${file}: every clickable button is type="button" (a card can sit inside a form)`)
  }
  console.log('Gateway change requests passed: three kinds only, exact payloads, verified approval, save-then-record tool drafts, background drafting states, retry and publish records, and no browser edits.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
