const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve() }
const saved = { requestId: 'saved_request_identity', memoryId: 'mem-A', revision: 4 }

function harness(file, name, initialProps) {
  const source = path.resolve(__dirname, '../src/components/gateway', file)
  const code = ts.transpileModule(fs.readFileSync(source, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const hooks = [], effects = [], calls = []
  let cursor = 0, tree, nextIdentity = 0, forgotten = 0, changed = 0, resolved = 0
  const react = {
    useState(initial) { const index = cursor++; hooks[index] ??= { value: typeof initial === 'function' ? initial() : initial }; return [hooks[index].value, next => { hooks[index].value = typeof next === 'function' ? next(hooks[index].value) : next }] },
    useRef(initial) { const index = cursor++; return hooks[index] ??= { current: initial } },
    useEffect(run, dependencies) {
      const index = cursor++, previous = hooks[index]
      if (!previous || dependencies.some((item, position) => item !== previous.dependencies[position])) effects.push(() => { previous?.cleanup?.(); hooks[index] = { dependencies, cleanup: run() } })
    },
  }
  const jsx = (type, props) => ({ type, props })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(name => {
    if (name === 'react') return react
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (name === '@/lib/gateway/control') return { createMemoryForgetRequest: preview => ({ requestId: `fresh_request_${++nextIdentity}`, memoryId: preview.memoryId, revision: preview.revision }) }
    if (name === '@/lib/gateway/transport') return { gatewayError: error => ({ message: error.message || 'Safe error' }) }
    if (name === '@/lib/gateway/memory-forget-state') return { memoryForgetFailure: error => ({ message: 'Safe forget guidance', reset: error.code === 'revision_conflict', privateUnavailable: error.code === 'session-changed' }) }
    return new Proxy({}, { get: (_, property) => property })
  }, module, module.exports)
  const client = Object.fromEntries(['forgetPreview', 'forgetMemory', 'pendingMemoryForget'].map(method => [method, (...args) => { const result = deferred(); calls.push({ method, args, ...result }); return result.promise }]))
  let props = { client, memoryId: 'mem-A', revision: '1', onForgotten: () => forgotten++, onChanged: () => changed++, onResolved: () => resolved++, ...initialProps }
  function render(next) { props = { ...props, ...next }; cursor = 0; tree = module.exports[name](props); for (const run of effects.splice(0)) run() }
  function find(type) {
    const matches = []
    function visit(node) { if (!node || typeof node !== 'object') return; if (node.type === type) matches.push(node); for (const child of [node.props?.children].flat(Infinity)) visit(child) }
    visit(tree); return matches
  }
  return { render, calls, find, unmount: () => hooks.forEach(hook => hook?.cleanup?.()), get counts() { return { forgotten, changed, resolved } } }
}

async function main() {
  let view = harness('forget-memory.tsx', 'ForgetMemory'); view.render(); view.render()
  const reviewing = view.find('Button')[0].props.onClick()
  assert.equal(view.calls.length, 1); assert.equal(view.calls[0].method, 'forgetPreview', 'Review never deletes')
  view.calls[0].resolve({ memoryId: 'mem-A', revision: 4, text: 'Private reviewed fact' }); await reviewing; await flush(); view.render()
  let dialog = view.find('ConfirmationDialog')[0]
  assert.equal(dialog.props.open, true)
  const confirm = dialog.props.onConfirm
  const first = confirm(); await confirm()
  assert.equal(view.calls.length, 2, 'Rapid confirmation dispatches only once, even before React renders')
  const original = view.calls[1].args[0]
  view.calls[1].reject(new Error('Response lost')); await first; view.render()
  assert.equal(view.counts.changed, 1); assert.equal(view.counts.forgotten, 0)
  dialog = view.find('ConfirmationDialog')[0]; dialog.props.onOpenChange(false); view.render()
  view.find('Button')[0].props.onClick(); view.render()
  assert.equal(view.calls.length, 2, 'Reopening does not replace the reviewed identity')
  const retry = view.find('ConfirmationDialog')[0].props.onConfirm()
  assert.deepEqual(view.calls[2].args[0], original, 'Uncertain mutation retries the same exact identity and version')
  view.unmount(); assert.equal(view.calls[2].args[1].aborted, true)
  view.calls[2].resolve({}); await retry
  assert.deepEqual(view.counts, { forgotten: 0, changed: 1, resolved: 0 }, 'Unmounted late success cannot mutate the workspace')

  view = harness('forget-memory.tsx', 'ForgetMemory'); view.render(); view.render()
  view.find('Button')[0].props.onClick()
  view.render({ memoryId: 'mem-B' }); view.render()
  assert.equal(view.calls[0].args[1].aborted, true)
  view.calls[0].resolve({ memoryId: 'mem-A', revision: 4, text: 'Stale private fact' }); await flush(); view.render()
  assert.equal(view.find('ConfirmationDialog')[0].props.open, false, 'Changed selection cannot expose a late review')
  view.find('Button')[0].props.onClick(); assert.equal(view.calls[1].args[0], 'mem-B')
  view.calls[1].resolve({ memoryId: 'mem-B', revision: 1, text: 'New fact' }); await flush(); view.render()
  const beforeChange = view.find('ConfirmationDialog')[0].props.onConfirm()
  view.calls[2].reject({ code: 'revision_conflict' }); await beforeChange; view.render()
  view.find('Button')[0].props.onClick(); assert.equal(view.calls[3].method, 'forgetPreview', 'Definite revision conflict requires a fresh review')
  view.unmount()

  view = harness('forget-memory-recovery.tsx', 'ForgetMemoryRecovery'); view.render(); view.render()
  assert.deepEqual(view.calls.map(call => call.method), ['pendingMemoryForget'], 'Opening recovery only reads content-free metadata')
  view.calls[0].resolve(saved); await flush(); view.render()
  view.find('Button')[0].props.onClick(); view.render()
  const recovering = view.find('ConfirmationDialog')[0].props.onConfirm()
  assert.deepEqual(view.calls[1].args[0], saved, 'Explicit confirmation reuses the durable server identity')
  view.render()
  assert.ok(view.find('Button').every(button => button.props.disabled), 'Refresh and recovery remain disabled throughout mutation')
  view.find('Button').at(-1).props.onClick(); view.render()
  assert.equal(view.calls.length, 2, 'Even a retained refresh callback cannot start a read while mutation is active')
  view.calls[1].reject(new Error('Unknown result')); await recovering; view.render()
  const staleConfirm = view.find('ConfirmationDialog')[0].props.onConfirm
  view.find('ConfirmationDialog')[0].props.onOpenChange(false); view.render()
  view.find('Button').at(-1).props.onClick(); view.render()
  assert.equal(view.calls[2].method, 'pendingMemoryForget')
  await staleConfirm()
  assert.equal(view.calls.length, 3, 'Recovery cannot race an in-flight refresh through an old confirmation callback')
  view.calls[2].resolve(saved); await flush(); view.render()
  view.find('Button')[0].props.onClick(); view.render()
  const afterRefresh = view.find('ConfirmationDialog')[0].props.onConfirm()
  view.render(); assert.equal(view.find('ConfirmationDialog')[0].props.pending, true)
  view.calls[3].resolve({}); await afterRefresh; view.render()
  assert.equal(view.counts.resolved, 1)
  view.unmount()

  view = harness('forget-memory-recovery.tsx', 'ForgetMemoryRecovery'); view.render(); view.render()
  view.render({ revision: '2' }); view.render()
  assert.equal(view.calls[0].args[0].aborted, true)
  view.calls[1].resolve(null); view.calls[0].resolve(saved); await flush(); view.render()
  assert.equal(view.find('ConfirmationDialog').length, 0, 'Stale recovery metadata cannot reappear after workspace refresh')
  view.unmount()
  console.log('Forget lifecycle: explicit confirmation, exact uncertain retries, synchronous duplicate guards, refresh/mutation exclusion and late-response privacy fences passed.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
