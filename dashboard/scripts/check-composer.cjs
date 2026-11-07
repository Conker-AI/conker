// The composer toolbar: Agent, Mode, voice typing and Send stay on the bar; each other control is its own compact
// item that folds into one "…" overflow menu in a fixed order when the bar gets narrow; worded starters; no stray box.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')

const root = path.resolve(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
function load(file, deps = {}) {
  const compiled = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', compiled.outputText)(name => { if (name in deps) return deps[name]; throw new Error(`Unexpected runtime import ${name}`) }, loaded, loaded.exports)
  return loaded.exports
}

const items = load('src/components/chat/composer-items.ts', { react: React })
const h = React.createElement

// Registered items are found in settings and actions, sorted by bar order; the rest keeps its order and unique keys.
const Model = () => null, Think = () => null, Access = () => null, Privacy = () => null, Mic = () => null, Send = () => null
items.composerItem(Model, 'model'); items.composerItem(Think, 'think'); items.composerItem(Access, 'access'); items.composerItem(Privacy, 'incognito')
const split = items.splitComposerItems(h(Think), h(React.Fragment, null,
  h(React.Fragment, null, h(Privacy, { key: 'privacy:a' }), h(Access, { key: 'access:a' })), null, h(Model), h(Mic), h(Send)))
assert.deepEqual(split.items.map(item => item.id), ['model', 'think', 'access', 'incognito'], 'Items follow the bar order, wherever the chat passed them')
assert.deepEqual(split.actions.map(element => element.type), [Mic, Send], 'Voice typing and Send stay at the end in their order')
const keys = [...split.items.map(item => item.node), ...split.actions].map(element => element.key)
assert.equal(new Set(keys).size, keys.length, 'Every control keeps a unique key')
assert.ok(keys.some(key => key.includes('access')) && keys.some(key => key.includes('privacy')), 'Explicit keys survive, so a chat switch remounts its controls')
assert.deepEqual(items.splitComposerItems(null, null), { items: [], actions: [] })

// Fold order: every item but the model folds below its own width, the least used first.
assert.deepEqual(Object.keys(items.FOLD_BELOW).sort(), items.composerItemIds.filter(id => id !== 'model').sort(), 'Every item except the model has a fold width')
assert.ok(!('model' in items.FOLD_BELOW), 'The model never folds')
assert.ok(items.FOLD_BELOW.media > items.FOLD_BELOW.incognito && items.FOLD_BELOW.output > items.FOLD_BELOW.access, 'Media folds first, access last')

// The fold line and overflow name only what differs from a default, in bar order.
let values = {}
values = items.withItemValue(values, 'incognito', 'Incognito')
values = items.withItemValue(values, 'think', 'Think')
values = items.withItemValue(values, 'model', 'Claude Opus')
assert.deepEqual(items.itemSummary(values), ['Claude Opus', 'Think', 'Incognito'])
assert.equal(items.withItemValue(values, 'think', 'Think'), values, 'An unchanged value keeps the same object (no extra render)')
values = items.withItemValue(values, 'think', null)
values = items.withItemValue(values, 'model', '')
assert.deepEqual(items.itemSummary(values), ['Incognito'], 'Back to default is no longer named')

// The frame: no single More dialog; one measured row that never wraps; the overflow stays mounted.
const composer = read('src/components/chat/composer.tsx')
assert.doesNotMatch(composer, /ComposerMore|>More</, 'No single More dialog')
assert.match(composer, /new ResizeObserver\(/, 'The toolbar width is measured')
assert.match(composer, /id !== 'model' && toolbarWidth < FOLD_BELOW\[id\]/, 'Items fold by the measured width; the model never folds')
assert.match(composer, /portalProps=\{\{ keepMounted: true \}\}/, 'Folded controls stay mounted, so they keep their state and values')
assert.match(composer, /aria-label="More options"/)
assert.match(composer, /<MoreHorizontal /, 'The overflow is a plain "…" button')
assert.match(composer, /ref=\{toolbar\} className="flex min-w-0 flex-nowrap/, 'The toolbar row never wraps')
assert.match(composer, /<ComposerItemContext\.Provider value=\{report\}>/)
assert.match(composer, /<div className="ml-auto flex shrink-0 items-center gap-1">\{bar\}<\/div>/, 'Voice typing and Send (or Stop) stay at the end of the bar')
// The ui Textarea styles its wrapper span; the composer drops that box and styles the field itself.
assert.match(composer, /<Textarea [^\n]*unstyled className="block \[&>textarea\]:[^"]*\[&>textarea\]:resize-none/, 'No square box around the text box and no resize grip')
assert.doesNotMatch(composer, /className="max-h-\[min[^"]*rounded-none border-0/, 'Field styles never go to the wrapper again')
assert.match(composer, /enterKeyHint=\{enterSends \? 'send' : 'enter'\}/, 'Phones keep Enter for a new line')

// Each control registers itself, reports its value and shows when it differs from the default.
for (const [file, id] of [['template-composer.tsx', 'template'], ['model-picker.tsx', 'model'], ['skill-picker.tsx', 'skills'], ['chat-output-control.tsx', 'output'], ['think-control.tsx', 'think'], ['session-access-control.tsx', 'access'], ['privacy-control.tsx', 'incognito'], ['new-chat-privacy-control.tsx', 'incognito']]) {
  const source = read(`src/components/gateway/${file}`)
  assert.match(source, new RegExp(`composerItem\\(\\w+, '${id}'\\)`), `${file} is the ${id} item`)
  assert.match(source, new RegExp(`useComposerValue\\('${id}'`), `${file} reports its value`)
  if (id !== 'model') assert.match(source, /aria-pressed=/, `${file} says whether it is set`)
}
assert.match(read('src/components/gateway/new-chat-extras.tsx'), /composerItem\(NewChatMediaPlaceholders, 'media'\)/)

// Language level is a four-stop control inside the Output popover.
const output = read('src/components/gateway/chat-output-control.tsx')
for (const stop of ['strict', 'plain', 'normal', 'deep']) assert.match(output, new RegExp(`'${stop}'`), `Output offers ${stop}`)

// Starters are words, not five bare icons; they fill the box and never send.
const extras = read('src/components/gateway/new-chat-extras.tsx')
assert.match(extras, /\{starters\.map\(item => <Button key=\{item\.label\} type="button"[^\n]*onClick=\{\(\) => onPick\(item\.text\)\}><item\.icon[^>]*\/>\{item\.label\}<\/Button>\)\}/, 'Each starter shows its words')
assert.doesNotMatch(extras, /Tooltip|aria-label=\{item\.label\}/, 'No icon-only starters behind tooltips')
assert.equal((extras.match(/\{ label: '/g) ?? []).length, 5)

console.log('Composer: one item per control, folded into "…" by width in a fixed order, values named; worded starters; no stray box passed.')
