const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'src/lib/tool-draft-id.ts'), 'utf8')
const loaded = { exports: {} }
new Function('require', 'module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(() => { throw new Error('Tool draft id must have no runtime dependencies') }, loaded, loaded.exports)
const { toolDraftId } = loaded.exports

// Test cases from the brief
assert.strictEqual(toolDraftId('Study group digest', 'a1b2c3d4'), 'study-group-digest-a1b2c3d4')
assert.strictEqual(toolDraftId('  Café  Menu!!  ', 'a1b2c3d4'), 'cafe-menu-a1b2c3d4')
assert.strictEqual(toolDraftId('2024 report', 'a1b2c3d4'), 'tool-2024-report-a1b2c3d4')
assert.strictEqual(toolDraftId('', 'a1b2c3d4'), 'tool-a1b2c3d4')
assert.strictEqual(toolDraftId('!!!', 'a1b2c3d4'), 'tool-a1b2c3d4')
assert.strictEqual(toolDraftId('日本語', 'a1b2c3d4'), 'tool-a1b2c3d4')
assert.strictEqual(toolDraftId('A_B c', 'a1b2c3d4'), 'a-b-c-a1b2c3d4')

// Test long names
const longA = 'a'.repeat(100)
assert.strictEqual(toolDraftId(longA, 'a1b2c3d4'), 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-a1b2c3d4')

// Eight "word-" fill exactly 40 characters, so the cut leaves a trailing dash to strip.
const longWordsResult = toolDraftId('word '.repeat(20), 'a1b2c3d4')
const slugPart = longWordsResult.slice(0, -9) // Remove -a1b2c3d4 suffix
assert.ok(!longWordsResult.includes('--'), 'Should not contain double dashes')
assert.ok(!slugPart.endsWith('-'), 'Slug part should not end with dash')

// Test all results match the gateway pattern
const testNames = [
  'Study group digest',
  '  Café  Menu!!  ',
  '2024 report',
  '',
  '!!!',
  '日本語',
  'A_B c',
  'ß',
  '../etc/passwd',
  '<script>alert(1)</script>',
  '😀 party',
  'x'.repeat(500)
]

for (const name of testNames) {
  const result = toolDraftId(name, 'a1b2c3d4')
  assert.ok(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(result), `Invalid format for "${name}": ${result}`)
}

// Test error cases
assert.throws(() => toolDraftId('x', ''), RangeError)
assert.throws(() => toolDraftId('x', 'A!'), RangeError)
assert.throws(() => toolDraftId('x', 'abc'), RangeError)

// Check source file assertions
const dialogFile = path.join(root, 'src/components/gateway/new-tool-dialog.tsx')
const dialogContent = fs.readFileSync(dialogFile, 'utf8')

assert.ok(dialogContent.includes('toolDraftId(name.trim(), crypto.randomUUID().slice(0, 8))'), 'Should use toolDraftId with trimmed name and 8-char suffix')
assert.ok(!dialogContent.includes('tool-${crypto.randomUUID()}'), 'Should not contain old UUID pattern')

console.log('Tool draft ids: readable slug plus short suffix, always a valid id.')
