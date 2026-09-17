const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { webcrypto } = require('node:crypto')
const root = path.resolve(__dirname, '..')
const ts = require(path.join(root, 'node_modules/typescript'))
const cache = new Map()
globalThis.crypto ??= webcrypto

function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports
  const source = fs.readFileSync(path.join(root, relative), 'utf8').replaceAll('import.meta.env', '({})')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const module = { exports: {} }
  cache.set(relative, module)
  const resolve = request => {
    if (request === 'zod') return require('zod')
    assert.ok(request.startsWith('.'), `Unexpected dependency: ${request}`)
    return load(`${path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))}.ts`)
  }
  new Function('require', 'module', 'exports', compiled.outputText)(resolve, module, module.exports)
  return module.exports
}

async function main() {
  const { createFixtureClient } = load('src/lib/api/fixture-adapter.ts')
  const client = createFixtureClient()
  const initial = await client.load()
  const input = { name: '  Research digest  ', instructions: 'Prepare a digest.', agentId: 'conker', timeZone: 'Asia/Jerusalem', timing: { kind: 'daily', time: '09:00', day: 0, hours: 24 }, enabled: false }
  for (const invalid of [{ name: ' ' }, { instructions: '' }, { agentId: 'missing' }, { timeZone: 'invalid-zone' }, { timing: { ...input.timing, time: '25:00' } }, { timing: { ...input.timing, kind: 'interval', hours: 0 } }, { timing: { ...input.timing, kind: 'weekly', day: 9 } }]) {
    await assert.rejects(client.createJob({ ...input, ...invalid }))
  }
  assert.equal((await client.load()).jobs.length, initial.jobs.length, 'Invalid drafts never create jobs')
  const created = await client.createJob(input)
  assert.equal(created.name, 'Research digest')
  assert.equal(created.status, 'Paused')
  input.timing.time = '23:00'
  created.instructions = 'Mutated outside the client'
  assert.equal((await client.load()).jobs[0].timing.time, '09:00', 'Input is copied')
  assert.equal((await client.load()).jobs[0].instructions, 'Prepare a digest.', 'Return values are copied')

  const running = client.updateJob(created.id, 'run')
  await assert.rejects(client.updateJob(created.id, 'run'), /Wait for/)
  await assert.rejects(client.deleteJob(created.id), /Wait for/)
  const receipt = await running
  assert.equal(receipt.status, 'Paused', 'Run now does not enable a paused schedule')
  assert.equal(receipt.history.length, 1)
  assert.equal(receipt.history[0].source, 'preview')
  assert.match(receipt.history[0].summary, /No agent, tool or server command/)

  const edited = await client.saveJob(created.id, { ...input, name: 'Weekly digest', agentId: 'workshop', enabled: true, timing: { kind: 'weekly', day: 1, time: '08:30', hours: 24 } })
  assert.equal(edited.schedule, 'Monday · 08:30')
  assert.equal(edited.agentId, 'workshop')
  assert.equal(edited.status, 'Scheduled')
  assert.deepEqual(edited.history, receipt.history, 'Edits preserve history')
  const copy = await client.duplicateJob(created.id)
  assert.notEqual(copy.id, created.id)
  assert.equal(copy.status, 'Paused', 'Copies always start paused')
  assert.deepEqual(copy.history, [], 'Copies do not inherit receipts')
  await client.saveJob(copy.id, { ...input, timing: { ...input.timing, kind: 'interval', hours: 6 } })
  assert.equal((await client.load()).jobs.find(job => job.id === created.id).timing.kind, 'weekly', 'Copies are independent')
  await client.deleteJob(created.id)
  await assert.rejects(client.updateJob(created.id, 'run'), /Job not found/)
  const after = await client.load()
  assert.ok(after.jobs.some(job => job.id === copy.id))
  assert.deepEqual({ ...after, jobs: initial.jobs }, initial, 'Job actions do not mutate other screens')
  assert.deepEqual((await createFixtureClient().load()).jobs, initial.jobs, 'A fresh preview resets all changes')
  console.log('Jobs checks passed: validation, CRUD, copy isolation, history, run locking, paused runs, preview reset, and unchanged non-job data.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
