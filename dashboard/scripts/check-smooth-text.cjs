const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'src/lib/chat/smooth-text.ts'), 'utf8')
const loaded = { exports: {} }
new Function('require', 'module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(() => { throw new Error('Smooth text must have no runtime dependencies') }, loaded, loaded.exports)
const { nextReveal, keepPrefix } = loaded.exports

const words = 'word '.repeat(400)

// A big backlog is caught up fast: more than one word per 16 ms frame
assert.ok(nextReveal(0, words, 16) > 5, 'A 2,000-character backlog advances several words in one frame')

// Whole words only: a frame too short for the next word shows nothing new, and time keeps counting
assert.equal(nextReveal(0, 'hello world', 16), 0, 'One character of time does not show half a word')
assert.equal(nextReveal(0, 'hello world', 70), 5, '70 ms at 80 characters a second shows "hello"')
assert.equal(nextReveal(5, 'hello world', 100), 11, 'The last word ends at the end of the text')

// Bounds: never past the end, never backwards, no time means no change
assert.equal(nextReveal(5, 'hello', 100), 5)
assert.equal(nextReveal(9, 'hello', 100), 5)
assert.equal(nextReveal(3, 'hello world', 0), 3)

// A word longer than 24 characters is shown in pieces instead of stalling
assert.equal(nextReveal(0, 'x'.repeat(400), 16), 0)
assert.ok(nextReveal(0, 'x'.repeat(400), 32) >= 24, 'A long word does not stall once 24 characters of time have passed')

// Calm pace when little is waiting: a short reply takes several frames, one word at a time
const short = 'hi there my friend'
const steps = []
for (let shown = 0, waited = 0; shown < short.length;) {
  waited += 16
  const next = nextReveal(shown, short, waited)
  if (next !== shown) { steps.push(short.slice(0, next)); shown = next; waited = 0 }
}
assert.deepEqual(steps, ['hi', 'hi there', 'hi there my', 'hi there my friend'])

// 2,000 characters of words arriving at once are all shown within 2 s of 16 ms frames (about 0.3 s behind while streaming)
let shown = 0, waited = 0, total = 0
while (shown < words.length && total < 2000) {
  total += 16; waited += 16
  const next = nextReveal(shown, words, waited)
  if (next !== shown) { shown = next; waited = 0 }
}
assert.equal(shown, words.length, `2,000 characters should be shown within 2 s, ${shown} were`)

// Restart point when the text changes
assert.equal(keepPrefix('abc', 'abcdef', 3), 3)
assert.equal(keepPrefix('abc', 'xyz', 3), 0)

assert.doesNotMatch(source, /^\s*import\s/m, 'Smooth text has no imports')
console.log(`Smooth text: whole words at a calm pace, a 2,000-character backlog shown in ${total} ms, long words in pieces, bounds and restart point.`)
