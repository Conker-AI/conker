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

const { createChatNamesClient } = load('src/lib/gateway/chat-names.ts')
const { createFakeChatNames } = load('src/dev/fake-gateway-chat-names.ts')
const { GatewayError } = load('src/lib/gateway/transport.ts')

assert.equal(typeof createChatNamesClient, 'function')
assert.equal(typeof createFakeChatNames, 'function')

const A = 'ses_1111111111111111', B = 'ses_2222222222222222'
const makeStore = () => ({
  sessions: [
    { id: A, title: '', created_at: 1, turns: [], messages: [{ id: 'msg_1111111111111111', session_id: A, seq: 1, role: 'user', content: 'Plan my week around judo and homework please', created_at: 1 }] },
    { id: B, title: '', created_at: 1, turns: [], messages: [] },
  ],
  nextId: prefix => `${prefix}_0000000000000001`,
  contexts: new Map(),
})
const fail = status => { throw new Error(`HTTP ${status}`) }
let requests = 0
const authFor = handle => ({
  request: async (path, options = {}) => {
    requests++
    const value = handle(path, options.method ?? 'GET', { body: options.body })
    if (value === undefined) throw new Error('unhandled ' + path)
    return structuredClone(value)
  },
})
const store = makeStore()
const handle = createFakeChatNames(() => 1_000_000, fail, store)
const client = createChatNamesClient(authFor(handle))

const refused = (promise, check) => assert.rejects(promise, error => { assert.ok(error instanceof GatewayError, String(error)); check(error); return true })
const noRequest = async (promise, kind) => {
  const before = requests
  await refused(promise, error => assert.equal(error.kind, kind))
  assert.equal(requests, before, 'a request was sent')
}
const cases = []
const test = (name, run) => cases.push([name, run])

