const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const cache = new Map()
function load(relative) {
  if (cache.has(relative)) return cache.get(relative)
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(request => request === 'zod' ? require('zod') : load(`${path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))}.ts`), module, module.exports)
  cache.set(relative, module.exports)
  return module.exports
}
const { createTaskPreviewClient } = load('src/lib/api/task-preview.ts')
const { projectActivity, safeActivityHref } = load('src/lib/api/activity-projection.ts')
const { createActivityScenario } = load('src/lib/api/activity-fixtures.ts')
const at = '2026-09-20T10:00:00Z'
const input = { outcome: ' Prepare a sourced report ', criteria: ['Sources checked', 'Report reviewed'], sessionId: 'session', agentId: 'agent' }
function fixture() {
  let state = { tasks: [], sessions: [{ id: 'session' }], agents: [{ id: 'agent' }], runs: [{ id: 'observed-run' }] }
  let id = 0, commits = 0
  const client = createTaskPreviewClient({ getSnapshot: () => state, setTasks: tasks => { state = { ...state, tasks }; commits++ }, now: () => at, newId: () => String(++id) })
  return { client, state: () => state, commits: () => commits }
}
async function main() {
  const { client, state, commits } = fixture()
  for (const patch of [{ outcome: '' }, { criteria: [] }, { criteria: ['One', ' one '] }, { sessionId: 'absent' }, { agentId: 'absent' }, { runIds: ['invented'] }, { parentTaskId: 'absent' }, { status: 'completed' }]) await assert.rejects(client.create({ ...input, ...patch }))
  assert.equal(commits(), 0, 'Invalid requests commit nothing')
  state().agents[0].archivedAt = at
  await assert.rejects(client.create(input), /unarchived agent/)
  delete state().agents[0].archivedAt
  state().sessions[0].archived = true
  await assert.rejects(client.create(input), /unarchived conversation/)
  state().sessions[0].archived = false
  const task = await client.create({ ...input, runIds: ['observed-run'] })
  assert.equal(task.outcome, 'Prepare a sourced report')
  assert.equal(task.status, 'planned')
  assert.equal(task.statusSource, 'owner')
  assert.equal(task.provenance, 'preview')
  assert.deepEqual(task.runIds, ['observed-run'])
  assert.equal(task.changes.length, 1)
  task.criteria[0].text = 'Caller mutation'
  assert.equal((await client.list())[0].criteria[0].text, 'Sources checked')
  const untouched = JSON.stringify(state().tasks)
  await assert.rejects(client.transition(task.id, 'completed', { note: 'Skip work', completedCriterionIds: task.criteria.map(c => c.id) }, 1), /Cannot change/)
  await assert.rejects(client.archive(task.id, true, 1), /Complete or cancel/)
  await assert.rejects(client.transition(task.id, 'in_progress', { note: '' }, 1), /Explain/)
  assert.equal(JSON.stringify(state().tasks), untouched)
  let current = await client.transition(task.id, 'in_progress', { note: 'Owner is reviewing the outcome' }, 1)
  assert.equal(current.status, 'in_progress')
  assert.equal(current.runIds.length, 1, 'Tracking does not manufacture attempts')
  await assert.rejects(client.update(task.id, input, 1), /changed/)
  await assert.rejects(client.transition(task.id, 'completed', { note: 'Done', completedCriterionIds: [current.criteria[0].id] }, current.revision), /every current/)
  await assert.rejects(client.transition(task.id, 'completed', { note: 'Done', completedCriterionIds: [current.criteria[0].id, current.criteria[0].id] }, current.revision), /every current/)
  current = await client.transition(task.id, 'completed', { note: 'Owner checked both criteria against the report', completedCriterionIds: current.criteria.map(c => c.id) }, current.revision)
  assert.equal(current.status, 'completed')
  assert.equal(current.statusSource, 'owner')
  await assert.rejects(client.update(task.id, input, current.revision), /Reopen/)
  current = await client.archive(task.id, true, current.revision)
  await assert.rejects(client.transition(task.id, 'planned', { note: 'More work' }, current.revision), /Restore/)
  const historyLength = current.changes.length
  current = await client.archive(task.id, false, current.revision)
  current = await client.transition(task.id, 'planned', { note: 'Review a revised report' }, current.revision)
  assert.equal(current.completedCriterionIds.length, 0)
  assert.ok(current.changes.length > historyLength)
  const oldCriteria = current.criteria
  current = await client.update(task.id, { ...input, criteria: ['Sources checked', 'Revised report reviewed'] }, current.revision)
  assert.equal(current.criteria[0].id, oldCriteria[0].id)
  assert.notEqual(current.criteria[1].id, oldCriteria[1].id, 'Changed criteria cannot reuse a completed review')
  const child = await client.create({ ...input, outcome: 'Check citations', parentTaskId: task.id })
  await assert.rejects(client.update(task.id, { ...input, parentTaskId: child.id }, current.revision), /ancestor/)
  await assert.rejects(client.cancel(task.id, 'Stop', current.revision), /child tasks/)
  let cancelledChild = await client.cancel(child.id, 'Owner stopped tracking this child', child.revision)
  current = await client.cancel(task.id, 'Owner stopped tracking; no external cancellation sent', current.revision)
  await assert.rejects(client.transition(child.id, 'planned', { note: 'Resume child' }, cancelledChild.revision), /parent task/)
  cancelledChild = await client.archive(child.id, true, cancelledChild.revision)
  assert.equal(cancelledChild.status, 'cancelled')
  assert.equal((await fixture().client.list()).length, 0, 'No cross-client state or browser persistence')

  const sequence = createActivityScenario('search-read')
  const activity = { ...sequence.at(-1), startedAt: at }
  const receiptRun = { id: 'receipt-run', status: 'complete', phase: 'tool', label: 'Receipt sample', provenance: 'preview', steps: [
    { id: 'thinking', kind: 'phase', label: 'Private reasoning is not an event', status: 'complete' },
    { id: 'plan', kind: 'plan', label: 'Proposed steps are not events', status: 'complete' },
    { id: 'receipt', kind: 'receipt', label: 'Known fixture', status: 'complete', receipt: { id: 'file', label: 'Notes', kind: 'file', href: '/fixtures/activity/notes.txt' } },
    { id: 'unsafe', kind: 'receipt', label: 'Unknown fixture', status: 'complete', receipt: { id: 'unknown', label: 'Unreviewed asset', kind: 'file', href: 'https://example.com/private' } },
  ] }
  const toolRun = { id: 'same', toolId: 'tool', version: 2, startedAt: at, finishedAt: at, status: 'completed', mode: 'preview', input: {}, output: { report: 'preview' }, steps: [
    { nodeId: 'skipped', label: 'Not attempted', type: 'tool_call', status: 'skipped' },
    { nodeId: 'child', label: 'Nested test', type: 'workflow_call', status: 'completed', child: { id: 'nested', toolId: 'other', version: 1, startedAt: at, finishedAt: at, status: 'failed', mode: 'preview', input: {}, steps: [] } },
  ] }
  const sources = {
    sessions: [{ id: 'session', title: 'Report' }],
    conversations: { session: { messages: [{ id: 'answer', activity }, { id: 'receipt', activity: receiptRun }, { id: 'redacted', redacted: true, activity: { ...receiptRun, id: 'secret-run' } }] } },
    jobs: [{ id: 'job', name: 'Job history', history: [{ id: 'same', startedAt: at, status: 'Completed', source: 'sample', summary: 'Sample fixture result' }] }],
    tools: [{ id: 'tool', draft: { name: 'Tool test' }, runs: [toolRun] }],
    entries: [{ id: 'old', time: 'Today · 16:43', actor: 'Conker', event: 'Sample action', detail: 'Example only', source: '/chat/session' }],
    journalProvenance: 'sample', tasks: state().tasks,
  }
  const projected = projectActivity(sources)
  assert.equal(new Set(projected.runs.map(run => run.id)).size, projected.runs.length, 'Namespace collisions do not merge unrelated attempts')
  assert.ok(projected.runs.every(run => run.provenance === 'sample' || run.provenance === 'preview'))
  assert.ok(!projected.events.some(event => /Private reasoning|Proposed steps|Not attempted/.test(event.label)))
  assert.ok(!projected.runs.some(run => run.source.runId === 'secret-run'))
  const known = projected.events.find(event => event.label === 'Known fixture')
  assert.equal(known.receipt.href, '/fixtures/activity/notes.txt')
  assert.equal(projected.events.find(event => event.label === 'Unknown fixture').receipt.href, undefined)
  const historical = projected.events.find(event => event.source.kind === 'journal')
  assert.equal(historical.occurredAt, null)
  assert.equal(historical.displayTime, 'Today · 16:43')
  const nested = projected.runs.find(run => run.source.runId === 'nested')
  assert.equal(projected.runs.find(run => run.id === nested.parentRunId).source.runId, 'same')
  assert.equal(projected.runs.find(run => run.source.kind === 'job').endedAt, null, 'A start timestamp is not a completion timestamp')
  const unknownTime = projectActivity({ ...sources, jobs: [{ ...sources.jobs[0], history: [{ ...sources.jobs[0].history[0], startedAt: '2026-09-20T10:00:00' }] }] })
  assert.equal(unknownTime.runs.find(run => run.source.kind === 'job').startedAt, null, 'Timezone-free source times are not absolute timestamps')
  const linked = projected.runs.find(run => run.source.kind === 'tool' && !run.parentRunId)
  assert.equal(linked.source.href, '/tools?tool=tool')
  linked.outputs[0].value.report = 'Mutation'
  assert.equal(toolRun.output.report, 'preview')
  assert.deepEqual(projectActivity(sources), projectActivity(sources), 'Stable IDs and deterministic projection')
  assert.ok(projected.events.filter(event => event.kind === 'task_change').every(event => event.actor === 'Owner' && event.provenance === 'preview'))
  for (const href of ['javascript:alert(1)', '//other.test/path', '/\\other.test', '/path\u0000name', 'https://user:pass@example.com']) assert.equal(safeActivityHref(href), undefined)
  assert.equal(safeActivityHref('/chat/session'), '/chat/session')
  assert.equal(safeActivityHref('https://example.com/source'), 'https://example.com/source')
  console.log('Task lifecycle, review, revision conflicts, lineage, isolation and truthful Activity projection checks passed.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
