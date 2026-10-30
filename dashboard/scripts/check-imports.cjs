// ChatGPT and Claude imports (contract 2): the raw conversations.json goes only to the import
// routes; previewing saves nothing and asks for no password; importing asks once, bound to that
// exact path; Pi's refusals read in plain words; the archive is parsed strictly.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..'), cache = new Map()
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports
  const module = { exports: {} }; cache.set(relative, module)
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const resolve = request => request.startsWith('@/') ? `src/${request.slice(2)}.ts` : `${path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))}.ts`
  new Function('require', 'module', 'exports', code)(request => request === 'zod' || request === 'zustand/vanilla' ? require(request) : load(resolve(request)), module, module.exports)
  return module.exports
}
const { createGatewayTransport, GatewayError } = load('src/lib/gateway/transport.ts')
const { createGatewayFileTransfer, GatewayRefusal, isImportSave } = load('src/lib/gateway/file-transfer.ts')
const { createGatewayAuthClient } = load('src/lib/gateway/auth.ts')
const { createGatewayImportsClient, importRefusalMessage } = load('src/lib/gateway/imports.ts')

const origin = 'https://conker.example', now = 10_000, digest = 'd'.repeat(64)
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const session = { authenticated: true, csrf_token: 'c'.repeat(43), session_id: 's'.repeat(24), expires_at: now + 86400, unlock_expires_at: now + 1800, setup_required: false }
const memory = { on: true, reason: null, configured: true }
const preview = { schemaVersion: 1, source: 'chatgpt', label: 'Imported from ChatGPT', digest, bytes: 11, chats: { inFile: 3, new: 2, updated: 1, unchanged: 0 },
  messages: { inFile: 9, new: 9, yours: 4, offeredToMemory: 4 }, firstAt: 1_600_000_000, lastAt: 1_700_000_000, sampleTitles: ['Judo', 'Physics'], skipped: { emptyChats: 1 }, memory, limits: {} }
const result = { schemaVersion: 1, batchId: `impb_${'e'.repeat(32)}`, source: 'chatgpt', label: 'Imported from ChatGPT', digest, importedAt: now, chats: { new: 2, updated: 1, unchanged: 0 }, messages: { added: 9, offeredToMemory: 4 }, skipped: {}, memory }
const body = () => new Blob(['[{"id":1}]\n'], { type: 'application/json' })

