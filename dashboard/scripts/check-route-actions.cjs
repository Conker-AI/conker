const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const root = path.resolve(__dirname, '..')

function load(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', compiled)(name => {
    if (name === 'react') return React
    throw new Error(`Unexpected import ${name}`)
  }, module, module.exports)
  return module.exports
}
const { splitActionLabel } = load('src/lib/route-actions.ts')
const chrome = fs.readFileSync(path.join(root, 'src/components/design-system/workspace-chrome.tsx'), 'utf8')

let checks = 0
function check(name, test) { test(); checks++; process.stdout.write(`PASS ${name}\n`) }

check('Words become the label and leave no icons', () => {
  assert.deepEqual(splitActionLabel(['New chat']), { label: 'New chat', icons: [] })
})
check('An icon is kept apart from the words', () => {
  const { label, icons } = splitActionLabel([React.createElement('svg', { key: 'i' }), ' New chat'])
  assert.equal(label, 'New chat')
  assert.equal(icons.length, 1)
  assert.equal(icons[0].type, 'svg')
})
check('Spaces are trimmed and collapsed', () => {
  assert.equal(splitActionLabel([' New ', ' chat ']).label, 'New chat')
  assert.equal(splitActionLabel(['Alexey', "'s notes"]).label, "Alexey's notes")
})
check('Numbers count as words, empty children give nothing', () => {
  assert.equal(splitActionLabel([3, ' new']).label, '3 new')
  assert.deepEqual(splitActionLabel(null), { label: '', icons: [] })
})
check('On a phone the kept action turns icon-only and keeps its words as its name', () => {
  assert.match(chrome, /splitActionLabel\(item\.props\.children\)/)
  assert.match(chrome, /cloneElement\([^)]*\{ iconOnly: true, 'aria-label': name, title: name, children: icons \}\)/)
  assert.match(chrome, /if \(!icons\.length\) return item/)
})
check('The kept action group never shrinks under the title', () => {
  assert.ok(chrome.includes('className="flex shrink-0 items-center gap-1"'))
})

console.log(`Route actions: phone keeps the main action as a labelled icon (${checks} checks).`)
