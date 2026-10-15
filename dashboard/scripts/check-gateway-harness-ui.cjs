const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const walk = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(walk) : [node, ...walk(node.props?.children)]
const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : ''

// Follow the repository's hook harness pattern, with StrictMode's setup/cleanup/setup replay.
function harness(file, name, initialProps) {
  const slots = [], effects = []; let cursor = 0, dirty = false, tree, props = initialProps
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; dirty = true }] },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i] },
    useEffect(effect, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((value, n) => !Object.is(value, old.deps[n]))) { slots[i] = { deps, effect }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = effect() }) } },
  }
  const module = { exports: {} }
  const source = fs.readFileSync(path.resolve(__dirname, '../src/components/gateway', file), 'utf8') + `\nexport { ${name} };`
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'module', 'exports', code)(dependency => {
    if (dependency === 'react') return hooks
    if (dependency === 'react/jsx-runtime') return require(dependency)
    if (dependency === '@/lib/gateway/transport') return { gatewayError: error => error }
    if (dependency === '@/lib/gateway/skills') return { SKILL_MAX_CHARACTERS: 32000, SKILL_BROWSER_MAX_BYTES: 61440, skillImportBytes: value => Buffer.byteLength(JSON.stringify({ markdown: value })) }
    return new Proxy({}, { get: (_, key) => key === 'Button' ? 'button' : key === 'Textarea' ? 'textarea' : key === 'Input' ? 'input' : key === 'Link' ? 'a' : 'section' })
  }, module, module.exports)
  function render(next = props) { props = next; cursor = 0; dirty = false; tree = module.exports[name](props); while (effects.length) effects.shift()(); return tree }
  return {
    render,
    strictReplay() { for (const slot of slots) if (slot?.effect) slot.cleanup?.(); for (const slot of slots) if (slot?.effect) slot.cleanup = slot.effect() },
    async settle() { await new Promise(resolve => setImmediate(resolve)); if (dirty) render() },
    button(label) { const found = walk(tree).find(node => node.type === 'button' && text(node) === label); assert.ok(found, `Missing button ${label}`); return found },
    find(type) { const found = walk(tree).find(node => node.type === type); assert.ok(found, `Missing ${type}`); return found },
    props: () => props,
    text: () => text(tree),
  }
}

async function main() {
  const discovery = deferred(); let discovered = 0
  const connect = harness('mcp-workspace.tsx', 'McpConnect', { client: { discover: () => { discovered++; return discovery.promise } }, onSaved: () => {}, onBusy: () => {}, onCancel: () => {} })
  connect.render(); connect.strictReplay()
  const discoverSubmit = connect.find('form').props.onSubmit
  discoverSubmit({ preventDefault() {} }); discoverSubmit({ preventDefault() {} })
  assert.equal(discovered, 1, 'Double submission is locked before React rerenders')
  discovery.resolve({ server: { name: 'Reviewed server', url: 'https://example.com/mcp' }, tools: [] })
  await connect.settle()
  assert.match(connect.text(), /Reviewed server/, 'Discovery finishes after StrictMode effect replay')

  const reads = [], writes = []; let reloads = 0
  const tool = { id: 'mcp.lookup', name: 'Lookup', status: 'active', digest: 'old', description: '', url: 'https://example.com/mcp', tool_name: 'lookup', version: 1, schema_hash: 'hash' }
  const client = {
    access(_tool, signal) { const request = { ...deferred(), signal }; reads.push(request); return request.promise },
    setAccess() { const request = deferred(); writes.push(request); return request.promise },
    setEnabled() { return Promise.reject({ status: 409, message: 'Changed' }) },
  }
  const detail = harness('mcp-workspace.tsx', 'McpDetail', { client, tool, onSaved: () => {}, onClose: () => {}, onReload: () => { reloads++ } })
  detail.render(); detail.strictReplay()
  assert.equal(reads[0].signal.aborted, true)
  reads.at(-1).resolve({ enabled: false }); await detail.settle()
  detail.render({ ...detail.props(), tool: { ...tool } })
  const stale = reads.at(-1)
  detail.button('Make available in chats').props.onClick()
  writes[0].resolve({ enabled: true }); await detail.settle()
  assert.ok(detail.button('Remove from chats'))
  stale.resolve({ enabled: false }); await detail.settle()
  assert.ok(detail.button('Remove from chats'), 'Older reads cannot undo a successful access mutation')
  detail.button('Disable tool').props.onClick(); await detail.settle()
  detail.button('Reload saved tool').props.onClick()
  assert.equal(reloads, 1, 'Conflict recovery reloads the complete definition through the parent')

  const imported = deferred(), saved = [], imports = []
  const importer = harness('skills-workspace.tsx', 'SkillImport', { client: { import(...args) { imports.push(args); return imported.promise } }, replacing: { id: 'review-code', revision: 4, name: 'review-code', enabled: true, markdown: 'original' }, onSaved: value => saved.push(value), onPending: () => {}, onCancel: () => {} })
  importer.render(); importer.strictReplay()
  importer.find('textarea').props.onChange({ target: { value: 'reviewed replacement' } }); importer.render()
  const importSubmit = importer.find('form').props.onSubmit
  importSubmit({ preventDefault() {} }); importSubmit({ preventDefault() {} })
  assert.deepEqual(imports, [['reviewed replacement', 4, 'review-code']], 'Replacement preserves inspected identity/revision and prevents double writes')
  imported.resolve({ id: 'review-code', revision: 5 }); await importer.settle()
  assert.deepEqual(saved, [{ id: 'review-code', revision: 5 }], 'Skill import completes after StrictMode effect replay')
  console.log('Harness UI strict-effect recovery, double-write prevention, stale-read fencing and revision reload checks passed.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
