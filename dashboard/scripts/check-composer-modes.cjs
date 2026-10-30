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

assert.deepEqual(modes.composerModes.map(mode => mode.id), ['auto', 'fast', 'balanced', 'deep'])
assert.deepEqual(modes.modePresets.deep, { complexity: 'hard', think: true, research: 'deep' })
assert.equal(modes.modeTarget('auto', null, true), null, 'Auto has no values until the routing model answers')
assert.deepEqual(modes.modeTarget('deep', null, false), { complexity: 'hard', think: false, research: 'deep' }, 'Thinking only where available')
assert.equal(modes.effectiveMode('auto', { complexity: 'easy', think: false, research: 'off' }, null, true), 'auto')
assert.equal(modes.effectiveMode('auto', { complexity: 'hard', think: true, research: 'web' }, proposal, true), 'auto')
assert.equal(modes.effectiveMode('auto', { complexity: 'easy', think: true, research: 'web' }, proposal, true), 'custom', 'Changing a proposed value shows Custom')
assert.equal(modes.effectiveMode('fast', { complexity: 'easy', think: false, research: 'off' }, null, true), 'fast')
assert.equal(modes.effectiveMode('fast', { complexity: 'easy', think: false, research: 'web' }, null, true), 'custom')
assert.equal(modes.effectiveMode('deep', { complexity: 'hard', think: false, research: 'deep' }, null, false), 'deep', 'Unavailable thinking does not force Custom')
assert.equal(modes.modeLabel('custom'), 'Custom')
assert.deepEqual(modes.complexityHints('hard'), { isAnalysis: true })
assert.deepEqual(modes.complexityHints('easy'), {})

assert.deepEqual(auto.parseAutoSettings(proposal), proposal)
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

  const workspace = fs.readFileSync(path.join(root, 'src/components/gateway/runtime-workspace.tsx'), 'utf8')
  assert.equal((workspace.match(/<ModeControl /g) ?? []).length, 2, 'Both composers carry the mode control')
  assert.match(workspace, /promotedDraft\.researchMode, Boolean\(modeHints\.current\.new\?\.isAnalysis\)\)/, 'A new chat sends the complexity chosen on its draft')
  assert.match(workspace, /saved\.researchMode, Boolean\(modeHints\.current\[id\]\?\.isAnalysis\)\)/, 'Replies send the complexity on screen')
  const runtime = fs.readFileSync(path.join(root, 'src/lib/gateway/runtime.ts'), 'utf8')
  assert.match(runtime, /options\.isAnalysis \? \{ is_analysis: true \}/, 'Hard complexity travels as Pi\'s analysis hint')
  const control = fs.readFileSync(path.join(root, 'src/components/gateway/mode-control.tsx'), 'utf8')
  assert.doesNotMatch(control, /setInterval|Math\.random/, 'Auto shows only what the routing model returned')
  for (const file of ['src/components/gateway/mode-control.tsx', 'src/components/gateway/composer-mode.ts']) assert.doesNotMatch(fs.readFileSync(path.join(root, file), 'utf8'), /Jev/, `${file} names no unset placeholder name`)
  console.log('Composer modes: presets, Custom detection, strict proposals, request shape and both send paths passed.')
})().catch(error => { console.error(error); process.exit(1) })
