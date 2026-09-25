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
    await build({ entryPoints: [path.join(root, 'src/lib/gateway/control.ts')], outfile: output, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent', alias: { '@': path.join(root, 'src') } })
    const { createGatewayControlClient } = require(output)
    const calls = []
    const receipt = { requestId: 'r', memoryId: 'mem-1', status: 'forgotten', indexRemoval: 'removed', cachedPackagesCleared: 1, sourceConversationKept: true }
    const client = createGatewayControlClient({ request: async (url, options = {}) => { calls.push({ url, options }); return url.endsWith('/memory/forget') ? receipt : { memoryId: 'mem-1', revision: 3, text: 'Lives at 12 Secret St' } } })
    const preview = await client.forgetPreview('mem-1')
    assert.deepEqual(preview, { memoryId: 'mem-1', revision: 3, text: 'Lives at 12 Secret St' })
    assert.equal(calls[0].url, '/api/control/pi/memory/forget/mem-1')
    assert.equal((await client.forgetMemory(preview)).status, 'forgotten')
    const sent = calls[1]
    assert.equal(sent.url, '/api/control/pi/memory/forget'); assert.equal(sent.options.method, 'POST')
    assert.deepEqual({ ...sent.options.body, request_id: 'x' }, { request_id: 'x', memory_id: 'mem-1', expected_revision: 3 })
    assert.ok(sent.options.body.request_id.length >= 16)
    await assert.rejects(client.forgetPreview('../mem'))
    const mismatched = createGatewayControlClient({ request: async () => ({ ...receipt, memoryId: 'other' }) })
    await assert.rejects(mismatched.forgetMemory(preview), /invalid response/i)
    const stale = createGatewayControlClient({ request: async () => ({ memoryId: 'other', revision: 1, text: 'x' }) })
    await assert.rejects(stale.forgetPreview('mem-1'), /invalid response/i)
    console.log('Memory forget passed: exact preview, revision-bound request, receipt and identity checks.')
  } finally {
    await fs.rm(temporary, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
