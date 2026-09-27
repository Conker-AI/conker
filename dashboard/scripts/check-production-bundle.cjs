const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const assets = path.resolve(__dirname, '../dist/assets')
const files = fs.readdirSync(assets)
assert.equal(files.some(file => file.includes('fixture')), false, 'production bundle contains a fixture chunk')

const gateway = files.filter(file => /^gateway-entry-.*\.js$/.test(file))
assert.equal(gateway.length, 1, `expected one connected gateway entry chunk, found ${gateway.length}`)
const bytes = fs.statSync(path.join(assets, gateway[0])).size
assert.ok(bytes <= 700_000, `connected gateway entry is ${bytes} bytes; route-level splitting regressed`)

console.log(`Production bundle passed: no fixture chunk; gateway entry ${bytes} bytes.`)
