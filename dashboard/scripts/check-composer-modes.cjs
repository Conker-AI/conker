const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
class GatewayError extends Error { constructor(kind) { super(kind); this.kind = kind } }
function load(file, deps = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', compiled.outputText)(name => { if (name in deps) return deps[name]; throw new Error(`Unexpected runtime import ${name}`) }, loaded, loaded.exports)
  return loaded.exports
}

const modes = load('src/components/gateway/composer-mode.ts')
const auto = load('src/lib/gateway/auto-settings.ts', { './transport': { GatewayError } })
const proposal = { complexity: 'hard', think: true, research: 'web', reasons: { complexity: 'Careful comparison.', think: 'Trade-offs.', research: 'Prices change.' }, modelId: 'jev' }

const layout = { top: [{ id: 'm-opus', name: 'Opus 5.5', number: 1 }, { id: 'm-sonnet', name: 'Sonnet 5.5', number: 3 }, { id: 'm-haiku', name: 'Haiku 5.5', number: 4 }], more: [] }
const values = (over = {}) => ({ think: false, research: 'off', effort: 'auto', modelId: '', ...over })
const fast = { think: false, research: 'off', effort: 'light', modelId: 'm-haiku' }
const deep = { think: true, research: 'deep', effort: 'high', modelId: 'm-opus' }

assert.deepEqual(modes.composerModes.map(mode => mode.id), ['auto', 'fast', 'balanced', 'deep'])
assert.deepEqual(modes.modePresets.deep, { tier: 'opus', effort: 'high', think: true, research: 'deep' })
assert.deepEqual(modes.modePresets.fast, { tier: 'haiku', effort: 'light', think: false, research: 'off' })
assert.equal(modes.tierModelId(layout, 'sonnet'), 'm-sonnet')
assert.equal(modes.tierModelId({ top: [], more: [] }, 'opus'), null, 'A tier the list lacks has no model')
assert.equal(modes.modeTarget('auto', null, true, layout), null, 'Auto has no values until the routing model answers')
assert.deepEqual(modes.modeTarget('deep', null, false, layout), { think: false, research: 'deep', effort: 'high', modelId: 'm-opus' }, 'Thinking only where available')
assert.equal(modes.offersModel(layout, 'm-opus'), true)
assert.equal(modes.offersModel(layout, 'jev'), false, 'Auto never sets a model that is not on the list')
assert.equal(modes.effectiveMode('auto', values(), null, true, layout), 'auto')
assert.equal(modes.effectiveMode('auto', values({ think: true, research: 'web', modelId: 'jev' }), proposal, true, layout), 'auto', 'An Auto proposal with no effort leaves the effort alone')
assert.equal(modes.effectiveMode('auto', values({ think: true, research: 'web', effort: 'high', modelId: 'jev' }), { ...proposal, effort: 'high' }, true, layout), 'auto')
assert.equal(modes.effectiveMode('auto', values({ think: true, research: 'web', effort: 'light', modelId: 'jev' }), { ...proposal, effort: 'high' }, true, layout), 'custom', 'A changed effort shows Custom')
assert.equal(modes.effectiveMode('auto', values({ think: false, research: 'web', modelId: 'jev' }), proposal, true, layout), 'custom', 'Changing a proposed value shows Custom')
assert.equal(modes.effectiveMode('fast', fast, null, true, layout), 'fast')
assert.equal(modes.effectiveMode('fast', { ...fast, research: 'web' }, null, true, layout), 'custom')
assert.equal(modes.effectiveMode('fast', { ...fast, modelId: 'm-opus' }, null, true, layout), 'custom', 'Another model shows Custom')
assert.equal(modes.effectiveMode('fast', { ...fast, effort: 'max' }, null, true, layout), 'custom', 'Another effort shows Custom')
assert.equal(modes.effectiveMode('fast', { ...fast, modelId: 'anything' }, null, true, { top: [], more: [] }), 'fast', 'With no model for the tier, any model matches')
assert.equal(modes.effectiveMode('deep', { ...deep, think: false }, null, false, layout), 'deep', 'Unavailable thinking does not force Custom')
assert.equal(modes.modeLabel('custom'), 'Custom')

assert.deepEqual(auto.parseAutoSettings(proposal), proposal)
// Effort comes with its reason or not at all.
const withEffort = { ...proposal, effort: 'high', reasons: { ...proposal.reasons, effort: 'A hard question.' } }
assert.deepEqual(auto.parseAutoSettings(withEffort), withEffort)
for (const bad of [{ ...proposal, effort: 'high' }, { ...proposal, reasons: { ...proposal.reasons, effort: 'x' } }, { ...withEffort, effort: 'extreme' }, { ...withEffort, reasons: { ...withEffort.reasons, effort: ' ' } }]) assert.throws(() => auto.parseAutoSettings(bad))
for (const broken of [
  { ...proposal, complexity: 'medium' }, { ...proposal, research: 'maybe' }, { ...proposal, think: 'yes' }, { ...proposal, modelId: '' },
  { ...proposal, reasons: { complexity: 'x', think: 'y' } }, { ...proposal, reasons: { ...proposal.reasons, extra: 'z' } },
  { ...proposal, reasons: { ...proposal.reasons, research: ' ' } }, { ...proposal, reasons: { ...proposal.reasons, think: 'x'.repeat(161) } }, null, [],
]) assert.throws(() => auto.parseAutoSettings(broken), error => error.kind === 'validation')

;(async () => {
  const calls = []
  const client = auto.createAutoSettingsClient({ request: async (target, options) => { calls.push({ target, options }); return proposal } })
  assert.deepEqual(await client.propose('Best laptop?', { sessionId: 'ses_1', harnessDisabled: true }), proposal)
  assert.deepEqual(calls[0], { target: '/api/pi/models/auto-settings', options: { method: 'POST', body: { text: 'Best laptop?', session_id: 'ses_1', harness_disabled: true } } })

  const workspace = ['runtime-workspace', 'new-chat-view', 'open-chat-view'].map(name => fs.readFileSync(path.join(root, `src/components/gateway/${name}.tsx`), 'utf8')).join('\n')
  assert.equal((workspace.match(/<ComposerModeProvider /g) ?? []).length, 2, 'Both composers carry the mode state')
  assert.equal((workspace.match(/<ModePresetControl \/>/g) ?? []).length, 2, 'Both composers carry the presets')
  for (const chip of ['ThinkControl', 'SearchControl']) assert.equal((workspace.match(new RegExp(`<${chip}[ />]`, 'g')) ?? []).length, 2, `Both composers carry the ${chip} chip`)
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'src/components/gateway/mode-control.tsx'), 'utf8'), /Switch|Setting label/, 'The Mode popover holds presets only; every setting has its chip')
  assert.doesNotMatch(workspace, /isAnalysis|Complexity/, 'There is no Difficulty setting: effort is the one dial')
  const control = fs.readFileSync(path.join(root, 'src/components/gateway/mode-control.tsx'), 'utf8')
  assert.doesNotMatch(control, /setInterval|Math\.random/, 'Auto shows only what the routing model returned')
  for (const file of ['src/components/gateway/mode-control.tsx', 'src/components/gateway/composer-mode.ts']) assert.doesNotMatch(fs.readFileSync(path.join(root, file), 'utf8'), /Jev/, `${file} names no unset placeholder name`)
  console.log('Composer modes: presets, Custom detection, strict proposals, request shape and both send paths passed.')
})().catch(error => { console.error(error); process.exit(1) })
