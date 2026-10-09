const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const directory = path.resolve(__dirname, '../src/components/gateway')
const cache = new Map()
function load(name) {
  if (cache.has(name)) return cache.get(name)
  const module = { exports: {} }
  const source = ts.transpileModule(fs.readFileSync(path.join(directory, `${name}.ts`), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('module', 'exports', 'require', source)(module, module.exports, value => load(value.replace('./', '')))
  cache.set(name, module.exports)
  return module.exports
}
const { workspaceTab, visitTab, closeTab, moveTab } = load('workspace-tabs')
assert.equal(workspaceTab('/unknown', ''), null)
assert.equal(workspaceTab('/chat', '?session=ses_1&message=private&query=secret').href, '/chat?session=ses_1')
assert.equal(workspaceTab('/settings', '?tab=providers').title, 'Providers')
assert.equal(workspaceTab('/memory', '?q=private&view=graph').id, '/memory')
const first = workspaceTab('/chat', '?session=ses_1')
const second = workspaceTab('/memory', '')
const third = workspaceTab('/tools', '?draft=research')
const tabs = [first, second, third]
assert.equal(visitTab(tabs, first), tabs)
assert.equal(closeTab(tabs, first.id, second.id).next, null)
assert.equal(closeTab(tabs, second.id, second.id).next, third.href)
assert.equal(closeTab(tabs, third.id, third.id).next, second.href)
assert.equal(closeTab([first], first.id, first.id).next, '/')
const pinned = [{ ...first, pinned: true }, second]
assert.equal(closeTab(pinned, first.id, first.id).tabs, pinned)
assert.deepEqual(moveTab(tabs, third.id, first.id).map(t => t.id), [third.id, first.id, second.id])
let many = pinned
for (let index = 0; index < 50; index++) many = visitTab(many, workspaceTab('/chat', `?session=ses_${index + 2}`))
assert.equal(many.length, 24)
assert.equal(many[0].id, first.id)
assert.equal(many.at(-1).sessionId, 'ses_51')
console.log('Workspace navigation: privacy-safe identities, duplicate prevention, close recovery, pinning, reorder and tab bounds passed.')
