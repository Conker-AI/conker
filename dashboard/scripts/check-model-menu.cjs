// The composer's one model button: its menu names the Claude models with their numbers, Effort is a submenu of
// that menu (no Effort chip), the label never carries the provider, and call buttons are toolbar buttons.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
function load(file) {
  const compiled = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', compiled.outputText)(name => { throw new Error(`Unexpected runtime import ${name}`) }, loaded, loaded.exports)
  return loaded.exports
}
const { claudeModels, NUMBERED, CLAUDE_PROVIDER_ID, hasClaudePlan, missingClaudeModels, addClaudeModels, modelMenuLayout } = load('src/lib/gateway/claude-models.ts')

const role = (modelId, eligible) => ({ enabled: true, eligibleModelIds: eligible, modelId, timeoutMs: 30000, failure: 'stop', fallbackModelIds: [], followAnswer: false })
const entry = (id, route, name, providerId = CLAUDE_PROVIDER_ID, enabled = true) => ({ id, providerId, name, route, enabled, routingDescription: '' })
const catalogue = (models, answerIds = models.map(model => model.id), providers = [{ id: 'ollama', name: 'Local (Ollama)', enabled: true }, { id: CLAUDE_PROVIDER_ID, name: 'Claude Code subscription', enabled: true }]) => ({
  providers, models, defaultModelId: models[0]?.id ?? null, roleSettings: { answerMode: 'manual', roles: { answer: role(models[0]?.id ?? null, answerIds) } },
})
const qwen = entry('qwen-small', 'qwen2.5:3b', 'Qwen 2.5 3B', 'ollama')
const selectable = config => config.models.filter(model => config.roleSettings.roles.answer.eligibleModelIds.includes(model.id) && model.enabled)

// The list: the four current models first with the 1-4 keys, then the older ones; every id is the exact Anthropic id.
assert.deepEqual(claudeModels.slice(0, NUMBERED).map(model => [model.name, model.route]), [['Opus 5.5', 'claude-opus-5-5'], ['Fable 5.2', 'claude-fable-5-2'], ['Sonnet 5.5', 'claude-sonnet-5-5'], ['Haiku 5.5', 'claude-haiku-5-5']])
assert.equal(NUMBERED, 4)
assert.deepEqual(claudeModels.slice(NUMBERED).map(model => model.name), ['Fable 5.1', 'Haiku 4.5', 'Sonnet 5', 'Opus 5', 'Fable 5', 'Opus 4.8', 'Opus 4.7', 'Opus 4.6', 'Sonnet 4.6'])
assert.ok(claudeModels.every(model => /^claude-[a-z]+(-\d+)+$/.test(model.route) && !/\d{8}/.test(model.route)), 'Exact ids carry no date suffix and no alias')
assert.equal(new Set(claudeModels.map(model => model.route)).size, claudeModels.length)

// A complete list: numbers 1-4 on the current models, older ones and Qwen under More models, no provider in any name.
const complete = catalogue([...claudeModels.map(model => entry(model.route, model.route, model.name)), qwen])
let layout = modelMenuLayout(complete, selectable(complete))
assert.deepEqual(layout.top.map(row => [row.name, row.number, row.id]), [['Opus 5.5', 1, 'claude-opus-5-5'], ['Fable 5.2', 2, 'claude-fable-5-2'], ['Sonnet 5.5', 3, 'claude-sonnet-5-5'], ['Haiku 5.5', 4, 'claude-haiku-5-5']])
assert.deepEqual(layout.more.map(row => row.name), [...claudeModels.slice(NUMBERED).map(model => model.name), 'Qwen 2.5 3B'])
assert.ok([...layout.top, ...layout.more].every(row => !/subscription|Claude Code/i.test(row.name)), 'Rows never carry the provider unless two look the same')
assert.equal(missingClaudeModels(complete).length, 0)

// Models the list does not hold yet stay in their place, unselectable, until they are added.
const aliases = catalogue([entry('claude-sonnet', 'sonnet', 'Claude Sonnet'), entry('claude-haiku', 'haiku', 'Claude Haiku'), qwen])
layout = modelMenuLayout(aliases, selectable(aliases))
assert.deepEqual(layout.top.map(row => [row.name, row.id]), [['Opus 5.5', null], ['Fable 5.2', null], ['Sonnet 5.5', null], ['Haiku 5.5', null]], 'Unadded models are shown without an id, so they cannot be chosen')
assert.deepEqual(layout.more.map(row => row.name), ['Claude Sonnet', 'Claude Haiku', 'Qwen 2.5 3B'], 'Alias entries are not passed off as a version')
assert.equal(missingClaudeModels(aliases).length, claudeModels.length)

