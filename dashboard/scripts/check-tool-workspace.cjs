const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { webcrypto } = require('node:crypto')
const root = path.resolve(__dirname, '..')
const ts = require(path.join(root, 'node_modules/typescript'))
const cache = new Map()
globalThis.crypto ??= webcrypto
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports
  const source = fs.readFileSync(path.join(root, relative), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const module = { exports: {} }; cache.set(relative, module)
  const resolve = request => request === 'zod' ? require(path.join(root, 'node_modules/zod')) : load(`${path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))}.ts`)
  new Function('require', 'module', 'exports', compiled.outputText)(resolve, module, module.exports)
  return module.exports
}
async function main() {
  const { validateToolDefinition, parseToolDraft, parseToolDefinition, createToolNode, createToolDefinition, editorValidation } = load('src/lib/tool-workspace.ts')
  // ToolGate's check of the saved draft wins; the quick local check covers only unsaved edits.
  const saved = createToolDefinition('saved-live', 'Saved live')
  const toolgate = [{ path: 'toolgate', message: 'Referenced step must run on every path to this node.', nodeId: 'result' }]
  assert.deepEqual(editorValidation(saved, true, false, toolgate), { issues: toolgate, label: 'ToolGate: needs attention' }, 'ToolGate finds what the quick check misses')
  const unlinked = structuredClone(saved); unlinked.edges = []
  assert.deepEqual(editorValidation(unlinked, true, false, []).issues, [], 'ToolGate saying valid wins over the quick check')
  assert.ok(editorValidation(unlinked, true, true, []).issues.length, 'Unsaved edits get instant feedback from the quick check')
  assert.match(editorValidation(unlinked, true, true, []).label, /save to check with ToolGate/)
  assert.equal(editorValidation(saved, true, false, 'checking').label, 'Checking with ToolGate\u2026')
  assert.match(editorValidation(saved, true, false, 'failed').label, /ToolGate didn\u2019t answer/, 'No answer is said, not hidden')
  assert.equal(editorValidation(saved, false, false).label, 'Definition valid', 'The local preview has only the local check')
  // Rules ToolGate does not have are gone from live drafts.
  const typed = structuredClone(saved)
  typed.inputs = [{ name: 'count', type: 'number', required: false, default: 'three' }]
  assert.deepEqual(validateToolDefinition(typed, true), [], 'ToolGate does not check defaults, so live drafts are not refused for them')
  assert.ok(validateToolDefinition(typed).length, 'The local preview, which runs defaults itself, still checks them')
  const long = structuredClone(saved)
  long.nodes.find(n => n.type === 'return').config.value = 'x'.repeat(20000)
  assert.doesNotThrow(() => parseToolDraft(JSON.stringify(long)), 'ToolGate bounds the document, not each value')
  const nestedLive = createToolDefinition('nested-live', 'Nested live')
  const nestedNode = createToolNode('workflow_call')
  nestedNode.config = { toolId: 'conker.daily-brief', version: 2, args: {} }
  nestedLive.nodes.splice(1, 0, nestedNode)
  nestedLive.edges = [{ id: 'to-child', source: nestedLive.nodes[0].id, target: nestedNode.id }, { id: 'from-child', source: nestedNode.id, target: nestedLive.nodes[2].id }]
  assert.deepEqual(validateToolDefinition(nestedLive, true), [], 'Live nested references accept registered dotted identities')
  assert.ok(validateToolDefinition(nestedLive).length, 'Preview keeps its own identity contract')
  nestedNode.config.toolId = '../invalid'
  assert.ok(validateToolDefinition(nestedLive, true).length, 'Live nested references reject invalid registry identities')
  console.log('Tool workspace checks passed: ToolGate validation precedence, live draft rules, nested live references.')
}
main().catch(error => { console.error(error); process.exit(1) })
