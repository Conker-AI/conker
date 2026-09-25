const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { createRequire } = require('node:module')

const root = path.resolve(__dirname, '..')
const { build } = createRequire(require.resolve('vite', { paths: [root] }))('esbuild')

const valid = {
  id: 'prp_1', title: 'Weekly summary', noticed: 'You asked three times.', suggestion: 'Prepare it Mondays.',
  ifApproved: 'A draft appears in your Inbox.', state: 'open', createdAt: 1, decidedAt: null, grantsExecutionAuthority: false,
  evidence: [{ messageId: 'msg_1', available: true, sessionId: 'ses_1', excerpt: 'Summarize my week', createdAt: 1 }, { messageId: 'msg_2', available: false }],
}

async function main() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'conker-proposals-'))
  try {
    const output = path.join(temporary, 'proposals.cjs')
    await build({ entryPoints: [path.join(root, 'src/lib/gateway/proposals.ts')], outfile: output, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' })
    const { parseProposal, createGatewayProposalClient } = require(output)
    assert.equal(parseProposal(valid).evidence[1].available, false)
    for (const bad of [{ ...valid, grantsExecutionAuthority: true }, { ...valid, evidence: [] }, { ...valid, state: 'running' }, { ...valid, id: '../x' }, { ...valid, title: 7 }])
      assert.throws(() => parseProposal(bad), /invalid response/i)

    const calls = []
    const client = createGatewayProposalClient({ request: async (url, options = {}) => { calls.push({ url, options }); return url.endsWith('/decision') ? { ...valid, state: 'declined', decidedAt: 2 } : { proposals: [valid] } } })
    assert.equal((await client.list()).length, 1)
    assert.deepEqual(calls[0].options.query, { state: 'open', limit: 50 })
    assert.equal((await client.decide('prp_1', 'decline')).state, 'declined')
    assert.deepEqual(calls[1], { url: '/api/pi/proposals/prp_1/decision', options: { method: 'POST', body: { decision: 'decline' } } })
    await assert.rejects(client.decide('prp_1', 'run'))
    await assert.rejects(client.decide('bad id', 'accept'))
    const stale = createGatewayProposalClient({ request: async () => valid })
    await assert.rejects(stale.decide('prp_1', 'accept'), /invalid response/i)
    console.log('Proposals passed: strict parsing, no execution authority, decision validation and stale-response refusal.')
  } finally {
    await fs.rm(temporary, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
