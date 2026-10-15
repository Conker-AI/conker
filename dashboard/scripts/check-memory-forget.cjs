const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { createRequire } = require('node:module')

const root = path.resolve(__dirname, '..')
const { build } = createRequire(require.resolve('vite', { paths: [root] }))('esbuild')

async function main() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'conker-forget-'))
  try {
    const output = path.join(temporary, 'control.cjs')
    await build({ stdin: { contents: "export * from './src/lib/gateway/control'; export * from './src/lib/gateway/transport'; export * from './src/lib/gateway/memory-forget-state';", resolveDir: root, loader: 'ts' }, outfile: output, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent', alias: { '@': path.join(root, 'src') } })
    const { createGatewayControlClient, createMemoryForgetRequest, createGatewayTransport, GatewayError, memoryForgetFailure, memoryForgetErrorCodes } = require(output)
    const calls = []
    const receipt = { requestId: 'request_forget_one', memoryId: 'mem-1', status: 'forgotten', indexRemoval: 'removed', cachedPackagesCleared: 1, sourceConversationKept: true }
    const client = createGatewayControlClient({ request: async (url, options = {}) => { calls.push({ url, options }); return url.endsWith('/memory/forget') ? { ...receipt, requestId: options.body.request_id } : { memoryId: 'mem-1', revision: 3, text: 'Lives at 12 Secret St' } } })
    const preview = await client.forgetPreview('mem-1')
    assert.deepEqual(preview, { memoryId: 'mem-1', revision: 3, text: 'Lives at 12 Secret St' })
    assert.equal(calls[0].url, '/api/control/pi/memory/forget/mem-1')
    const intent = createMemoryForgetRequest(preview)
    assert.deepEqual(Object.keys(intent).sort(), ['memoryId', 'requestId', 'revision'])
    assert.equal((await client.forgetMemory(intent)).status, 'forgotten')
    const sent = calls[1]
    assert.equal(sent.url, '/api/control/pi/memory/forget'); assert.equal(sent.options.method, 'POST')
    assert.deepEqual({ ...sent.options.body, request_id: 'x' }, { request_id: 'x', memory_id: 'mem-1', expected_revision: 3 })
    assert.ok(sent.options.body.request_id.length >= 16)
    await client.forgetMemory(intent)
    assert.deepEqual(calls[2].options.body, sent.options.body, 'Retry keeps exactly the reviewed request identity and version')
    assert.equal('text' in sent.options.body, false)
    await assert.rejects(client.forgetPreview('../mem'))
    const mismatched = createGatewayControlClient({ request: async () => ({ ...receipt, memoryId: 'other' }) })
    await assert.rejects(mismatched.forgetMemory(intent), error => error.kind === 'invalid-response')
    const wrongRequest = createGatewayControlClient({ request: async () => receipt })
    await assert.rejects(wrongRequest.forgetMemory(intent), error => error.kind === 'invalid-response')
    const stale = createGatewayControlClient({ request: async () => ({ memoryId: 'other', revision: 1, text: 'x' }) })
    await assert.rejects(stale.forgetPreview('mem-1'), error => error.kind === 'invalid-response')
    const pendingCalls = []
    const pending = createGatewayControlClient({ request: async (url, options) => { pendingCalls.push({ url, options }); return { schemaVersion: 1, pending: intent } } })
    assert.deepEqual(await pending.pendingMemoryForget(), intent)
    assert.equal(pendingCalls[0].url, '/api/control/pi/memory/forget-pending')
    assert.equal(pendingCalls[0].options.method, undefined)
    const excessive = createGatewayControlClient({ request: async () => ({ schemaVersion: 1, pending: { ...intent, text: 'Must never expose a forgotten fact' } }) })
    await assert.rejects(excessive.pendingMemoryForget(), error => error.kind === 'invalid-response')
    await assert.rejects(client.forgetMemory({ ...intent, requestId: '../outside' }), error => error.kind === 'validation')
    await assert.rejects(client.forgetMemory({ ...intent, revision: 2147483647 }), error => error.kind === 'validation')

    for (const code of memoryForgetErrorCodes) {
      const status = code === 'not_found' ? 404 : ['work_active', 'forget_in_progress', 'forget_pending', 'request_conflict', 'revision_conflict'].includes(code) ? 409 : 503
      const transport = createGatewayTransport({ origin: 'https://forget.test', fetch: async () => new Response(JSON.stringify({ detail: { code, message: 'PRIVATE_RAW_ERROR' } }), { status, headers: { 'Content-Type': 'application/json' } }) })
      await assert.rejects(transport.request('/api/control/pi/memory/forget', { method: 'POST', csrfToken: 'x'.repeat(43), body: {} }), error => {
        assert.equal(error.code, code)
        assert.equal(memoryForgetFailure(error).reset, ['revision_conflict', 'not_found'].includes(code))
        assert.ok(!memoryForgetFailure(error).message.includes('PRIVATE_RAW_ERROR'))
        return true
      })
    }
    for (const [route, code] of [['/api/control/pi/memory/forget', 'PRIVATE_UNKNOWN_CODE'], ['/api/control/pi/models/configuration', 'work_active']]) {
      const transport = createGatewayTransport({ origin: 'https://forget.test', fetch: async () => new Response(JSON.stringify({ detail: { code, message: 'PRIVATE_RAW_ERROR' } }), { status: 409, headers: { 'Content-Type': 'application/json' } }) })
      await assert.rejects(transport.request(route, { method: 'POST', csrfToken: 'x'.repeat(43), body: {} }), error => error.code === undefined && !error.message.includes('PRIVATE'))
    }
    assert.equal(memoryForgetFailure(new GatewayError('network')).reset, false)
    const network = createGatewayTransport({ origin: 'https://forget.test', fetch: async () => { throw new Error('No request is permitted') } })
    await assert.rejects(network.request('/api/control/pi/memory/forget-pending', { query: { arbitrary: true } }), error => error.kind === 'validation')
    console.log('Memory forget passed: exact intent replay, durable content-free recovery, receipt binding and safe operation-specific errors.')
  } finally {
    await fs.rm(temporary, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
