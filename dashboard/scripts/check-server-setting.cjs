// useServerSetting: values are checked against the registry and fall back to the default, the
// shell paints from the device cache before the server answers, a late older document is ignored,
// device settings read this browser, and every call in the source names a real setting with the
// registry's own default and options.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const folder = path.join(root, 'src/settings/registry')
const groups = fs.readdirSync(folder).filter(name => name.endsWith('.json')).map(name => JSON.parse(fs.readFileSync(path.join(folder, name), 'utf8')))
const settings = groups.flatMap(group => group.sections.flatMap(section => section.settings.map(setting => ({ keywords: [], related: [], ...setting, group: group.id, section: section.id }))))
const byId = new Map(settings.map(setting => [setting.id, setting]))

// A browser for the store: localStorage and window events, nothing else.
const storage = new Map()
const events = new EventTarget()
globalThis.window = Object.assign(events, {
  localStorage: { getItem: key => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
})
globalThis.CustomEvent ??= class extends Event { constructor(type, init) { super(type); this.detail = init?.detail } }

const cache = new Map()
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports
  const module = { exports: {} }; cache.set(relative, module)
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const resolve = request => request === 'react' ? require('react')
    // The registry module globs its JSON with Vite; here it is the same entries, read from disk.
    : request === './registry' ? { SETTINGS_BY_ID: byId }
    : load(`${path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))}.ts`)
  new Function('require', 'module', 'exports', code)(resolve, module, module.exports)
  return module.exports
}

