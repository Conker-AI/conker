const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const source = fs.readFileSync(path.join(__dirname, '../src/lib/runtime-mode.ts'), 'utf8')
  .replaceAll('import.meta.env.VITE_CONKER_MODE', 'undefined').replaceAll('import.meta.env.DEV', 'true')
const mod = { exports: {} }
new Function('module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(mod, mod.exports)
const resolve = mod.exports.resolveRuntimeMode
assert.equal(resolve(undefined, true), 'fixture')
assert.equal(resolve('', true), 'fixture')
assert.equal(resolve(undefined, false), 'gateway')
assert.equal(resolve('', false), 'gateway')
for (const development of [true, false]) {
  assert.equal(resolve('fixture', development), 'fixture')
  assert.equal(resolve('gateway', development), 'gateway')
  for (const invalid of ['production', 'false', ' Gateway ', null, {}, false]) assert.equal(resolve(invalid, development), 'invalid')
}
const app = fs.readFileSync(path.join(__dirname, '../src/App.tsx'), 'utf8')
const preview = fs.readFileSync(path.join(__dirname, '../src/dev/gateway-preview.tsx'), 'utf8')
assert.match(app, /VITE_CONKER_FIXTURE_SHELL === 'legacy'/)
assert.doesNotMatch(app + preview, /[?&]gateway-preview=|conker-gateway-preview|sessionStorage/)
assert.doesNotMatch(preview, /href=.*fixture|href=.*preview/)
console.log('Runtime mode checks passed: development preview, production gateway, explicit override, invalid values fail closed.')
