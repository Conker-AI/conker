const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'src/lib/inbox-buttons.ts'), 'utf8')
const loaded = { exports: {} }
new Function('require', 'module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(() => { throw new Error('Inbox buttons must have no runtime dependencies') }, loaded, loaded.exports)
const { cardTemplates, cardLabels, isCardTemplate } = loaded.exports

// Test cardTemplates is exactly the expected set in the right order
assert.deepEqual(cardTemplates, ['do', 'send', 'publish', 'ship', 'run', 'delete', 'pay', 'save'])

// Test Object.keys(cardLabels) holds the same set as cardTemplates
assert.deepEqual(Object.keys(cardLabels), cardTemplates)

// Test every yes and no is a non-empty trimmed string, and yes !== no for each
for (const template of cardTemplates) {
  const labels = cardLabels[template]
  assert(typeof labels.yes === 'string' && labels.yes.length > 0 && labels.yes === labels.yes.trim(), `${template} yes label must be non-empty trimmed string`)
  assert(typeof labels.no === 'string' && labels.no.length > 0 && labels.no === labels.no.trim(), `${template} no label must be non-empty trimmed string`)
  assert.notEqual(labels.yes, labels.no, `${template} yes and no labels must be different`)
}

// Test no yes label is "Change"
for (const template of cardTemplates) {
  assert.notEqual(cardLabels[template].yes, 'Change', `${template} yes label must not be "Change"`)
}

// Test isCardTemplate is true for each template
for (const template of cardTemplates) {
  assert.equal(isCardTemplate(template), true, `${template} should be recognized as card template`)
}

// Test isCardTemplate is false for invalid inputs
for (const value of ['change', 'Do', '', null, undefined, 1, ['do'], 'toString', 'constructor']) {
  assert.equal(isCardTemplate(value), false, `${JSON.stringify(value)} should not be recognized as card template`)
}

assert.doesNotMatch(source, /^\s*import\s/m, 'Inbox buttons has no imports')
console.log('Inbox buttons: eight fixed templates, each with its own yes and no.')