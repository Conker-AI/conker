const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const assets = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '../dist/assets')
const files = fs.readdirSync(assets)
assert.equal(files.some(file => file.includes('fixture')), false, 'production bundle contains a fixture chunk')

const gateway = files.filter(file => /^gateway-entry-.*\.js$/.test(file))
assert.equal(gateway.length, 1, `expected one connected gateway entry chunk, found ${gateway.length}`)
const bytes = fs.statSync(path.join(assets, gateway[0])).size
assert.ok(bytes <= 600_000, `connected gateway entry is ${bytes} bytes; route-level splitting regressed`)

// Interactive answers (OpenUI) must never load remote code: its development inspector fetches an
// unpinned script from jsDelivr, so neither the inspector nor any CDN address may ship.
const scripts = files.filter(file => /\.(?:js|mjs|css|html)$/.test(file))
for (const file of scripts) {
  const text = fs.readFileSync(path.join(assets, file), 'utf8')
  assert.equal(/jsdelivr/i.test(text), false, `${file} references jsDelivr`)
  assert.equal(text.includes('openui-devtools'), false, `${file} contains the OpenUI development inspector`)
}

// Size budget, a little above the 2026-11-13 build (total JS 4,220,447; largest lazy chunk 499,741).
// Raise it on purpose in the PR that needs more, never to make CI pass.
const TOTAL_JS_BUDGET = 4_500_000
const CHUNK_BUDGET = 520_000
const js = files.filter(file => file.endsWith('.js')).map(file => ({ file, size: fs.statSync(path.join(assets, file)).size }))
const total = js.reduce((sum, { size }) => sum + size, 0)
assert.ok(total <= TOTAL_JS_BUDGET, `JavaScript totals ${total} bytes; budget ${TOTAL_JS_BUDGET}`)
// An isolated stage (the installer's test) may hold the entry alone.
const largest = js.filter(({ file }) => file !== gateway[0]).sort((a, b) => b.size - a.size)[0] ?? { file: 'none', size: 0 }
assert.ok(largest.size <= CHUNK_BUDGET, `${largest.file} is ${largest.size} bytes; chunk budget ${CHUNK_BUDGET}`)

console.log(`Production bundle passed: no fixture chunk; no CDN code; gateway entry ${bytes} bytes; JS total ${total} bytes in ${js.length} files; largest other chunk ${largest.file} ${largest.size} bytes.`)