async function main() {
  const { validSettingValue, settingValue } = load('src/settings/setting-value.ts')
  const entry = id => { const setting = byId.get(id); assert.ok(setting, `${id} is in the registry`); return setting }
  const number = { id: 't.n', type: 'number', default: 3, min: 1, max: 5, step: 1 }
  assert.equal(validSettingValue(number, 4), true)
  for (const bad of [0, 6, 2.5, '4', NaN, Infinity, null, true]) assert.equal(validSettingValue(number, bad), false, `number rejects ${String(bad)}`)
  assert.equal(validSettingValue({ id: 't.h', type: 'number', default: 0.5, min: 0, max: 1, step: 0.1 }, 0.35), true, 'a decimal step allows any number in range')
  const select = { id: 't.s', type: 'select', default: 'b', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }
  assert.equal(validSettingValue(select, 'a'), true)
  assert.equal(validSettingValue(select, 'c'), false, 'a removed option falls back')
  assert.equal(validSettingValue({ ...select, default: null }, null), true, 'null only where null is the default')
  assert.equal(validSettingValue(select, null), false)
  const list = { id: 't.l', type: 'list', default: ['a'], options: select.options, max_items: 2 }
  assert.equal(validSettingValue(list, []), true)
  for (const bad of [['a', 'a'], ['a', 'c'], 'a', ['a', 'b', 'a']]) assert.equal(validSettingValue(list, bad), false, `list rejects ${JSON.stringify(bad)}`)
  assert.equal(validSettingValue({ id: 't.t', type: 'text', default: '', max_length: 3, pattern: '^[a-z]*$' }, 'abc'), true)
  assert.equal(validSettingValue({ id: 't.t', type: 'text', default: '', max_length: 3, pattern: '^[a-z]*$' }, 'abcd'), false)
  assert.equal(validSettingValue({ id: 't.t', type: 'text', default: '', pattern: '^[a-z]*$' }, 'A1'), false)
  assert.equal(validSettingValue({ id: 't.g', type: 'toggle', default: true }, 'true'), false)
  assert.equal(validSettingValue({ id: 't.c', type: 'custom', default: null }, {}), false, 'a custom block is never read here')
  for (const setting of settings) if (setting.type !== 'custom') assert.equal(validSettingValue(setting, setting.default), true, `${setting.id}: its own default is valid`)
  assert.equal(settingValue(undefined, 4, 3), 4, 'before the registry loads, the same kind of value is used')
  assert.equal(settingValue(undefined, 'x', 3), 3)
  assert.equal(settingValue(undefined, ['a', 1], ['a']).length, 1, 'a list must hold words')
  assert.equal(settingValue(null, 4, 3), 3, 'a setting the registry no longer has keeps its default')
  assert.equal(settingValue(number, undefined, 3), 3)

  const store = load('src/settings/server-setting.ts')
  const places = entry('appearance.sidebar_places').default
  storage.set('conker.setting.cache.home.needs_count', '4')
  storage.set('conker.setting.cache.home.greeting', '7')
  assert.equal(store.serverSetting('home.needs_count', 3), 4, 'the last value seen paints the first frame')
  assert.equal(store.serverSetting('home.greeting', 'short'), 'short', 'a cached value of the wrong kind is ignored')
  storage.set('conker.setting.cache.home.needs_count', '9')
  let calls = 0
  const stop = store.subscribeServerSettings(() => { calls++ })
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.ok(calls >= 1, 'listeners hear when the registry arrives')
  assert.equal(store.serverSetting('home.needs_count', 3), 3, 'once the registry is in, an out-of-range value falls back')
  store.publishServerSettings({ revision: 2, values: { 'home.needs_count': 5, 'appearance.sidebar_places': ['memory', 'server'], 'keyboard.palette': 'ctrl_x' } })
  assert.equal(store.serverSetting('home.needs_count', 3), 5)
  assert.equal(storage.get('conker.setting.cache.home.needs_count'), '5', 'the shell remembers it for the next start')
  assert.equal(store.serverSetting('keyboard.palette', 'ctrl_k'), 'ctrl_k', 'an option the registry lacks falls back')
  const first = store.serverSetting('appearance.sidebar_places', places)
  assert.deepEqual(first, ['memory', 'server'])
  assert.equal(store.serverSetting('appearance.sidebar_places', [...places]), first, 'an unchanged list keeps its identity, so React does not loop')
  const before = calls
  store.publishServerSettings({ revision: 1, values: {} })
  assert.equal(calls, before, 'an older document arriving late is ignored')
  assert.equal(store.serverSetting('home.needs_count', 3), 5)
  store.publishServerSettings({ revision: 3, values: {} })
  assert.equal(calls, before + 1)
  assert.equal(store.serverSetting('home.needs_count', 3), 3, 'a setting left out of the document is back at its default')
  assert.deepEqual(store.serverSetting('appearance.sidebar_places', places), places)
  assert.equal(storage.has('conker.setting.cache.home.needs_count'), false, 'and the device forgets the old value')
  assert.equal(store.serverSetting('nothing.here', 'x'), 'x', 'an unknown id keeps its default')
  const device = settings.find(setting => setting.scope === 'device' && setting.type === 'select')
  const other = device.options.find(option => option.value !== device.default).value
  storage.set(`conker.setting.${device.id}`, JSON.stringify(other))
  store.publishServerSettings({ revision: 4, values: { [device.id]: device.default } })
  assert.equal(store.serverSetting(device.id, device.default), other, 'a device setting reads this browser, not the document')
  storage.set(`conker.setting.${device.id}`, JSON.stringify('not-an-option'))
  window.dispatchEvent(new CustomEvent('conker-device-setting'))
  assert.equal(store.serverSetting(device.id, device.default), device.default)
  assert.ok(calls > before + 2, 'a device change notifies listeners')
  const preference = settings.find(setting => setting.home?.service === 'pi' && setting.home.path !== '/owner/settings' && setting.type === 'toggle')
  if (preference) {
    store.publishServerSettings({ revision: 5, values: { [preference.id]: !preference.default } })
    assert.equal(store.serverSetting(preference.id, preference.default), preference.default, 'a setting homed elsewhere is not read from the document')
  }
  stop()

  // Every call in the source: a real setting, the registry's default, and for a select its options as the type.
  const used = new Map()
  const files = []
  const walk = directory => { for (const item of fs.readdirSync(directory, { withFileTypes: true })) { const file = path.join(directory, item.name); if (item.isDirectory()) walk(file); else if (/\.tsx?$/.test(item.name)) files.push(file) } }
  walk(path.join(root, 'src'))
  const constants = file => {
    const found = new Map(), source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    source.forEachChild(node => { if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations) if (ts.isIdentifier(declaration.name) && declaration.initializer) found.set(declaration.name.text, declaration.initializer) })
    return { source, found }
  }
  const literal = (node, file) => {
    if (ts.isStringLiteral(node)) return node.text
    if (ts.isNumericLiteral(node)) return Number(node.text)
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(element => literal(element, file))
    if (ts.isIdentifier(node)) {
      const own = constants(file)
      if (own.found.has(node.text)) return literal(own.found.get(node.text), file)
      // One import hop: `import { NAME } from './module'`.
      for (const statement of own.source.statements) {
        if (!ts.isImportDeclaration(statement) || !statement.importClause?.namedBindings || !ts.isNamedImports(statement.importClause.namedBindings)) continue
        if (!statement.importClause.namedBindings.elements.some(element => element.name.text === node.text)) continue
        const specifier = statement.moduleSpecifier.text
        const base = specifier.startsWith('@/') ? path.join(root, 'src', specifier.slice(2)) : path.resolve(path.dirname(file), specifier)
        const target = ['.ts', '.tsx'].map(extension => base + extension).find(candidate => fs.existsSync(candidate))
        if (target && constants(target).found.has(node.text)) return literal(constants(target).found.get(node.text), target)
      }
    }
    throw new Error(`${path.relative(root, file)}: the default ${node.getText()} must be a literal or a constant`)
  }
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
    if (!/\b(?:useServerSetting|serverSetting)\b/.test(text) || file.endsWith(path.join('settings', 'server-setting.ts'))) continue
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const visit = node => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['useServerSetting', 'serverSetting'].includes(node.expression.text)) {
        const where = `${path.relative(root, file)}: ${node.getText().slice(0, 80)}`
        assert.ok(ts.isStringLiteral(node.arguments[0]), `${where}: the id is a literal`)
        const setting = byId.get(node.arguments[0].text)
        assert.ok(setting, `${where}: no such setting in the registry`)
        assert.ok(setting.scope === 'global' || setting.scope === 'device', `${where}: chat and agent settings live in each chat and agent`)
        assert.deepEqual(literal(node.arguments[1], file), setting.default, `${where}: the default must be the registry's`)
        if (setting.type === 'select') {
          const type = node.typeArguments?.[0]
          assert.ok(type && ts.isUnionTypeNode(type), `${where}: name the options as the type`)
          const named = type.types.map(member => ts.isLiteralTypeNode(member) && ts.isStringLiteral(member.literal) ? member.literal.text : member.getText()).sort()
          assert.deepEqual(named, setting.options.map(option => String(option.value)).sort(), `${where}: the type must list exactly the registry's options`)
        }
        used.set(setting.id, (used.get(setting.id) ?? 0) + 1)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }

  // The places, corners and layouts the shell draws cover every option the registry offers.
  const sidebar = fs.readFileSync(path.join(root, 'src/components/gateway/gateway-sidebar.tsx'), 'utf8')
  for (const option of entry('appearance.sidebar_places').options) assert.ok(sidebar.includes(`'${option.value}'`), `the sidebar knows the place ${option.value}`)
  const css = fs.readFileSync(path.join(root, 'src/index.css'), 'utf8')
  for (const option of entry('appearance.corners').options) if (option.value !== 'soft') assert.ok(css.includes(`[data-corners="${option.value}"]`), `index.css draws ${option.value} corners`)
  assert.ok(css.includes('[data-focus="large"]'), 'index.css draws bigger focus outlines')
  const bento = fs.readFileSync(path.join(root, 'src/components/gateway/home-bento.css'), 'utf8')
  for (const layout of ['no-plan', 'no-done', 'no-plan-done']) assert.equal(bento.split(`[data-layout="${layout}"]`).length - 1, 3, `Home closes the gap for ${layout} at all three widths`)

  console.log(`Server settings passed: values checked against the registry, cached first frame, late documents ignored, device settings from this browser; ${used.size} settings read outside Settings (${[...used.keys()].sort().join(', ')}).`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
