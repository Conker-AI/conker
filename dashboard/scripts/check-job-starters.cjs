// Cron job starters (src/lib/job-starters.ts): a small fixed catalog of words and timings that only
// fill in the New AI job form. Checks the catalog's shape, that every starter is a body the browser
// and Pi accept for an AI job, and that picking one never creates anything by itself.
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
    load(`${path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))}.ts`), module, module.exports)
  return module.exports
}
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')

const { jobStarters, jobIntervalHours, starterTiming } = load('src/lib/job-starters.ts')
const { createGatewayJobsClient } = load('src/lib/gateway/jobs.ts')

async function main() {
  assert.ok(Array.isArray(jobStarters) && jobStarters.length >= 6 && jobStarters.length <= 16, 'A small, fixed catalog')
  const ids = new Set(), names = new Set()
  for (const starter of jobStarters) {
    const label = starter.id ?? JSON.stringify(starter)
    assert.deepEqual(Object.keys(starter).filter(key => !['id', 'name', 'summary', 'instructions', 'when', 'agentId', 'needs'].includes(key)), [], `${label}: only words, a timing and an agent`)
    assert.match(starter.id, /^[a-z]+(?:-[a-z]+)*$/, `${label}: lower-case words joined by dashes`)
    assert.ok(!ids.has(starter.id), `${label}: ids are unique`); ids.add(starter.id)
    assert.ok(starter.name.length >= 3 && starter.name.length <= 80 && starter.name === starter.name.trim(), `${label}: a job name Pi accepts`)
    assert.match(starter.name, /^[A-Z][^A-Z]*$/, `${label}: sentence case, like every other title`)
    assert.ok(!names.has(starter.name.toLocaleLowerCase()), `${label}: names are unique`); names.add(starter.name.toLocaleLowerCase())
    assert.ok(starter.summary.length <= 72 && /^[A-Z].*\.$/.test(starter.summary) && !/\.\s/.test(starter.summary), `${label}: the summary is one short sentence`)
    const words = starter.instructions
    assert.ok(words.length >= 60 && words.length <= 4000 && words === words.trim(), `${label}: instructions Pi accepts`)
    assert.ok(/\b(?:me|my|I)\b/.test(words), `${label}: written in the owner's own voice`)
    assert.doesNotMatch(words, /\bNOTHING\b/, `${label}: Pi's quiet reply is Pi's to say, not the instructions'`)
    assert.doesNotMatch(words, /[[\]{}<>]|TODO|XXX/, `${label}: no placeholders to fill in; it works as it is`)
    const when = starter.when
    assert.ok(['daily', 'weekly', 'hours'].includes(when.kind), `${label}: a timing the form offers`)
    assert.deepEqual(Object.keys(when).sort(), { daily: ['kind', 'time'], weekly: ['day', 'kind', 'time'], hours: ['every', 'kind'] }[when.kind], `${label}: timing fields`)
    if (when.kind === 'hours') assert.ok(jobIntervalHours.includes(when.every), `${label}: one of the form's Every few hours choices`)
    else assert.match(when.time, /^([01]\d|2[0-3]):[0-5]\d$/, `${label}: a time of day`)
    if (when.kind === 'weekly') assert.ok(Number.isInteger(when.day) && when.day >= 0 && when.day <= 6, `${label}: a day of the week`)
    if (starter.agentId !== undefined) assert.match(starter.agentId, /^(?:companion|agent_[0-9a-f]{32})$/, `${label}: an agent id Pi knows`)
    if (starter.needs !== undefined) assert.match(starter.needs, /^an? [a-z].*[^.]$/, `${label}: needs completes "It needs …"`)
  }
  assert.deepEqual(starterTiming({ kind: 'hours', every: 4 }), { kind: 'interval', time: '00:00', day: 0, hours: 4 })
  assert.deepEqual(starterTiming({ kind: 'daily', time: '08:00' }), { kind: 'daily', time: '08:00', day: 0, hours: 24 })
  assert.deepEqual(starterTiming({ kind: 'weekly', day: 1, time: '09:00' }), { kind: 'weekly', time: '09:00', day: 1, hours: 24 })

  // Every starter is an AI job body the browser's checks (and so Pi's) accept, sent to the one
  // owner route that asks for the password.
  const sent = []
  const client = createGatewayJobsClient({ request: async (...args) => { sent.push(args); return null } })
  for (const starter of jobStarters) {
    const body = { name: starter.name, instructions: starter.instructions, timing: starterTiming(starter.when), timeZone: 'Asia/Jerusalem', agentId: starter.agentId ?? 'companion' }
    await assert.rejects(client.createAgentJob(body), error => error.kind === 'invalid-response', `${starter.id}: passes the browser's checks and is sent`)
    const [route, options] = sent.at(-1)
    assert.equal(route, '/api/control/pi/jobs/agent'); assert.equal(options.method, 'POST'); assert.deepEqual(options.body, body)
  }
  assert.equal(sent.length, jobStarters.length)

  // The catalog is data: it imports nothing that could call Pi, and the screen only fills the form.
  const catalog = read('src/lib/job-starters.ts')
  assert.deepEqual(catalog.split('\n').filter(line => line.startsWith('import ') && !line.startsWith('import type ')), [], 'The catalog imports types only')
  const workspace = read('src/components/gateway/jobs-workspace.tsx'), dialog = read('src/components/gateway/new-agent-job-dialog.tsx')
  assert.match(workspace, /Start from an idea/)
  assert.match(workspace, /onClick=\{\(\) => startNew\(starter\)\}/, 'Picking an idea opens the form with it')
  assert.doesNotMatch(workspace, /createAgentJob\(/, 'The Cron jobs screen never creates a job from an idea itself')
  assert.equal(dialog.match(/createAgentJob\(/g).length, 1, 'The form creates in one place: its submit')
  assert.match(dialog, /const submit = async \(event: FormEvent\) => \{\s*event\.preventDefault\(\)/)
  assert.match(dialog, /Creating it asks for your password\./)
  assert.match(dialog, /nothing is made until you create it/)
  console.log(`Job starters passed: ${jobStarters.length} starters with valid words and timings, accepted as AI job bodies, and never created without the form.`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
