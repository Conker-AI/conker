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
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')

async function main() {
  const folder = path.join(root, 'src/settings/registry')
  const groups = fs.readdirSync(folder).filter(name => name.endsWith('.json')).map(name => JSON.parse(fs.readFileSync(path.join(folder, name), 'utf8')))
  const settings = groups.flatMap(group => group.sections.flatMap(section => section.settings))
  assert.ok(groups.length >= 30 && settings.length >= 300, 'the whole catalog is in the registry')

  // Every topic's icon and heading exist on the screen.
  const icons = read('src/settings/icons.ts'), registry = read('src/settings/registry.ts')
  for (const group of groups) {
    assert.ok(icons.includes(`'${group.icon}'`) || icons.includes(` ${group.icon}:`), `${group.id}: icon ${group.icon} is drawn`)
    assert.ok(registry.includes(`id: '${group.category}'`), `${group.id}: category ${group.category} has a heading`)
  }
  // Every setting with a screen of its own has that screen.
  const blocks = read('src/settings/blocks.tsx')
  for (const setting of settings.filter(item => item.type === 'custom')) assert.ok(blocks.includes(`${setting.component.includes('-') ? `'${setting.component}'` : setting.component}: () =>`), `${setting.id}: block ${setting.component} exists`)
  // Every type has its one control.
  const controls = read('src/settings/controls.tsx')
  for (const type of new Set(settings.map(item => item.type)).add('toggle')) if (type !== 'custom') assert.ok(controls.includes(`case '${type}'`), `type ${type} has a control`)

  // One row template with the same marks everywhere.
  const row = read('src/settings/setting-row.tsx')
  for (const mark of ['Not used yet', 'This device', 'Reset', 'Saving…', 'Saved', 'Turn on']) assert.ok(row.includes(mark), `the row shows: ${mark}`)
  assert.ok(!/<Button(?![^>]*(?:type="button"|render=))[^>]*onClick/.test(row + read('src/settings/controls.tsx') + read('src/settings/blocks-parts.tsx') + read('src/settings/settings-screen.tsx')), 'every clickable settings button is type="button"')

  // The owner's settings document saves with the session; his preferences ask for the password.
  const { isConversationWrite, createGatewayTransport } = load('src/lib/gateway/transport.ts')
  assert.equal(isConversationWrite('/api/control/pi/owner/settings'), true)
  assert.equal(isConversationWrite('/api/control/pi/owner/preferences'), false)
  let requests = 0
  const transport = createGatewayTransport({ origin: 'https://localhost:8050', fetch: async () => { requests++; return new Response('{}', { headers: { 'content-type': 'application/json' } }) } })
  for (const route of ['/api/control/pi/owner/settings', '/api/control/pi/owner/preferences']) {
    await transport.request(route)
    await transport.request(route, { method: 'POST', csrfToken: 'x'.repeat(43), body: {} })
  }
  assert.equal(requests, 4)

  // The settings client sends whole revision-checked documents.
  const { createOwnerSettingsClient } = load('src/lib/gateway/owner-settings.ts')
  const calls = []
  let reply = { schemaVersion: 1, revision: 3, values: { 'appearance.accent': 'blue' } }
  const client = createOwnerSettingsClient({ request: async (...args) => { calls.push(args); return structuredClone(reply) } })
  assert.equal((await client.read()).values['appearance.accent'], 'blue')
  reply = { schemaVersion: 1, revision: 4, values: {} }
  await client.save({}, 3)
  assert.deepEqual(calls.at(-1), ['/api/control/pi/owner/settings', { method: 'POST', body: { expected_revision: 3, values: {} } }])
  reply = { schemaVersion: 1, revision: 9, values: {} }
  await assert.rejects(client.save({}, 3), error => error.kind === 'invalid-response', 'a save that skipped revisions is not trusted')
  console.log(`Settings passed: ${groups.length} topics, ${settings.length} settings, one row template, every block and control present, password only where it guards something.`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
