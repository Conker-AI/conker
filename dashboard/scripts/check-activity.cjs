const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const cache = new Map()
function load(file) {
  if (cache.has(file)) return cache.get(file)
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', compiled)(name => load(path.posix.normalize(path.posix.join(path.posix.dirname(file), `${name}.ts`))), module, module.exports)
  cache.set(file, module.exports)
  return module.exports
}
const { mergeActivityRun, activityPresentation, activityDuration, formatActivityRecord, activitySourceHref, activityReceiptHref, groupActivitySteps } = load('src/lib/conversation-activity.ts')
const { createActivityScenario, activityScenarios, isActivityScenarioName } = load('src/lib/api/activity-fixtures.ts')
let checks = 0
function check(name, test) { test(); checks++; process.stdout.write(`PASS ${name}\n`) }

check('Snapshots are deterministic, isolated and explicitly preview', () => {
  for (const { id } of activityScenarios) {
    const sequence = createActivityScenario(id)
    assert.deepEqual(sequence, createActivityScenario(id))
    assert.ok(sequence.every(run => run.provenance === 'preview'))
    assert.ok(sequence.every((run, i) => run.sequence === i + 1))
    sequence[0].steps[0].label = 'Mutation'
    assert.notEqual(createActivityScenario(id)[0].steps[0].label, 'Mutation')
    if (sequence.length > 1) assert.notEqual(sequence[1].steps[0].label, 'Mutation')
  }
  assert.equal(isActivityScenarioName('normal request to search'), false)
})
check('Duplicate/stale events cannot duplicate evidence or regress terminal runs', () => {
  const [first, second, third, done] = createActivityScenario('search-read')
  assert.deepEqual(mergeActivityRun(first, first), first)
  assert.deepEqual(mergeActivityRun(second, first), second)
  const settled = mergeActivityRun(third, done)
  assert.equal(new Set(settled.steps.map(step => step.id)).size, settled.steps.length)
  assert.deepEqual(mergeActivityRun(settled, { ...first, sequence: 999 }), settled)
  assert.equal(mergeActivityRun(second, { ...third, steps: [{ ...first.steps[0], sequence: 999 }] }).steps[0].status, 'complete')
})
check('Stopping parents settles children without inventing success', () => {
  const stopped = createActivityScenario('stopped-children').at(-1)
  assert.equal(stopped.status, 'stopped')
  assert.ok(stopped.steps.every(step => step.status === 'stopped'))
  const nested = mergeActivityRun(undefined, { id: 'nested', status: 'running', phase: 'agent', label: 'Other work', provenance: 'preview', steps: [
    { id: 'grandchild', parentId: 'child', kind: 'tool', label: 'Nested tool', status: 'running' },
    { id: 'child', parentId: 'parent', kind: 'agent', label: 'Child', status: 'running' },
    { id: 'parent', kind: 'agent', label: 'Parent', status: 'failed' },
  ] })
  assert.ok(nested.steps.every(step => !['waiting', 'running'].includes(step.status)))
  const complete = mergeActivityRun(undefined, { ...nested, status: 'complete', steps: [{ id: 'unfinished', kind: 'tool', label: 'Unfinished', status: 'running' }] })
  assert.equal(complete.steps[0].status, 'stopped')
})
check('Named agents, handoff and wait retain honest states', () => {
  const sequence = createActivityScenario('delegation')
  assert.equal(sequence[1].steps.find(step => step.agentName === 'Editor').status, 'running')
  assert.equal(sequence.at(-1).steps.find(step => step.id === 'editor').status, 'complete')
  assert.equal(sequence[1].steps.find(step => step.kind === 'handoff').handoffTo.name, 'Editor')
  const wait = createActivityScenario('approval-wait').at(-1)
  assert.equal(wait.steps[0].status, 'waiting')
  assert.equal(wait.steps[0].approvalId, 'coach')
  assert.ok(createActivityScenario('tool-failure').at(-1).steps[0].failure.recovery)
  assert.equal(createActivityScenario('unavailable-summary').at(-1).steps.at(-1).summaryAvailability, 'unavailable')
})
check('Receipt assets exist and supplied diff counts match', () => {
  for (const { id } of activityScenarios) for (const run of createActivityScenario(id)) for (const step of run.steps) {
    if (!step.receipt?.href) continue
    const href = activityReceiptHref(step.receipt.href)
    assert.ok(href)
    const content = fs.readFileSync(path.join(root, 'public', href), 'utf8')
    if (step.receipt.kind === 'diff') {
      const lines = content.split(/\r?\n/)
      assert.equal(lines.filter(line => line.startsWith('+') && !line.startsWith('+++')).length, step.receipt.added)
      assert.equal(lines.filter(line => line.startsWith('-') && !line.startsWith('---')).length, step.receipt.removed)
    }
  }
  assert.equal(activityReceiptHref('/fixtures/activity/../../private.txt'), undefined)
  assert.equal(activityReceiptHref('https://example.com/result'), undefined)
})
check('Public evidence rendering is bounded and redacts credential fields', () => {
  const cyclic = { authorization: 'do-not-show', nested: { apiKey: 'hidden', password: 'secret' }, result: 'a'.repeat(90000) }
  cyclic.self = cyclic
  const text = formatActivityRecord(cyclic)
  assert.ok(!text.includes('do-not-show') && !text.includes('hidden') && !text.includes('secret'))
  assert.ok(text.includes('[Redacted]') && text.includes('[Circular reference]'))
  assert.ok(text.length < 12100)
  assert.ok(formatActivityRecord({ rows: Array.from({ length: 5000 }, () => ({ value: 'x'.repeat(5000) })) }).length < 12100)
  const grouped = groupActivitySteps(createActivityScenario('large-receipt').at(-1).steps)
  assert.equal(grouped.find(group => group.length > 1).length, 100)
})
check('Unsafe sources stay unavailable and ordinary source URLs are preserved', () => {
  for (const href of ['javascript:alert(1)', 'data:text/html,hi', '//evil.test', '/\\evil.test', 'https://user:password@example.test', '/path\nother']) assert.equal(activitySourceHref(href), undefined)
  assert.equal(activitySourceHref('/fixtures/activity/notes.txt'), '/fixtures/activity/notes.txt')
  assert.equal(activitySourceHref('https://example.test/notes'), 'https://example.test/notes')
})
check('Character states use activity slots without emotions or speech inference', () => {
  assert.equal(activityPresentation('streaming').activity, 'thinking')
  assert.equal(activityPresentation('waiting').activity, 'idle')
  assert.equal(activityPresentation('waiting').animate, false)
  assert.equal(activityPresentation('agent', 'complete').animate, false)
  assert.equal(activityPresentation('tool', 'failed').activity, 'idle')
  assert.equal(activityDuration('invalid', 12), '')
  assert.equal(activityDuration('2026-01-01T00:00:00Z', '2026-01-01T00:01:01Z'), '1m 1s')
})
process.stdout.write(`${checks} activity checks passed.\n`)
