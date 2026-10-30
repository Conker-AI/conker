const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const assets = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '../dist/assets')
const files = fs.readdirSync(assets)
assert.equal(files.some(file => file.includes('fixture')), false, 'production bundle contains a fixture chunk')

const gateway = files.filter(file => /^gateway-entry-.*\.js$/.test(file))
assert.equal(gateway.length, 1, `expected one connected gateway entry chunk, found ${gateway.length}`)
const bytes = fs.statSync(path.join(assets, gateway[0])).size
assert.ok(bytes <= 700_000, `connected gateway entry is ${bytes} bytes; route-level splitting regressed`)

// Interactive answers (OpenUI) must never load remote code: its development inspector fetches an
// unpinned script from jsDelivr, so neither the inspector nor any CDN address may ship.
const scripts = files.filter(file => /\.(?:js|mjs|css|html)$/.test(file))
for (const file of scripts) {
  const text = fs.readFileSync(path.join(assets, file), 'utf8')
  assert.equal(/jsdelivr/i.test(text), false, `${file} references jsDelivr`)
  assert.equal(text.includes('openui-devtools'), false, `${file} contains the OpenUI development inspector`)
}

console.log(`Production bundle passed: no fixture chunk; no CDN code; gateway entry ${bytes} bytes.`)