// Adding is one explicit, immutable change: every exact model on and allowed to answer, nothing else touched.
const before = JSON.stringify(aliases)
const added = addClaudeModels(aliases)
assert.equal(JSON.stringify(aliases), before, 'The saved catalogue object is not mutated')
assert.equal(added.models.length, aliases.models.length + claudeModels.length)
assert.deepEqual(added.models.slice(0, 3), aliases.models, 'Existing entries keep their place and content')
assert.deepEqual(added.roleSettings.roles.answer.eligibleModelIds.slice(0, 3), ['claude-sonnet', 'claude-haiku', 'qwen-small'])
assert.ok(claudeModels.every(model => added.roleSettings.roles.answer.eligibleModelIds.includes(model.route)))
assert.equal(added.roleSettings.roles.answer.modelId, aliases.roleSettings.roles.answer.modelId, 'The answer model does not change')
assert.equal(missingClaudeModels(added).length, 0)
assert.deepEqual(addClaudeModels(added), added, 'Adding twice changes nothing')
const clash = catalogue([entry('claude-opus-5-5', 'opus', 'Opus alias'), qwen])
const clashed = addClaudeModels(clash)
assert.equal(new Set(clashed.models.map(model => model.id)).size, clashed.models.length, 'A taken id never collides')
const off = catalogue([entry('claude-opus-5-5', 'claude-opus-5-5', 'Opus 5.5', CLAUDE_PROVIDER_ID, false)], [])
assert.equal(addClaudeModels(off).models.find(model => model.id === 'claude-opus-5-5').enabled, true, 'A switched-off entry is switched on')
assert.ok(addClaudeModels(off).roleSettings.roles.answer.eligibleModelIds.includes('claude-opus-5-5'))

// Without a Claude plan there is no Claude section: the first four models the owner has take the numbers.
const local = catalogue([qwen, entry('qwen-4b', 'qwen3:4b', 'Qwen 3 4B', 'ollama')], undefined, [{ id: 'ollama', name: 'Local (Ollama)', enabled: true }])
assert.equal(hasClaudePlan(local), false)
layout = modelMenuLayout(local, selectable(local))
assert.deepEqual(layout.top.map(row => [row.name, row.number]), [['Qwen 2.5 3B', 1], ['Qwen 3 4B', 2]])
assert.deepEqual(layout.more, [])

// The provider joins a name only where two entries would look the same.
const twins = catalogue([entry('a', 'x', 'Llama', 'ollama'), entry('b', 'y', 'Llama', 'router')], undefined, [{ id: 'ollama', name: 'Local', enabled: true }, { id: 'router', name: 'OpenRouter', enabled: true }])
assert.deepEqual(modelMenuLayout(twins, selectable(twins)).top.map(row => row.name), ['Llama · Local', 'Llama · OpenRouter'])

// The menu itself: number keys, Effort and More models as submenus, effort set from the menu and no Effort chip.
const menu = read('src/components/gateway/model-menu.tsx')
assert.match(menu, /\/\^\[1-9\]\$\/\.test\(event\.key\)/, 'Number keys choose a model')
assert.match(menu, /menu-sub-content/, 'Keys typed in a submenu are left to it')
assert.match(menu, /<DropdownMenuSubTrigger[^>]*><span>Effort<\/span>/, 'Effort is a submenu row')
assert.match(menu, /<DropdownMenuSubTrigger className=\{ROW\}>More models<\/DropdownMenuSubTrigger>/, 'More models is a submenu row')
assert.match(menu, /const ROW = 'max-sm:min-h-11'/, 'Menu rows are 44 px tall on a phone')
assert.equal((menu.match(/className=\{ROW\}/g) ?? []).length, 7, 'Every row kind of the three menus carries the phone height')
assert.doesNotMatch(menu, /sr-only min-w-0 truncate|max-sm:w-9/, 'The label shows on a phone too')
assert.match(menu, /Higher effort means more thorough responses, but takes longer and uses your limits faster\./)
assert.doesNotMatch(menu, /Extra|Ultracode/, 'Only the effort values Conker has')
const effort = read('src/components/gateway/use-chat-effort.ts')
assert.match(effort, /\['auto', 'Auto'\], \['light', 'Light'\], \['medium', 'Medium'\], \['high', 'High'\], \['max', 'Max'\]/)
assert.match(effort, /saveOutput\(sessionId, \{ \.\.\.saved\.output, effort \}, saved\.revision\)/, 'Effort is saved with the chat output settings')
assert.ok(!fs.existsSync(path.join(root, 'src/components/gateway/chat-effort-control.tsx')), 'The Effort chip is gone')
const picker = read('src/components/gateway/model-picker.tsx')
assert.doesNotMatch(picker, /configuredProvider|\$\{provider/, 'The label never carries the provider')
assert.match(picker, /composerItem\(GatewayModelPicker, 'model'\)/)
for (const file of ['new-chat-view.tsx', 'open-chat-view.tsx']) {
  const source = read(`src/components/gateway/${file}`)
  assert.doesNotMatch(source, /ChatEffortControl/, `${file} has no Effort chip`)
  assert.match(source, /<GatewayModelPicker[^\n]+effort=\{/, `${file} gives the model button the chat's effort`)
}

// Voice and video call: two toolbar buttons with the reason as a tooltip, not text in the overflow menu.
const calls = read('src/components/gateway/new-chat-extras.tsx')
assert.match(calls, /title=\{voice\}/)
assert.match(calls, /title=\{video\}/)
assert.match(calls, /composerItem\(NewChatCallButtons, 'media'\)/)
assert.doesNotMatch(calls, /<p[^>]*>(Voice call|Video calls)/, 'No explanatory lines inside the overflow menu')

console.log('Model menu: Claude models with number keys, exact ids, Effort and More models as submenus, one button, call buttons passed.')
