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
  const { createToolWorkspacePreview, executeToolPreview, createToolWorkspaceFixtures } = load('src/lib/api/tool-workspace-preview.ts')
  const { validateToolDefinition, parseToolDraft, parseToolDefinition, createToolNode, createToolDefinition } = load('src/lib/tool-workspace.ts')
  for (const record of createToolWorkspaceFixtures()) assert.deepEqual(validateToolDefinition(record.draft), [], record.id)
  const nestedLive = createToolDefinition('nested-live', 'Nested live')
  const nestedNode = createToolNode('workflow_call')
  nestedNode.config = { toolId: 'conker.daily-brief', version: 2, args: {} }
  nestedLive.nodes.splice(1, 0, nestedNode)
  nestedLive.edges = [{ id: 'to-child', source: nestedLive.nodes[0].id, target: nestedNode.id }, { id: 'from-child', source: nestedNode.id, target: nestedLive.nodes[2].id }]
  assert.deepEqual(validateToolDefinition(nestedLive, true), [], 'Live nested references accept registered dotted identities')
  assert.ok(validateToolDefinition(nestedLive).length, 'Preview keeps its own identity contract')
  nestedNode.config.toolId = '../invalid'
  assert.ok(validateToolDefinition(nestedLive, true).length, 'Live nested references reject invalid registry identities')
  const client = createToolWorkspacePreview()
  let updates = 0
  const unsubscribe = client.subscribe(() => updates++)
  const brief = await client.get('morning-brief')
  const busy = await client.run(brief.id, { busyAt: 2 })
  const { toolValueSources } = load('src/lib/tool-value-sources.ts')
  const resultSources = toolValueSources(brief.draft, 'result', busy).map(source => source.path)
  assert.ok(resultSources.includes('$steps.calendar.count'), 'Picker exposes inspected fields from the matching test')
  assert.ok(resultSources.includes('$last'), 'Branch result is available through last')
  assert.ok(!resultSources.some(source => source.startsWith('$steps.busy-note') || source.startsWith('$steps.quiet-note')), 'A joined step cannot assume either conditional branch ran')
  assert.ok(!toolValueSources(brief.draft, 'calendar', busy).some(source => source.path.startsWith('$steps.busy')), 'Future results are unavailable')
  const detached = structuredClone(brief.draft)
  detached.edges = []
  assert.ok(!toolValueSources(detached, 'result', busy).some(source => source.path.startsWith('$steps.') || source.path === '$last'), 'Disconnected steps do not promise runtime results')
  assert.equal(busy.status, 'completed')
  assert.match(busy.output.summary, /focus block/)
  assert.equal(busy.steps.find(s => s.nodeId === 'quiet-note').status, 'skipped')
  const scrambled = structuredClone(brief.draft)
  scrambled.nodes = [scrambled.nodes.find(n => n.id === 'result'), scrambled.nodes.find(n => n.id === 'quiet-note'), ...scrambled.nodes.filter(n => !['result', 'quiet-note'].includes(n.id))]
  const orderedRun = executeToolPreview(scrambled, { busyAt: 2 })
  assert.deepEqual(orderedRun.steps.map(s => s.nodeId), ['input', 'calendar', 'busy', 'busy-note', 'result', 'quiet-note'], 'Receipts follow attempted execution, then skipped definition order')
  const failedOrder = structuredClone(scrambled)
  failedOrder.nodes.find(n => n.id === 'busy').config = { operator: 'greater', left: 'invalid number', right: 2 }
  assert.deepEqual(executeToolPreview(failedOrder, {}).steps.map(s => [s.nodeId, s.status]), [['input', 'completed'], ['calendar', 'completed'], ['busy', 'failed'], ['result', 'skipped'], ['quiet-note', 'skipped'], ['busy-note', 'skipped']], 'Failed attempted steps keep chronological position and unattempted nodes retain definition order')
  const quiet = await client.run(brief.id, { busyAt: 9 })
  assert.match(quiet.output.summary, /quieter/)
  assert.equal(quiet.steps.find(s => s.nodeId === 'busy-note').status, 'skipped')
  const optional = structuredClone(brief.draft)
  optional.inputs.push({ name: 'optional', type: 'object', required: false })
  optional.nodes.find(n => n.id === 'busy').config = { operator: 'exists', left: '$input.optional' }
  assert.match(executeToolPreview(optional, {}).output.summary, /quieter/, 'exists returns false for an absent optional input')
  assert.match(executeToolPreview(optional, { optional: {} }).output.summary, /focus block/, 'exists returns true for a present object')
  optional.nodes.find(n => n.id === 'busy').config.left = '$input.optional.nested.value'
  assert.match(executeToolPreview(optional, { optional: {} }).output.summary, /quieter/, 'exists returns false for missing nested paths')
  assert.match(executeToolPreview(optional, { optional: { nested: { value: false } } }).output.summary, /focus block/, 'false is a present value')
  optional.nodes.find(n => n.id === 'busy').config = { operator: 'equals', left: '$input.optional.nested', right: null }
  assert.match(executeToolPreview(optional, {}).error, /unavailable/, 'Other comparisons still fail on absent references')
  optional.nodes.find(n => n.id === 'busy').config = { operator: 'exists', left: '$input.optional.__proto__' }
  assert.match(executeToolPreview(optional, {}).error, /Invalid reference/, 'exists never permits prototype paths, even after a missing path')
  optional.nodes.find(n => n.id === 'busy').config.left = '$unknown.optional'
  assert.match(executeToolPreview(optional, {}).error, /Invalid reference/, 'exists never permits invalid reference roots')
  assert.equal((await client.run(brief.id, { busyAt: 'two' })).status, 'failed')
  assert.match((await client.run(brief.id, { unknown: true })).error, /Unknown input/)
  const published = await client.publish(brief.id)
  const edit = (await client.get(brief.id)).draft
  edit.nodes.find(n => n.id === 'busy-note').config.value = { summary: 'Changed draft' }
  await client.save(edit)
  assert.equal((await client.run(brief.id, {}, published.version)).output.summary, busy.output.summary, 'Published version remains immutable after draft edits')
  published.definition.name = 'External mutation'
  const fresh = await client.get(brief.id)
  assert.notEqual(fresh.published[0].definition.name, 'External mutation', 'Returned values cannot mutate store')
  assert.equal((await client.run(brief.id, {})).output.summary, 'Changed draft')
  const loop = await client.run('normalize-labels', { labels: [' A ', ' B '], unitCost: 0.5 })
  assert.deepEqual(loop.output, { labels: ['A', 'B'], estimate: 1 })
  assert.match((await client.run('normalize-labels', { labels: Array(21).fill('x') })).error, /Loop item limit/)
  assert.match((await client.run('normalize-labels', { labels: Array(201).fill('x') })).error, /limited to 200/)
  assert.match((await client.run('normalize-labels', { unitCost: Infinity })).error, /finite/)
  const badLoop = (await client.get('normalize-labels')).draft
  badLoop.budgets.maxSteps = 3
  assert.match(executeToolPreview(badLoop, {}).error, /Step budget/)
  const broken = structuredClone(brief.draft)
  broken.edges[0].target = 'missing'
  assert.ok(validateToolDefinition(broken).some(i => /missing endpoint/.test(i.message)))
  assert.doesNotThrow(() => parseToolDraft(JSON.stringify(broken)), 'Incomplete drafts can be saved')
  assert.throws(() => parseToolDefinition(JSON.stringify(broken)), /missing endpoint/)
  await client.save(broken)
  await assert.rejects(client.publish(broken.id), /missing endpoint/)
  const cycle = structuredClone(brief.draft)
  cycle.edges.find(e => e.id === 'busy-result').target = 'calendar'
  assert.ok(validateToolDefinition(cycle).some(i => /cycles/.test(i.message)))
  const dangling = structuredClone(brief.draft)
  dangling.nodes.push(createToolNode('set', 'orphan'))
  assert.ok(validateToolDefinition(dangling).some(i => /disconnected/.test(i.message)))
  const branches = structuredClone(brief.draft)
  branches.edges.find(e => e.branch === 'false').branch = 'true'
  assert.ok(validateToolDefinition(branches).some(i => /True and False/.test(i.message)))
  const ref = structuredClone(brief.draft)
  ref.nodes.find(n => n.id === 'result').config.value = '$steps.quiet-note'
  assert.match(executeToolPreview(ref, { busyAt: 2 }).error, /unavailable on this branch/)
  const proto = structuredClone(brief.draft)
  proto.nodes.find(n => n.id === 'result').config.value = '$input.__proto__'
  assert.match(executeToolPreview(proto, {}).error, /Invalid reference/)
  const unknownRef = structuredClone(brief.draft)
  unknownRef.nodes.find(n => n.id === 'result').config.value = '$steps.missing'
  assert.ok(validateToolDefinition(unknownRef).some(i => /existing node/.test(i.message)))
  const write = (await client.get('mail-send')).draft
  write.effect = 'read'
  assert.ok(validateToolDefinition(write).some(i => /Declared effect/.test(i.message)), 'A write connector cannot declare read-only behavior')
  const raw = structuredClone(brief.draft)
  raw.credentialRefs = ['sk-raw-key']
  assert.ok(validateToolDefinition(raw).length)
  raw.credentialRefs = ['connection:mail']
  raw.secret = 'credential'
  assert.ok(validateToolDefinition(raw).length, 'Raw credential fields are not part of definition schema')
  const connector = (await client.get('host')).draft
  connector.nodes.find(n => n.type === 'tool_call').config.tool = 'arbitrary.script'
  assert.equal(executeToolPreview(connector, {}).status, 'failed', 'Unknown executor cannot run')
  const wrongOutput = structuredClone(brief.draft)
  wrongOutput.outputs[0].type = 'number'
  wrongOutput.outputs[0].default = 0
  assert.match(executeToolPreview(wrongOutput, {}).error, /Output summary/)
  const arithmetic = (await client.get('normalize-labels')).draft
  arithmetic.nodes.find(n => n.id === 'estimate').config = { operator: 'divide', left: 1, right: 0 }
  assert.match(executeToolPreview(arithmetic, {}).error, /divide by zero/)
  const freshTool = await client.create('New tool')
  assert.deepEqual(validateToolDefinition(freshTool.draft), [])
  await client.remove(freshTool.id)
  await assert.rejects(client.get(freshTool.id), /no longer exists/)
  assert.ok(updates > 0)
  unsubscribe(); const before = updates
  await client.create('After unsubscribe')
  assert.equal(updates, before)
  const nestedClient = createToolWorkspacePreview()
  const childV1 = await nestedClient.publish('morning-brief')
  const parent = await nestedClient.create('Call a saved briefing')
  const compose = (d, childId, version = 1) => {
    const call = createToolNode('workflow_call', 'child')
    call.config = { toolId: childId, version, args: {} }
    d.nodes.splice(1, 0, call)
    d.edges = [{ id: 'a', source: 'input', target: 'child' }, { id: 'b', source: 'child', target: 'result' }]
    return d
  }
  await nestedClient.save(compose(parent.draft, 'morning-brief', childV1.version))
  const parentV1 = await nestedClient.publish(parent.id)
  const nestedRun = await nestedClient.run(parent.id, {}, parentV1.version)
  assert.equal(nestedRun.status, 'completed')
  assert.match(nestedRun.output.summary, /focus block/)
  assert.equal(nestedRun.steps.find(s => s.nodeId === 'child').child.version, 1)
  assert.equal(nestedRun.steps.find(s => s.nodeId === 'child').child.steps.find(s => s.nodeId === 'quiet-note').status, 'skipped')
  const childEdit = (await nestedClient.get('morning-brief')).draft
  childEdit.nodes.find(n => n.id === 'busy-note').config.value = { summary: 'New child version' }
  await nestedClient.save(childEdit)
  await nestedClient.publish('morning-brief')
  assert.equal((await nestedClient.run(parent.id, {}, 1)).output.summary, nestedRun.output.summary, 'Parent remains pinned to the published child version')
  await assert.rejects(nestedClient.remove('morning-brief'), /referenced/, 'Published children cannot disappear under pinned parents')
  const missing = (await nestedClient.get(parent.id)).draft
  missing.nodes.find(n => n.type === 'workflow_call').config.version = 999
  await nestedClient.save(missing)
  await assert.rejects(nestedClient.publish(parent.id), /does not exist/)
  assert.match((await nestedClient.run(parent.id, {})).error, /does not exist/)
  const stepBounded = structuredClone(parentV1.definition)
  stepBounded.budgets.maxSteps = 3
  const resolve = (id, version) => id === 'morning-brief' && version === 1 ? childV1.definition : undefined
  assert.match(executeToolPreview(stepBounded, {}, 'draft', resolve).error, /Step budget/, 'Nested work consumes the parent budget')
  const recursive = compose(createToolDefinition('recursive', 'Recursive'), 'recursive')
  assert.match(executeToolPreview(recursive, {}, 1, () => recursive).error, /Recursive published tool/, 'Nested cycles cannot recurse indefinitely')
  const chain = Array.from({ length: 10 }, (_, i) => i === 9 ? createToolDefinition(`depth-${i}`, 'End') : compose(createToolDefinition(`depth-${i}`, 'Nested'), `depth-${i + 1}`))
  assert.match(executeToolPreview(chain[0], {}, 1, id => chain.find(d => d.id === id)).error, /depth limit/, 'Depth is bounded independently of step counts')
  const writeChild = await nestedClient.publish('mail-send')
  const insufficient = compose(createToolDefinition('insufficient', 'Read declared'), 'mail-send')
  assert.match(executeToolPreview(insufficient, {}, 'draft', () => writeChild.definition).error, /Declared effect/, 'Nested tools cannot hide write effects')
  const loopChild = (await nestedClient.get('normalize-labels')).draft
  const repeated = compose(createToolDefinition('two-loops', 'Two calls'), 'normalize-labels')
  repeated.budgets.maxLoopItems = 5
  const second = createToolNode('workflow_call', 'second')
  second.config = { toolId: 'normalize-labels', version: 1, args: {} }
  repeated.nodes.splice(2, 0, second)
  repeated.edges = [{ id: 'a', source: 'input', target: 'child' }, { id: 'b', source: 'child', target: 'second' }, { id: 'c', source: 'second', target: 'result' }]
  assert.match(executeToolPreview(repeated, {}, 'draft', () => loopChild).error, /Loop item budget/, 'Sibling calls share the root loop budget')
  console.log('Tool workspace checks passed: graph validation, bounded execution, branch receipts, contracts, version isolation, fixture-only actions, subscriptions.')
}
main().catch(error => { console.error(error); process.exit(1) })
