// Server actions (ADR-0014, wave 4 contract 3): the gateway client's exact routes and shapes, the
// helper's refusals kept as fixed codes with its short reason, the password only on actions, the
// plain words of the password sheet and the receipts, and the screens' honesty rules.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..'), cache = new Map()
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports
  const module = { exports: {} }; cache.set(relative, module)
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(request => request.startsWith('.') ? load(`${path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))}.ts`) : require(request), module, module.exports)
  return module.exports
}

const { createGatewayHostOpsClient, createHostOpId, hostProblem, HOST_OP_ID } = load('src/lib/gateway/host-ops.ts')
const { createGatewayTransport, GatewayError, isConversationWrite } = load('src/lib/gateway/transport.ts')
const { describeGatewayOperation } = load('src/lib/gateway/verification.ts')
const words = load('src/lib/server-actions.ts')

const snapshot = 'snapshot-20261029T040000Z-3f2a91c0'
const status = { services: [
  { service: 'memorygate', state: 'running', health: 'healthy', startedAt: '2026-10-27T11:00:00Z', restarts: 0, oneShot: false },
  { service: 'searxng', state: 'exited', health: 'none', startedAt: null, restarts: 2, oneShot: false },
  { service: 'data-owner', state: 'exited', health: 'none', startedAt: null, restarts: 0, oneShot: true },
], backupLock: false, recoveryHeld: false }
const backups = { destination: '/mnt/backup/conker', retentionCopies: 7, ready: true, separateDisk: true, freeBytes: 3.6e12,
  snapshots: [{ name: snapshot, createdAt: '2026-10-29T04:00:00Z' }], partialSnapshots: 0, backupLock: false, recoveryHeld: false }
const receipt = (id, operation, args, outcome = 'working') => ({ id, operation, arguments: args, argumentsDigest: 'a'.repeat(64), source: 'ui', startedAt: '2026-10-30T10:00:00Z',
  endedAt: outcome === 'working' ? null : '2026-10-30T10:01:00Z', outcome, reason: outcome === 'failed' ? 'The service did not restart. Check its status and logs, then try again.' : null,
  check: outcome === 'unknown' ? { operation: 'services.status', arguments: {} } : null })