async function main() {
  // Transport: routes, headers, and when a password proof must (and must not) ride along.
  const calls = []
  let reply = () => json(preview)
  const files = createGatewayFileTransfer(origin, async (url, init) => { calls.push({ url, init }); return reply(url, init) })
  assert.equal(isImportSave(`/api/control/pi/imports/chatgpt/${digest}`), true)
  assert.equal(isImportSave('/api/control/pi/imports/chatgpt/preview'), false)
  const csrf = 'c'.repeat(43), token = 'v'.repeat(43)
  await files.upload('/api/control/pi/imports/chatgpt/preview', body(), csrf)
  let sent = calls.pop()
  assert.equal(sent.url, `${origin}/api/control/pi/imports/chatgpt/preview`)
  assert.equal(sent.init.method, 'POST'); assert.equal(sent.init.headers['Content-Type'], 'application/json'); assert.equal(sent.init.headers['X-CSRF-Token'], csrf)
  assert.equal(sent.init.headers['X-Conker-Verification'], undefined); assert.ok(sent.init.body instanceof Blob)
  reply = () => json(result)
  await files.upload(`/api/control/pi/imports/claude/${digest}`, body(), csrf, token)
  assert.equal(calls.pop().init.headers['X-Conker-Verification'], token)
  class Huge extends Blob { get size() { return 128 * 1024 * 1024 + 1 } }
  for (const [route, file, proof] of [
    ['/api/control/pi/imports/chatgpt/preview', body(), token], [`/api/control/pi/imports/chatgpt/${digest}`, body(), undefined],
    ['/api/control/pi/imports/gemini/preview', body(), undefined], ['/api/control/pi/imports/chatgpt/preview', new Blob([]), undefined],
    ['/api/control/pi/imports/chatgpt/preview', new Huge(['x']), undefined], ['/api/control/pi/artifacts', body(), undefined],
  ]) await assert.rejects(files.upload(route, file, csrf, proof), error => error instanceof GatewayError && error.kind === 'validation')
  assert.equal(calls.length, 0)
  console.log('PASS only the import routes take a raw file; only importing carries a password proof')

  reply = () => json({ detail: { code: 'wrong_format', message: 'No chat in this file matches the ChatGPT export. It looks like a Claude export.' } }, 422)
  const wrong = await files.upload('/api/control/pi/imports/chatgpt/preview', body(), csrf).catch(error => error)
  assert.ok(wrong instanceof GatewayRefusal && wrong.refusal === 'wrong_format' && wrong.looksLike === 'claude')
  assert.equal(importRefusalMessage(wrong, 'chatgpt'), 'No chat in this file matches a ChatGPT export. It looks like a Claude export: choose Claude instead.')
  reply = () => json({ detail: { code: 'file_changed', message: 'x' } }, 409)
  assert.match(importRefusalMessage(await files.upload(`/api/control/pi/imports/chatgpt/${digest}`, body(), csrf, token).catch(error => error)), /isn’t the file you previewed/)
  reply = () => new Response('too big', { status: 413 })
  assert.match(importRefusalMessage(await files.upload('/api/control/pi/imports/chatgpt/preview', body(), csrf).catch(error => error)), /larger than 128 MB/)
  console.log('PASS import refusals read in plain words, with the other export named when Pi says so')

  // Auth: previewing asks nothing; importing asks once, for the exact import path with an empty body.
  const verified = [], reviews = [], uploads = []
  const transport = createGatewayTransport({ origin, fetch: async (url, init) => {
    if (url.endsWith('/auth/session')) return json(session)
    if (url.endsWith('/auth/verify')) { verified.push(JSON.parse(init.body).operation); return json({ verification_token: token, verification_expires_at: now + 120, unlock_expires_at: now + 1800 }) }
    throw new Error(`unexpected ${url}`)
  } })
  const stub = { download: async () => { throw new Error('unused') }, upload: async (...args) => { uploads.push(args); return args[0].endsWith('/preview') ? preview : result } }
  const verification = { request: (review, verify, signal) => { reviews.push(review); return verify('owner password', signal ?? new AbortController().signal) }, cancelAll: () => {} }
  const auth = createGatewayAuthClient({ transport, files: stub, verification, now: () => now })
  const client = createGatewayImportsClient(auth)
  const chosen = new Blob(['x'.repeat(11)])
  assert.equal((await client.preview('chatgpt', chosen)).chats.new, 2)
  assert.equal(reviews.length, 0); assert.equal(uploads.at(-1)[3], undefined)
  assert.equal((await client.save('chatgpt', digest, chosen)).messages.added, 9)
  assert.deepEqual(verified, [{ method: 'POST', path: `/api/control/pi/imports/chatgpt/${digest}`, body: {} }])
  assert.equal(reviews[0].title, 'Import chats from ChatGPT'); assert.equal(uploads.at(-1)[3], token); assert.equal(uploads.at(-1)[1], chosen)
  const refused = { request: (_review, _verify, _signal) => Promise.reject(new GatewayError('verification-cancelled')), cancelAll: () => {} }
  const cancelled = createGatewayImportsClient(createGatewayAuthClient({ transport, files: stub, verification: refused, now: () => now }))
  uploads.length = 0
  await assert.rejects(cancelled.save('chatgpt', digest, chosen), error => error.kind === 'verification-cancelled')
  assert.equal(uploads.length, 0)
  console.log('PASS previewing asks for no password; importing asks once and sends nothing if cancelled')

  // Client parsing: answers must match what was asked.
  const answers = []
  let next = preview
  const fake = createGatewayImportsClient({ request: async (...args) => { answers.push(args); return structuredClone(next) }, upload: async () => structuredClone(next) })
  await assert.rejects(fake.preview('claude', chosen), error => error.kind === 'invalid-response')
  await assert.rejects(fake.preview('chatgpt', new Blob(['short'])), error => error.kind === 'invalid-response')
  next = { ...result, digest: 'f'.repeat(64) }
  await assert.rejects(fake.save('chatgpt', digest, chosen), error => error.kind === 'invalid-response')
  await assert.rejects(fake.save('chatgpt', 'not-a-digest', chosen), error => error.kind === 'validation')
  const chat = { id: `imp_${'a'.repeat(32)}`, source: 'claude', label: 'Imported from Claude', title: null, exportId: 'x', startedAt: null, updatedAt: 5, importedAt: 6, messageCount: 2, archived: true, readOnly: true }
  next = { schemaVersion: 1, total: 1, chats: [chat], nextOffset: null }
  assert.equal((await fake.chats({ source: 'claude', offset: 50 })).chats[0].title, null)
  assert.deepEqual(answers.pop(), ['/api/control/pi/imports/chats', { query: { limit: 50, offset: 50, source: 'claude' }, signal: undefined }])
  await assert.rejects(fake.chats({ source: 'chatgpt' }), error => error.kind === 'invalid-response')
  await assert.rejects(fake.chats({ limit: 500 }), error => error.kind === 'validation')
  next = { schemaVersion: 1, ...chat, messages: [{ id: `impmsg_${'b'.repeat(32)}`, seq: 3, author: 'user', text: 'Hi', createdAt: null, shortened: false, exportId: 'm', memory: 'offering' }], nextAfter: null }
  assert.equal((await fake.chat(chat.id, 2)).messages[0].memory, 'offering')
  assert.deepEqual(answers.pop(), [`/api/control/pi/imports/chats/${chat.id}`, { query: { after: 2, limit: 50 }, signal: undefined }])
  await assert.rejects(fake.chat(chat.id, 3), error => error.kind === 'invalid-response')
  await assert.rejects(fake.chat('imp_../x'), error => error.kind === 'validation')
  next = { schemaVersion: 1, imports: [result], memory: { configured: false, waiting: 4, offered: 0, refused: 0, problem: 'MemoryGate import listener is not set up.' } }
  assert.equal((await fake.list()).memory.waiting, 4)
  console.log('PASS imported chats are read as read-only pages that match what was asked')

  const transportSource = fs.readFileSync(path.join(root, 'src/lib/gateway/transport.ts'), 'utf8')
  assert.match(transportSource, /routes\.GET\.unshift\(\/\^\\\/api\\\/control\\\/pi\\\/imports\(\?:\\\/chats\(\?:\\\/imp_\[0-9a-f\]\{32\}\)\?\)\?\$\/\)/)
  assert.doesNotMatch(transportSource, /imports\\\/\(\?:chatgpt/)
  const screen = fs.readFileSync(path.join(root, 'src/components/gateway/imported-chats.tsx'), 'utf8')
  assert.doesNotMatch(screen, /Composer|composer|<textarea|Textarea/)
  console.log('Import checks passed.')
}
main().catch(error => { console.error(error); process.exit(1) })