test('title of an unnamed chat is revision 0 with no source', async () => {
  assert.deepEqual(await client.title(A), { revision: 0, title: '', source: null, modelId: null })
})
test('rename trims, sets the owner as source and bumps the revision', async () => {
  const result = await client.rename(A, '  Week plan  ', 0)
  assert.deepEqual(result, { revision: 1, title: 'Week plan', source: 'owner', modelId: null })
  assert.equal(store.sessions[0].title, 'Week plan')
  assert.deepEqual(await client.title(A), result)
})
test('rename counts characters, not code units (60 emoji pass)', async () => {
  const result = await client.rename(A, '😀'.repeat(60), 1)
  assert.equal([...result.title].length, 60)
})
test('rename refuses 61 characters, empty and control characters without a request', async () => {
  await noRequest(client.rename(A, 'a'.repeat(61), 2), 'validation')
  await noRequest(client.rename(A, '   ', 2), 'validation')
  await noRequest(client.rename(A, 'bad\nname', 2), 'validation')
  await noRequest(client.rename(A, 'bad\u007fname', 2), 'validation')
  await noRequest(client.rename(A, 'fine', -1), 'validation')
})
test('rename with a stale revision gives revision_conflict', async () => {
  await refused(client.rename(A, 'Other', 0), error => { assert.equal(error.code, 'revision_conflict'); assert.equal(error.status, 409) })
})
test('the fixture itself answers a bad title with invalid_title (422)', () => {
  assert.throws(() => handle(`/api/control/pi/sessions/${A}/title`, 'POST', { body: { expected_revision: 2, title: 'x'.repeat(61) } }),
    error => error instanceof GatewayError && error.code === 'invalid_title' && error.status === 422)
})
test('auto-name takes the first six words of the first user message', async () => {
  const result = await client.autoName(A, 2)
  assert.deepEqual(result, { revision: 3, title: 'Plan my week around judo and', source: 'auto', modelId: 'preview-router' })
  assert.equal(store.sessions[0].title, 'Plan my week around judo and')
})
test('auto-name on an empty chat gives empty', async () => {
  await refused(client.autoName(B, 0), error => { assert.equal(error.code, 'empty'); assert.equal(error.status, 409) })
})
test('auto-name with a stale revision gives revision_conflict', async () => {
  await refused(client.autoName(A, 0), error => assert.equal(error.code, 'revision_conflict'))
})
test('output of a new chat is all auto at revision 0', async () => {
  assert.deepEqual(await client.output(A), { revision: 0, output: { format: 'auto', length: 'auto', language: 'auto' } })
})
test('saveOutput stores all three fields and bumps the revision', async () => {
  const result = await client.saveOutput(A, { format: 'list', length: 'short', language: 'ru' }, 0)
  assert.deepEqual(result, { revision: 1, output: { format: 'list', length: 'short', language: 'ru' } })
  assert.deepEqual(await client.output(A), result)
  assert.deepEqual((await client.saveOutput(A, { format: 'json', length: 'long', language: 'en-GB' }, 1)).output, { format: 'json', length: 'long', language: 'en-GB' })
})
test('output settings are per chat', async () => {
  assert.equal((await client.output(B)).revision, 0)
})
test('a stale saveOutput gives revision_conflict', async () => {
  await refused(client.saveOutput(A, { format: 'text', length: 'medium', language: 'fr' }, 0), error => { assert.equal(error.code, 'revision_conflict'); assert.equal(error.status, 409) })
})
test('saveOutput refuses language "English", unknown enums and a long code without a request', async () => {
  await noRequest(client.saveOutput(A, { format: 'text', length: 'short', language: 'English' }, 2), 'validation')
  await noRequest(client.saveOutput(A, { format: 'poem', length: 'short', language: 'en' }, 2), 'validation')
  await noRequest(client.saveOutput(A, { format: 'text', length: 'huge', language: 'en' }, 2), 'validation')
  await noRequest(client.saveOutput(A, { format: 'text', length: 'short', language: 'en-' + 'x'.repeat(40) }, 2), 'validation')
})
test('saveOutput sends exactly the three fields', async () => {
  const seen = []
  const spy = createChatNamesClient({ request: async (_path, options = {}) => { seen.push(options.body); return { revision: 3, output: { format: 'text', length: 'short', language: 'en' } } } })
  await spy.saveOutput(A, { format: 'text', length: 'short', language: 'en', extra: 'x' }, 2)
  assert.deepEqual(seen, [{ expected_revision: 2, output: { format: 'text', length: 'short', language: 'en' } }])
})
test('the fixture answers a bad output value with the generic 422 (no code)', () => {
  assert.throws(() => handle(`/api/control/pi/sessions/${A}/output`, 'POST', { body: { expected_revision: 2, output: { language: 'English' } } }),
    error => error instanceof GatewayError && error.status === 422 && error.code === undefined)
})
test('a malformed id is refused before any request', async () => {
  for (const id of ['invalid_id', 'ses_ABCDEF0123456789', '', `${A}/x`]) {
    await noRequest(client.title(id), 'validation')
    await noRequest(client.rename(id, 'x', 0), 'validation')
    await noRequest(client.autoName(id, 0), 'validation')
    await noRequest(client.output(id), 'validation')
    await noRequest(client.saveOutput(id, { format: 'auto', length: 'auto', language: 'auto' }, 0), 'validation')
  }
})
test('malformed responses are refused as invalid-response', async () => {
  const bad = value => createChatNamesClient({ request: async () => value })
  const sample = { revision: 0, title: 'x', source: null, modelId: null }
  await refused(bad({ invalid: 'response' }).title(A), error => assert.equal(error.kind, 'invalid-response'))
  await refused(bad({ ...sample, extra: 1 }).title(A), error => assert.equal(error.kind, 'invalid-response'))
  await refused(bad({ ...sample, source: 'robot' }).rename(A, 'x', 0), error => assert.equal(error.kind, 'invalid-response'))
  await refused(bad({ ...sample, revision: -1 }).autoName(A, 0), error => assert.equal(error.kind, 'invalid-response'))
  await refused(bad({ revision: 0, output: { format: 'poem', length: 'auto', language: 'auto' } }).output(A), error => assert.equal(error.kind, 'invalid-response'))
  await refused(bad({ revision: 0, output: { format: 'auto', length: 'auto' } }).saveOutput(A, { format: 'auto', length: 'auto', language: 'auto' }, 0), error => assert.equal(error.kind, 'invalid-response'))
})
test('an unknown chat is a plain HTTP 404 and other paths are not answered', () => {
  assert.throws(() => handle('/api/control/pi/sessions/ses_ffffffffffffffff/title', 'GET', {}), /HTTP 404/)
  assert.equal(handle('/api/control/pi/sessions', 'GET', {}), undefined)
  assert.equal(handle(`/api/control/pi/sessions/${A}/context`, 'GET', {}), undefined)
})
test('each fixture instance keeps its own state (no globals)', async () => {
  const other = createChatNamesClient(authFor(createFakeChatNames(() => 1, fail, makeStore())))
  assert.deepEqual(await other.output(A), { revision: 0, output: { format: 'auto', length: 'auto', language: 'auto' } })
  assert.equal((await other.title(A)).revision, 0)
})

async function main() {
  for (const [name, run] of cases) {
    try { await run() } catch (error) { console.error(`FAIL ${name}`); throw error }
    console.log(`ok - ${name}`)
  }
  console.log(`Chat names and output settings: ${cases.length} cases passed (${requests} requests)`)
}
main().catch(error => { console.error(error); process.exit(1) })
