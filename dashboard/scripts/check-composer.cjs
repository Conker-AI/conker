// The calm composer: text box, Agent, Mode, voice typing and Send on the bar; everything else behind one More
// control that names what differs from the defaults; worded starters; no stray box around the text box.
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

const more = load('src/components/chat/composer-more.ts', { react: React })
const h = React.createElement

// Actions the chat hands over: marked controls go behind More, the rest stay on the bar, in order, with unique keys.
const Access = () => null, Privacy = () => null, Placeholders = () => null, Mic = () => null, Send = () => null
for (const control of [Access, Privacy, Placeholders]) more.belongsBehindMore(control)
const split = more.splitComposerActions(h(React.Fragment, null,
  h(React.Fragment, null, h(React.Fragment, null, h(Access, { key: 'access:a' }), h(Privacy, { key: 'privacy:a' })), h(Placeholders), null, h(Mic)),
  h(Send)))
assert.deepEqual(split.more.map(element => element.type), [Access, Privacy, Placeholders], 'Access, Incognito and the call notes go behind More in their order')
assert.deepEqual(split.bar.map(element => element.type), [Mic, Send], 'Voice typing and Send stay on the bar in their order')
const keys = [...split.more, ...split.bar].map(element => element.key)
assert.equal(new Set(keys).size, keys.length, 'Every moved control keeps a unique key')
assert.ok(keys[0].includes('access') && keys[1].includes('privacy'), 'Explicit keys survive, so a chat switch remounts its controls')
const again = more.splitComposerActions(h(React.Fragment, null, h(React.Fragment, null, null, h(Placeholders), null, h(Mic)), h(Send)))
assert.equal(again.bar[0].key, split.bar[0].key, 'A missing chat control does not shift the bar keys (voice typing is not remounted)')
assert.deepEqual(more.splitComposerActions(null), { bar: [], more: [] })

// More names only what differs from a default, in the order of the controls behind it.
let values = {}
values = more.withMoreValue(values, 'incognito', 'Incognito')
values = more.withMoreValue(values, 'think', 'Think')
values = more.withMoreValue(values, 'model', 'Claude Opus')
assert.deepEqual(more.moreSummary(values), ['Claude Opus', 'Think', 'Incognito'])
assert.equal(more.withMoreValue(values, 'think', 'Think'), values, 'An unchanged value keeps the same object (no extra render)')
values = more.withMoreValue(values, 'think', null)
values = more.withMoreValue(values, 'model', '')
assert.deepEqual(more.moreSummary(values), ['Incognito'], 'Back to default is no longer named')

// The frame: More holds the settings and the moved actions, stays mounted, and the bar keeps the rest.
const composer = read('src/components/chat/composer.tsx')
assert.match(composer, /const \{ bar, more \} = splitComposerActions\(actions\)/)
assert.match(composer, /<ComposerMore values=\{named\}>\{settings\}[^\n]*\{more\}<\/ComposerMore>/, 'Settings and the moved actions sit behind More')
assert.match(composer, /portalProps=\{\{ keepMounted: true \}\}/, 'Controls behind More stay mounted, so they keep their state and their values')
assert.match(composer, /<div className="ml-auto flex shrink-0 items-center gap-1">\{bar\}<\/div>/, 'Only voice typing and Send (or Stop) stay at the end of the bar')
assert.match(composer, /<ComposerMoreContext\.Provider value=\{report\}>/)
assert.match(composer, /sm:hidden">\{named\.join\(' · '\)\}<\/p>/, 'On a phone, the values More names show in a line above the bar')
assert.doesNotMatch(composer, /useIsMobile|ComposerSettings/, 'One More control on every screen size, not a phone-only fold')
assert.doesNotMatch(composer, /<Button[^>]*type="button"[^>]*variant="outline"[^>]*aria-label="More/, 'More is plain, not outlined: only Agent and Mode are outlined')
// The ui Textarea styles its wrapper span; the composer drops that box and styles the field itself.
assert.match(composer, /<Textarea [^\n]*unstyled className="block \[&>textarea\]:[^"]*\[&>textarea\]:resize-none/, 'No square box around the text box and no resize grip')
assert.doesNotMatch(composer, /className="max-h-\[min[^"]*rounded-none border-0/, 'Field styles never go to the wrapper again')
assert.match(composer, /enterKeyHint=\{enterSends \? 'send' : 'enter'\}/, 'Phones keep Enter for a new line')

// Each control behind More says what it is set to, and the chat's own switches mark themselves for More.
for (const [file, id] of [['template-composer.tsx', 'template'], ['model-picker.tsx', 'model'], ['skill-picker.tsx', 'skills'], ['think-control.tsx', 'think'], ['session-access-control.tsx', 'access'], ['privacy-control.tsx', 'incognito'], ['new-chat-privacy-control.tsx', 'incognito']])
  assert.match(read(`src/components/gateway/${file}`), new RegExp(`useComposerMoreValue\\('${id}'`), `${file} reports its value to More`)
for (const [file, name] of [['session-access-control.tsx', 'GatewaySessionAccessControl'], ['privacy-control.tsx', 'GatewayPrivacyControl'], ['new-chat-privacy-control.tsx', 'NewChatPrivacyControl'], ['new-chat-extras.tsx', 'NewChatMediaPlaceholders']])
  assert.match(read(`src/components/gateway/${file}`), new RegExp(`belongsBehindMore\\(${name}\\)`), `${name} sits behind More`)
// Behind More, access and incognito say their state in words, not a bare shield or glasses.
assert.match(read('src/components/gateway/session-access-control.tsx'), /<ShieldCheck className="size-4" \/>Access: \{label\}/)
for (const file of ['privacy-control.tsx', 'new-chat-privacy-control.tsx'])
  assert.match(read(`src/components/gateway/${file}`), /<HatGlasses className="size-4" \/>Incognito: \{active \? 'on' : 'off'\}/)

// Starters are words, not five bare icons; they fill the box and never send.
const extras = read('src/components/gateway/new-chat-extras.tsx')
assert.match(extras, /\{starters\.map\(item => <Button key=\{item\.label\} type="button"[^\n]*onClick=\{\(\) => onPick\(item\.text\)\}><item\.icon[^>]*\/>\{item\.label\}<\/Button>\)\}/, 'Each starter shows its words')
assert.doesNotMatch(extras, /Tooltip|aria-label=\{item\.label\}/, 'No icon-only starters behind tooltips')
assert.equal((extras.match(/\{ label: '/g) ?? []).length, 5)

console.log('Composer: bar keeps Agent, Mode, voice typing and Send; More holds the rest with its values; worded starters; no stray box passed.')
