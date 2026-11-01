const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'src/lib/conversation-research.ts'), 'utf8')
const loaded = { exports: {} }
new Function('require', 'module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(() => { throw new Error('Conversation research must have no runtime dependencies') }, loaded, loaded.exports)
const { normalizeResearchMode, researchLabel } = loaded.exports

// Test normalizeResearchMode with valid inputs
assert.equal(normalizeResearchMode(undefined), 'off')
assert.equal(normalizeResearchMode('off'), 'off')
assert.equal(normalizeResearchMode('web'), 'web')
assert.equal(normalizeResearchMode('deep'), 'deep')

// Test normalizeResearchMode with invalid inputs that should throw
for (const value of [null, '', 'Web', 'DEEP', 1, {}]) {
  assert.throws(() => normalizeResearchMode(value), {
    message: 'Choose Off, Web, or Deep research.'
  })
}

// Test researchLabel function
assert.equal(researchLabel(), 'Research off')
assert.equal(researchLabel('web'), 'Web')
assert.equal(researchLabel('deep'), 'Deep research')
assert.equal(researchLabel('off'), 'Research off')

assert.doesNotMatch(source, /^\s*import\s/m, 'Conversation research has no imports')
console.log('Research mode: only off, web and deep pass; labels as shown.')