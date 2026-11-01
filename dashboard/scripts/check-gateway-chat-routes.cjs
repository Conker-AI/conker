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
  new Function('require', 'module', 'exports', code)(request => !request.startsWith('.') && !request.startsWith('@/') ? require(request) :
    load(request.startsWith('@/') ? `src/${request.slice(2)}.ts` : `${path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))}.ts`), module, module.exports)
  return module.exports
}

const { snapshotGatewayOperation, needsNoPassword, createGatewayTransport, chatFeatureErrorCodes } = load('src/lib/gateway/transport.ts')
const session = `ses_${'a1'.repeat(8)}`, message = `msg_${'b2'.repeat(8)}`
const chat = `/api/control/pi/sessions/${session}`, context = `/api/control/pi/context/${session}`
const allowed = (target) => { try { snapshotGatewayOperation(target, {}); return true } catch { return false } }

// Pi's CHAT_WRITES: each one is a browser route and none skips the password.
const writes = [
  `${chat}/output`, `${chat}/title`, `${chat}/title/auto`, `${chat}/messages/${message}/retry`,
  `${chat}/messages/${message}/fact-check`, `${chat}/messages/${message}/fork`,
  `${chat}/response-families/${message}/select`, `${chat}/response-families/${message}/judge`,
  `${chat}/response-families/${message}/vote`, context, `${context}/fork`, `${context}/summary`,
  `${context}/summary/restore`, `${context}/summary/draft`, `${context}/compact`, `${context}/items`,
  `${context}/items/dec_${'c3'.repeat(8)}/state`, `${context}/items/thr_${'d4'.repeat(8)}/state`,
]
const { describeGatewayOperation } = load('src/lib/gateway/verification.ts')
const titles = new Set()
for (const target of writes) {
  assert.ok(allowed(target), `${target} is a chat write`)
  const review = describeGatewayOperation({ path: target, body: {} })
  assert.notEqual(review.title, 'Confirm gateway operation', `${target} has a plain name in the password sheet`)
  titles.add(review.title)
  assert.equal(needsNoPassword(target, {}), false, `${target} asks for the password`)
}
// Ids outside Pi's exact shapes, extra segments and query strings are refused before any request.
for (const target of [
  `/api/control/pi/sessions/ses_${'A'.repeat(16)}/title`, `/api/control/pi/sessions/ses_${'a'.repeat(15)}/title`,
  `${chat}/messages/msg_${'z'.repeat(16)}/retry`, `${chat}/title/auto/now`, `${chat}/title?x=1`,
  `${context}/items/req_${'c3'.repeat(8)}/state`, `${context}/../title`, `${chat}/response-families/${message}/delete`,
]) assert.equal(allowed(target), false, `${target} is refused`)
assert.equal(titles.size, writes.length - 1, 'Each chat write has its own name (decision and thread state share one)')

// Refusals: Pi's known chat code survives on chat routes; unknown codes and Pi's text never do.
;(async () => {
  const refusal = async (status, body, target = `${chat}/title`) => {
    const fetch = async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    try { await createGatewayTransport({ origin: 'https://localhost:8050', fetch }).request(target) } catch (error) { return error }
    throw new Error('expected a refusal')
  }
  const conflict = await refusal(409, { detail: { code: 'revision_conflict', message: 'Reload first.' } })
  assert.equal(conflict.code, 'revision_conflict'); assert.equal(conflict.detail, undefined, "Pi's text is not kept")
  assert.equal((await refusal(503, { detail: { code: 'helpers_off', message: 'x' } }, `${context}/summary`)).code, 'helpers_off')
  assert.equal((await refusal(409, { detail: { code: 'run_shell', message: 'x' } })).code, undefined, 'Unknown codes are dropped')
  assert.equal((await refusal(409, { detail: { code: 'revision_conflict' } }, '/api/host/ops')).code, undefined, 'Only chat routes keep chat codes')
  assert.ok(chatFeatureErrorCodes.length > 40)
  const { chatFeatureMessage } = load('src/lib/gateway/chat-feature-errors.ts'), { GatewayError } = load('src/lib/gateway/transport.ts')
  for (const code of chatFeatureErrorCodes) assert.notEqual(chatFeatureMessage(new GatewayError('upstream-denied', 409, undefined, code)), new GatewayError('upstream-denied').message, code)
  assert.equal(chatFeatureMessage(new GatewayError('network')), new GatewayError('network').message, 'Other failures keep the gateway message')
  console.log(`chat routes: ${writes.length} writes allowed with password, 8 malformed refused, refusal codes kept and worded`)
})().catch(error => { console.error(error); process.exit(1) })
