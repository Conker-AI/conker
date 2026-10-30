// Running a tool by hand: the inputs form made from a tool's input list, what a run's answer
// means, the readable result, and finding the draft a published tool came from.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createHash, webcrypto } = require('node:crypto')
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
  const run = load('src/lib/tool-run.ts')
  const { runFields, initialValues, readRunInputs, inputLabel, runOutcome, runResult, resultView, inputsLine, workflowTool, automationIdFor, findRunTarget, ARGUMENT_LIMIT } = run

  // Every ToolGate input type becomes its own field; labels are words, not identifiers.
  const fields = runFields([
    { name: 'chat', type: 'string', required: true, description: 'Which chat to read.' },
    { name: 'days', type: 'number', minimum: 1, maximum: 30 },
    { name: 'limit', type: 'integer', required: true, default: 5 },
    { name: 'only_new', type: 'boolean', required: true },
    { name: 'includeQuestions', type: 'boolean' },
    { name: 'priority', type: 'string', allowed_values: ['low', 'high'], required: true },
    { name: 'level', type: 'integer', enum: [1, 2, 3], default: 2 },
    { name: 'skip_people', type: 'array', item_type: 'string' },
    { name: 'counts', type: 'array', item_type: 'integer', max_items: 3 },
    { name: 'rows', type: 'array', item_type: 'object' },
    { name: 'filters', type: 'object' },
    { name: 'body', type: 'string', max_length: 4000 },
    { name: 'when', type: 'date' },
  ])
  assert.deepEqual(fields.map(field => [field.name, field.kind]), [
    ['chat', 'text'], ['days', 'number'], ['limit', 'integer'], ['only_new', 'switch'], ['includeQuestions', 'choice'], ['priority', 'choice'],
    ['level', 'choice'], ['skip_people', 'list'], ['counts', 'list'], ['rows', 'json'], ['filters', 'json'], ['body', 'long-text'], ['when', 'text'],
  ], 'Text, number, yes/no, choice, list and JSON each get their own field; unknown types are text')
  assert.equal(fields[0].label, 'Chat'); assert.equal(fields[0].help, 'Which chat to read.')
  assert.equal(inputLabel('includeQuestions'), 'Include questions'); assert.equal(inputLabel('skip_people'), 'Skip people')
  assert.deepEqual(fields[4].choices, [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }], 'An optional yes/no can be left out, so it is a choice, not a switch')
  assert.deepEqual(fields[6].choices.map(choice => choice.value), ['1', '2', '3'], 'Choice values keep their JSON type')
  assert.equal(fields[7].items, 'text'); assert.equal(fields[8].items, 'integer'); assert.equal(fields[9].shape, 'array'); assert.equal(fields[10].shape, 'object')
  const start = initialValues(fields)
  assert.equal(start.limit, '5', 'A default fills its field'); assert.equal(start.level, '2'); assert.equal(start.only_new, false); assert.equal(start.chat, '')

  // Nothing is sent until every field is right; every wrong field says what to write.
  const empty = readRunInputs(fields, start)
  assert.equal(empty.args, null)
  assert.deepEqual(Object.keys(empty.errors).sort(), ['chat', 'priority'], 'Only required fields left empty are errors')
  assert.equal(empty.errors.chat, 'Fill this in.'); assert.equal(empty.errors.priority, 'Choose one.')
  const filled = { ...start, chat: 'Physics 101', priority: '"high"', includeQuestions: 'false', days: ' 7 ', skip_people: 'Dana\n\n  Noa  \n', counts: '1\n2', rows: '[{"a": 1}]', filters: '{"from": "Dana"}' }
  const good = readRunInputs(fields, filled)
  assert.equal(good.errors, null)
  assert.deepEqual(good.args, { chat: 'Physics 101', days: 7, limit: 5, only_new: false, includeQuestions: false, priority: 'high', level: 2, skip_people: ['Dana', 'Noa'], counts: [1, 2], rows: [{ a: 1 }], filters: { from: 'Dana' } },
    'Typed values, trimmed list lines, a required switch always sent, empty optional fields left out')
  const wrong = readRunInputs(fields, { ...filled, days: '40', limit: '2.5', counts: '1\nx', rows: '{"a": 1}', filters: '{nope', chat: '   ' })
  assert.deepEqual(wrong.errors, { chat: 'Fill this in.', days: 'Use 30 or less.', limit: 'Write a whole number, like 3.', counts: 'Line 2: Write a number, like 3 or 2.5.', rows: 'This must be a list in [ ].', filters: 'Write a JSON object, like {"key": "value"}.' })
  assert.equal(readRunInputs(fields, { ...filled, counts: '1\n2\n3\n4' }).errors.counts, 'Use at most 3 items.')
  assert.equal(readRunInputs(fields, { ...filled, body: 'x'.repeat(4001) }).errors.body, 'Use at most 4000 characters.')
  assert.equal(readRunInputs(fields, { ...filled, priority: '"urgent"' }).errors.priority, 'Choose one of the options.', 'Only offered choices are sent')
  assert.match(readRunInputs(fields, { ...filled, chat: 'x'.repeat(ARGUMENT_LIMIT) }).errors[''], /too long to send/, 'The 32 KB argument limit is checked before sending')
  const lengths = runFields([{ name: 'code', type: 'string', required: true, min_length: 3, max_length: 4 }])
  assert.equal(readRunInputs(lengths, { code: 'ab' }).errors.code, 'Use at least 3 characters.')
  assert.deepEqual(readRunInputs(runFields([{ name: 'tags', type: 'array', required: true }]), { tags: ' ' }).errors, { tags: 'Add at least one item, one per line.' })
  assert.deepEqual(readRunInputs([], {}), { args: {}, errors: null }, 'A tool without inputs runs with none')
  assert.deepEqual(runFields([{ name: '', type: 'string' }]), [], 'An input without a name is not a field')

  // The answer in the state words; nothing is "done" unless ToolGate said OK.
  assert.deepEqual(runOutcome({ code: 'OK', action_id: 'a' }), { state: 'done', reason: null, requestId: null })
  assert.deepEqual(runOutcome({ code: 'CONFIRMATION_REQUIRED', action_id: 'a', request_id: 'req_1' }), { state: 'approval', reason: null, requestId: 'req_1' })
  for (const code of ['OUTCOME_UNKNOWN', 'IN_PROGRESS']) assert.equal(runOutcome({ code, action_id: 'a' }).state, 'unknown', `${code} is never shown as done or failed`)
  const failed = runOutcome({ code: 'WORKFLOW_FAILED', action_id: 'a', result: { code: 'WORKFLOW_FAILED', message: 'Inner' }, steps: [{ nodeId: 's', label: 'Start', type: 'input', status: 'completed' }, { nodeId: 'r', label: 'Read the chat', type: 'tool_call', status: 'failed', error: 'No such chat.' }] })
  assert.deepEqual(failed, { state: 'failed', reason: 'It stopped at “Read the chat”: No such chat.', requestId: null }, 'A failed run names the step it stopped at')
  assert.equal(runOutcome({ code: 'WORKFLOW_FAILED', action_id: 'a', result: { message: 'Budget ran out.' } }).reason, 'Budget ran out.')
  assert.match(runOutcome({ code: 'LOCKED_DOWN', action_id: 'a' }).reason, /locked down/)
  assert.match(runOutcome({ code: 'SOMETHING_NEW', action_id: 'a' }).reason, /didn’t run/, 'An unknown refusal still says it did not run')
  assert.deepEqual(runResult({ code: 'OK', action_id: 'a', result: { code: 'OK', result: ['x'] } }), ['x'], 'The editor envelope is unwrapped')
  assert.deepEqual(runResult({ code: 'OK', action_id: 'a', result: { items: 1 } }), { items: 1 })

  // Readable results: text, lists, fields, tables; JSON only for the rest.
  assert.deepEqual(resultView('Sent.'), { kind: 'text', text: 'Sent.', title: undefined })
  assert.deepEqual(resultView(null), { kind: 'empty', title: undefined })
  assert.deepEqual(resultView(['a', 2]), { kind: 'list', items: ['a', '2'], title: undefined })
  const table = resultView({ deadlines: [{ what: 'Worksheet', due: 'Fri' }, { what: 'Report', extra: { a: 1 } }] })
  assert.deepEqual(table, { kind: 'table', columns: ['what', 'due', 'extra'], rows: [['Worksheet', 'Fri', ''], ['Report', '', '{"a":1}']], total: 2, title: 'Deadlines' }, 'A one-key object is a titled table')
  const long = resultView(Array.from({ length: 80 }, (_, index) => Object.fromEntries(Array.from({ length: 12 }, (_, key) => [`c${key}`, index]))))
  assert.equal(long.rows.length, 50); assert.equal(long.total, 80); assert.equal(long.columns.length, 8, 'Big tables are capped; the rest is under More details')
  assert.deepEqual(resultView({ sent: true, count: 3 }), { kind: 'fields', fields: [{ label: 'Sent', value: 'true' }, { label: 'Count', value: '3' }], title: undefined })
  assert.equal(resultView({ a: { b: [1, { c: 2 }] }, d: 1 }).kind, 'json', 'Nested results fold as JSON')
  assert.equal(resultView([1, { a: 1 }]).kind, 'json', 'Mixed lists fold as JSON')
  assert.equal(inputsLine({ chat: 'Physics', only_new: true, skip_people: ['Dana', 'Noa'] }), 'Chat: Physics · Only new: true · Skip people: Dana, Noa'); assert.equal(inputsLine({}), 'No inputs')

  // A published tool's id names its draft's automation; the draft is confirmed by its publications.
  const digest = 'd'.repeat(64)
  assert.equal(workflowTool('web.search'), null)
  assert.equal(workflowTool(`workflow:editor-${'a'.repeat(32)}:0:${digest}`), null, 'Version 0 is not a publication')
  const expected = `editor-${createHash('sha256').update('study-group').digest('hex').slice(0, 32)}`
  assert.equal(await automationIdFor('study-group'), expected, 'Same name as ToolGate (editor_publication.automation_id)')
  const tool = workflowTool(`workflow:${expected}:2:${digest}`)
  assert.deepEqual(tool, { automationId: expected, version: 2, digest })
  const asked = []
  const publication = (id, automation, version) => ({ draft_id: id, revision: 1, automation_id: automation, version, digest, published_at: '2026-10-29T10:00:00Z', authorization: 'owner_confirmation', available: true })
  const drafts = (pages, publications) => ({
    async list(after) { return pages[after ?? 'first'] },
    async publications(id) { asked.push(id); return publications[id] ?? [] },
  })
  const page = (ids, next = null) => ({ items: ids.map(id => ({ id, revision: 1, updated_at: '2026-10-29T10:00:00Z', name: id, kind: 'workflow' })), next_after: next })
  const many = Array.from({ length: 12 }, (_, index) => `other-${index}`)
  const found = await findRunTarget(drafts({ first: page(many, 'other-11'), 'other-11': page(['study-group']) }, { 'study-group': [publication('study-group', expected, 2)] }), tool)
  assert.deepEqual(found, { draftId: 'study-group', version: 2, digest, available: true, authorization: 'owner_confirmation' })
  assert.deepEqual(asked, ['study-group'], 'Every page is read, and the draft whose id hashes to the tool is asked first and alone')
  asked.length = 0
  const renamed = await findRunTarget(drafts({ first: page(['a', 'b', 'c']) }, { b: [publication('b', expected, 2)] }), tool)
  assert.equal(renamed.draftId, 'b', 'Without a hash match every draft is asked')
  asked.length = 0
  assert.equal(await findRunTarget(drafts({ first: page(['study-group']) }, { 'study-group': [publication('study-group', expected, 1)] }), tool), null, 'Another version of the same draft is not this tool')
  console.log('PASS run a tool by hand: form, validation, states, readable results, draft lookup')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
