// Preview replies must have Pi's shapes. Each client parses its reply with the zod schema that
// src/lib/api/pi-wire.check.ts binds to pi.d.ts at compile time, so a preview fixture that drifts
// from Pi fails here instead of only in the preview.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createRequire } = require('node:module')

const root = path.resolve(__dirname, '..')
const { build } = createRequire(require.resolve('vite', { paths: [root] }))('esbuild')

const entry = `
import { createFakeGateway } from './src/dev/fake-gateway'
import { createFakeFiles } from './src/dev/fake-gateway-files'
import { createGatewayProjectsClient } from './src/lib/gateway/projects'
import { createGatewayTeamsClient } from './src/lib/gateway/teams'
import { createGatewayJobsClient } from './src/lib/gateway/jobs'
import { createGatewayHostInventoryClient, createHostInventoryRequestId } from './src/lib/gateway/host-inventory'
import { createGatewayArtifactsClient } from './src/lib/gateway/artifacts'
import { createGatewayFilesystemClient, createFilesystemRequestId } from './src/lib/gateway/filesystem'
import { createGatewayCallsClient } from './src/lib/gateway/calls'
import { createGatewayControlClient } from './src/lib/gateway/control'

export async function run() {
  const fake = createFakeGateway({ setupStep: 'rehearsal' }), files = createFakeFiles()
  const auth = {
    request: (path, options = {}) => files.handles(path) ? files.request(path, options) : fake.request(path, options),
    audio: async () => { throw new Error('no audio in this check') }, getSession: () => null,
    download: async () => { throw new Error('no downloads in this check') }, upload: async () => { throw new Error('no uploads in this check') },
  }
  const projects = createGatewayProjectsClient(auth), teams = createGatewayTeamsClient(auth), jobs = createGatewayJobsClient(auth)
  const inventory = createGatewayHostInventoryClient(auth), artifacts = createGatewayArtifactsClient(auth)
  const filesystem = createGatewayFilesystemClient(auth), calls = createGatewayCallsClient(auth), control = createGatewayControlClient(auth, () => undefined)
  const first = page => { const item = (page.results ?? page)[0]; if (!item) throw new Error('the preview has no item to read'); return item.id }
  return {
    projects: () => projects.list(), project: async () => projects.get(first(await projects.list())),
    team: async () => teams.get(first(await teams.list())), job: async () => jobs.get(first(await jobs.list())),
    notes: () => jobs.agentNotes(), inv: () => inventory.request(createHostInventoryRequestId()),
    targets: () => inventory.configured('services'), art: async () => artifacts.get(first(await artifacts.list())),
    listing: async () => { const roots = await filesystem.roots(); return filesystem.request(createFilesystemRequestId(), roots.roots[0].id) },
    callAvailable: () => calls.availability(), setup: () => control.setupStatus(), setupReceipt: () => control.setupReceipt('boundaries'),
    setupChoice: () => control.setupChoice('memory'), setupProtection: () => control.setupProtection(),
    setupModels: () => control.setupModels(), rehearsal: () => control.setupRehearsal(),
    agent: async () => control.agent(first(await control.agents())),
    memoryUpkeep: () => control.memoryCare.upkeep(),
    chatOutput: () => control.chatNames.output('ses_' + '1'.repeat(16)),
    memoryBeliefs: () => control.memoryBeliefs.list({ origin: 'all', state: 'all' }),
    promptEnhance: () => control.promptEnhance.enhance('Plan my week'),
  }
}
`

async function main() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'conker-preview-shapes-'))
  try {
    const output = path.join(temporary, 'shapes.cjs')
    await build({ stdin: { contents: entry, resolveDir: root, loader: 'ts' }, outfile: output, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent', tsconfig: path.join(root, 'tsconfig.app.json') })
    global.window ??= Object.assign(new EventTarget(), { location: { search: '' } }) // Modules read window at load; the rehearsal step is the preview with every setup receipt.
    const reads = await require(output).run()
    const bound = fs.readFileSync(path.join(root, 'src/lib/api/pi-wire.check.ts'), 'utf8').match(/^ {2}(\w+): true satisfies/gm).map(line => line.trim().split(':')[0])
    // Writes that start or speak in a live call: listed so a new binding cannot be skipped silently.
    const unread = new Set(['call', 'callAudio'])
    for (const name of bound) assert.ok(name in reads || unread.has(name), `${name} is bound to Pi in pi-wire.check.ts; read it here or list it as unread`)
    const failures = []
    for (const [name, read] of Object.entries(reads)) {
      try { await read() } catch (error) { failures.push(`${name}: ${error?.message ?? error}`) }
    }
    assert.deepEqual(failures, [], `Preview replies that do not have Pi's shape:\n${failures.join('\n')}`)
    console.log(`Preview replies have Pi's shapes: ${Object.keys(reads).length} reads.`)
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
}

main().catch(error => { console.error(error.message); process.exit(1) })