async function main() {
  // The client: exact paths and bodies, the helper's shapes, nothing extra accepted.
  const calls = []
  const answer = (path, options) => {
    if (path === '/api/host/read') return { operation: options.body.operation, result: options.body.operation === 'services.status' ? status : backups }
    if (path === '/api/host/ops' && options.method === 'POST') return receipt(options.body.id, options.body.operation, options.body.arguments)
    if (path === '/api/host/ops') return { schemaVersion: 1, operations: [receipt('cli-0123456789abcdef', 'backup.run', {}, 'done')], damagedRecords: 1 }
    return receipt(path.split('/').pop(), 'services.restart', { service: 'memorygate' }, 'unknown')
  }
  const client = createGatewayHostOpsClient({ request: async (path, options = {}) => { calls.push([path, options]); return structuredClone(answer(path, options)) } })
  assert.equal((await client.status()).services.length, 3)
  assert.deepEqual(calls.pop(), ['/api/host/read', { method: 'POST', body: { operation: 'services.status', arguments: {} }, signal: undefined }], 'Reads go through POST /api/host/read with no arguments')
  assert.equal((await client.backups()).separateDisk, true)
  assert.deepEqual(calls.pop()[1].body, { operation: 'backup.list', arguments: {} })
  assert.equal((await client.receipts()).damagedRecords, 1)
  assert.equal(calls.pop()[0], '/api/host/ops')
  assert.equal((await client.receipt('cli-0123456789abcdef')).check.operation, 'services.status')
  assert.equal(calls.pop()[0], '/api/host/ops/cli-0123456789abcdef')
  const id = createHostOpId()
  assert.match(id, HOST_OP_ID, 'The browser makes an id the helper accepts')
  assert.notEqual(id, createHostOpId())
  for (const action of [{ operation: 'services.restart', arguments: { service: 'memorygate' } }, { operation: 'backup.verify', arguments: { snapshot } }, { operation: 'backup.run', arguments: {} }]) {
    assert.equal((await client.start(id, action)).outcome, 'working')
    const [sent, options] = calls.pop()
    assert.equal(sent, '/api/host/ops'); assert.equal(options.method, 'POST')
    assert.deepEqual(options.body, { id, ...action }, 'An action sends exactly id, operation and arguments')
  }
  for (const action of [{ operation: 'services.status', arguments: {} }, { operation: 'services.restart', arguments: { service: 'Memory gate' } }, { operation: 'backup.verify', arguments: { snapshot: '../etc' } },
    { operation: 'backup.run', arguments: { force: 'yes' } }, { operation: 'services.stop', arguments: { service: 'pi' } }]) {
    await assert.rejects(client.start(id, action), error => error.kind === 'validation', `${action.operation} is refused in the browser`)
  }
  await assert.rejects(client.start('short', { operation: 'backup.run', arguments: {} }), error => error.kind === 'validation')
  const sent = calls.length
  await assert.rejects(createGatewayHostOpsClient({ request: async () => receipt('ui_another_id_0000000000', 'backup.run', {}) }).start(id, { operation: 'backup.run', arguments: {} }), error => error.kind === 'invalid-response', 'A receipt for another id is not this action')
  await assert.rejects(createGatewayHostOpsClient({ request: async () => ({ operation: 'services.status', result: { ...status, output: 'raw' } }) }).status(), error => error.kind === 'invalid-response', 'No raw output passes')
  await assert.rejects(createGatewayHostOpsClient({ request: async () => ({ operation: 'backup.list', result: status }) }).status(), error => error.kind === 'invalid-response')
  assert.equal(calls.length, sent)

  // The transport: only these routes; the read needs the session only, actions the password.
  const respond = (status, body) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const transport = fetch => createGatewayTransport({ origin: 'https://localhost:8050', fetch })
  const ok = transport(respond(200, {}))
  await ok.request('/api/host/ops')
  await ok.request('/api/host/ops/cli:run.0123456789abcdef')
  await ok.request('/api/host/read', { method: 'POST', csrfToken: 'x'.repeat(43), body: { operation: 'services.status', arguments: {} } })
  await ok.request('/api/host/ops', { method: 'POST', csrfToken: 'x'.repeat(43), body: { id, operation: 'backup.run', arguments: {} } })
  await assert.rejects(ok.request('/api/host/read'), error => error.kind === 'validation')
  await assert.rejects(ok.request('/api/host/ops/short'), error => error.kind === 'validation')
  await assert.rejects(ok.request(`/api/host/ops/${id}`, { method: 'POST', csrfToken: 'x'.repeat(43), body: {} }), error => error.kind === 'validation')
  await assert.rejects(ok.request('/api/host/run', { method: 'POST', csrfToken: 'x'.repeat(43), body: {} }), error => error.kind === 'validation')
  assert.equal(isConversationWrite('/api/host/read'), true, 'Reading services or backups needs the session, not the password')
  assert.equal(isConversationWrite('/api/host/ops'), false, 'Every server action asks for the password')

  // Refusals: the helper's code and its short reason, as is or wrapped; anything else is dropped.
  const refusal = async (status, body, path = '/api/host/ops', method = 'POST') => {
    try { await transport(respond(status, body)).request(path, method === 'POST' ? { method, csrfToken: 'x'.repeat(43), body: { id, operation: 'backup.run', arguments: {} } } : {}) } catch (error) { return error }
    throw new Error('expected a refusal')
  }
  const busy = await refusal(409, { error: 'host_busy', message: 'Another server action is running. Wait for it to finish.' })
  assert.equal(busy.code, 'host_busy'); assert.equal(busy.detail, 'Another server action is running. Wait for it to finish.')
  assert.deepEqual(hostProblem(busy, true), { kind: 'busy', message: busy.detail })
  const wrapped = await refusal(409, { detail: { code: 'host_operation_refused', message: 'The backup folder is not there. Check that the disk is mounted.' } })
  assert.deepEqual(hostProblem(wrapped, true), { kind: 'refused', message: 'The backup folder is not there. Check that the disk is mounted.' })
  const down = await refusal(503, { error: 'host_unavailable', message: 'Docker did not answer.' }, '/api/host/read')
  assert.deepEqual(hostProblem(down, true), { kind: 'unavailable', message: 'Docker did not answer.' }, 'The helper answering 503 means nothing ran')
  const socket = await refusal(503, { detail: 'Host helper is not configured.' }, '/api/host/ops', 'GET')
  assert.equal(socket.detail, undefined, 'Free text without a host code is never kept')
  assert.deepEqual(hostProblem(socket), { kind: 'unavailable', message: null }, 'A read the gateway could not pass on: the helper is not running')
  assert.deepEqual(hostProblem(socket, true), { kind: 'lost', message: null }, 'A start without the helper\'s answer may have begun: Unknown, never resent')
  const controlled = await refusal(409, { error: 'host_busy', message: 'Wait\u0007 for it' })
  assert.equal(controlled.code, 'host_busy'); assert.equal(controlled.detail, undefined, 'A reason with control characters is dropped')
  const strange = await refusal(409, { error: 'shell_access', message: 'Run this instead' })
  assert.equal(strange.code, undefined); assert.equal(strange.detail, undefined)
  const elsewhere = await (async () => { try { await transport(respond(409, { error: 'host_busy', message: 'x' })).request('/api/host/providers') } catch (error) { return error } })()
  assert.equal(elsewhere.detail, undefined, 'Only the server action routes keep a reason')
  assert.equal(hostProblem(new GatewayError('http', 404, undefined, 'unknown_operation_id')).kind, 'not-found')
  assert.equal(hostProblem(new GatewayError('network'), true).kind, 'lost', 'A lost answer is Unknown')
  assert.equal(hostProblem(new GatewayError('verification-cancelled'), true).kind, 'not-sent', 'Closing the password sheet sends nothing')

  // The password sheet names the effect and the button is named after the action.
  const sheet = body => describeGatewayOperation({ method: 'POST', path: '/api/host/ops', body: { id, ...body } })
  const restart = sheet({ operation: 'services.restart', arguments: { service: 'memorygate' } })
  assert.equal(restart.title, 'Restart Memory'); assert.equal(restart.action, 'Restart Memory')
  assert.match(restart.details[0], /Conker can’t recall or save memories until it is back/)
  assert.match(sheet({ operation: 'services.restart', arguments: { service: 'gateway' } }).details[0], /reconnects by itself/)
  const backup = sheet({ operation: 'backup.run', arguments: {} })
  assert.equal(backup.action, 'Back up now'); assert.match(backup.details[0], /Conker pauses for a few minutes/)
  assert.match(sheet({ operation: 'backup.verify', arguments: { snapshot } }).details[0], /nothing is changed or restored/)
  assert.ok(restart.details.some(line => /never sent again by itself/.test(line)))
  assert.equal(describeGatewayOperation({ method: 'POST', path: '/api/control/pi/projects', body: { name: 'A' } }).action, undefined, 'Other operations keep Verify and submit')

  // Plain words: where backups are and what they do not protect against (owner, 2026-10-29).
  assert.equal(words.backupPlace({ ...backups, separateDisk: true }).risk, 'Same computer: lost if this PC dies.')
  assert.match(words.backupPlace({ ...backups, separateDisk: false }).risk, /^Same computer and same disk/)
  assert.equal(words.servicesSummary(status), '1 of 2 services are running fine. Web search needs a look.')
  // A restarting service is named, not counted as running from the last read (2026-10-31).
  assert.equal(words.servicesSummary(status, ['memorygate']), 'Restarting Memory… Web search needs a look.')
  assert.equal(words.servicesSummary(status, ['searxng']), 'Restarting Web search… The other service is running.')
  const three = { ...status, services: [...status.services, { ...status.services[0], service: 'pi' }] }
  assert.equal(words.servicesSummary(three, ['pi']), 'Restarting Pi… 1 of the other 2 are running fine. Web search needs a look.')
  assert.equal(words.servicesSummary(three, ['memorygate', 'pi']), 'Restarting Memory and Pi… Web search needs a look.')
  assert.equal(words.receiptTitle({ operation: 'services.restart', arguments: { service: 'pi' }, outcome: 'unknown' }), 'Can’t tell if Pi restarted')
  assert.equal(words.receiptTitle({ operation: 'backup.run', arguments: {}, outcome: 'done' }), 'Backed up and checked')
  const order = words.sortReceipts(['done', 'failed', 'working', 'unknown'].map((outcome, index) => receipt(`ui_order_${index}_0000000000`, 'backup.run', {}, outcome))).map(row => row.outcome)
  assert.deepEqual(order, ['working', 'unknown', 'failed', 'done'], 'Live first, then what needs a look')
  assert.equal(words.bytes(3.6e12), '3.6 TB')

  // The screens.
  const read = file => fs.readFileSync(path.join(root, file), 'utf8')
  const services = read('src/components/gateway/server-services.tsx'), backupsUi = read('src/components/gateway/server-backups.tsx')
  const parts = read('src/components/gateway/server-action-parts.tsx'), hook = read('src/components/gateway/use-server-actions.ts')
  assert.match(backupsUi, /<Place list=\{list\} \/>/, 'The Backups screen always says where backups are')
  assert.match(backupsUi, /conker setup configure protection --destination/, 'First use says how to set the folder up')
  assert.match(backupsUi, /Conker pauses for a few minutes/)
  assert.match(parts, /The server helper isn’t running/); assert.match(parts, /The command line on the server still works/)
  assert.match(parts, /Nothing is retried by itself/); assert.match(parts, /Didn’t start: \{message\} Nothing ran\./)
  assert.match(services, /actions\.busy/, 'One action at a time: Restart waits while another runs')
  assert.match(services, /servicesSummary\(status, lasting\.filter\(item => restartingNow\(actions, item\.service\)\)/, 'The summary counts a restarting service as restarting')
  assert.doesNotMatch(hook + services + backupsUi, /setInterval/, 'Only receipts are polled, one timer at a time')
  assert.doesNotMatch(hook, /start\([^)]*\)\s*\)\s*\.catch\(\s*\(\)\s*=>\s*start/, 'Never resent by itself')
  assert.match(hook, /client\.receipt\(attempt\.id/, 'A lost start is checked by its id, not sent again')
  assert.match(read('src/components/gateway/system-status.tsx'), /<RecentServerActions client=\{client\.hostOps\} \/>/, 'Overview lists recent server actions')
  assert.doesNotMatch(parts + services + backupsUi, /output|stdout|stderr/i, 'Receipts only, never command output')
  console.log('Server actions passed: exact host routes and shapes, password only on actions, helper refusals with their reason, honest receipts and words.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
