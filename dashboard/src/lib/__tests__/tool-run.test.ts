import { describe, expect, it } from 'vitest'
import type { GatewayEditorDrafts } from '../gateway/editor-drafts'
import {
  ARGUMENT_LIMIT,
  RUN_STATE,
  TABLE_COLUMNS,
  TABLE_ROWS,
  automationIdFor,
  findRunTarget,
  initialValues,
  inputLabel,
  inputsLine,
  readRunInputs,
  resultView,
  runFields,
  runOutcome,
  runResult,
  workflowTool,
  type RunAnswer,
  type RunField,
  type ToolInput,
} from '../tool-run'

const answer = (value: Record<string, unknown>) => value as unknown as RunAnswer
const field = (partial: Partial<RunField> & Pick<RunField, 'name' | 'kind'>): RunField => ({ label: partial.name, required: false, initial: '', ...partial })

describe('tool run: the inputs form', () => {
  it('turns names into plain labels', () => {
    expect(inputLabel('include_questions')).toBe('Include questions')
    expect(inputLabel('maxResults')).toBe('Max results')
    expect(inputLabel('web-search.limit')).toBe('Web search limit')
    expect(inputLabel('___')).toBe('___')
  })

  it('makes one typed field per input and drops unnamed ones', () => {
    const inputs: ToolInput[] = [
      { name: 'chat', type: 'string', required: true, description: '  Which chat  ', default: 'Study group' },
      { name: '', type: 'string' },
      { name: 'days', type: 'integer', minimum: 1, maximum: 7, default: 3 },
      { name: 'ratio', type: 'NUMBER' },
      { name: 'notes', type: 'string', max_length: 500 },
    ]
    const fields = runFields(inputs)
    expect(fields.map(item => [item.name, item.kind, item.required, item.initial])).toEqual([
      ['chat', 'text', true, 'Study group'],
      ['days', 'integer', false, '3'],
      ['ratio', 'number', false, ''],
      ['notes', 'long-text', false, ''],
    ])
    expect(fields[0].help).toBe('Which chat')
    expect(fields[1]).toMatchObject({ min: 1, max: 7 })
  })

  it('builds choices from allowed values and keeps only a default that is one of them', () => {
    const [known] = runFields([{ name: 'mode', allowed_values: ['fast', 3, true, { no: 1 }], default: 3 }])
    expect(known.kind).toBe('choice')
    expect(known.choices).toEqual([
      { value: '"fast"', label: 'fast' },
      { value: '3', label: '3' },
      { value: 'true', label: 'true' },
    ])
    expect(known.initial).toBe('3')
    const [unknown] = runFields([{ name: 'mode', enum: ['a', 'b'], default: 'c' }])
    expect(unknown.initial).toBe('')
  })

  it('shows a required yes/no as a switch and an optional one as a choice', () => {
    const [required] = runFields([{ name: 'flag', type: 'boolean', required: true, default: true }])
    expect(required).toMatchObject({ kind: 'switch', initial: true })
    const [optional] = runFields([{ name: 'flag', type: 'boolean', default: false }])
    expect(optional.kind).toBe('choice')
    expect(optional.choices).toEqual([
      { value: 'true', label: 'Yes' },
      { value: 'false', label: 'No' },
    ])
    expect(optional.initial).toBe('false')
    expect(runFields([{ name: 'flag', type: 'boolean' }])[0].initial).toBe('')
  })

  it('reads arrays as lists of text or numbers, and anything else as JSON', () => {
    const [text, numbers, objects, badDefault] = runFields([
      { name: 'tags', type: 'array', default: ['a', 'b'] },
      { name: 'ids', type: 'array', item_type: 'integer', default: [1, 2] },
      { name: 'rows', type: 'array', item_type: 'object', default: [{ a: 1 }] },
      { name: 'more', type: 'array', default: [1, 'x'] },
    ])
    expect(text).toMatchObject({ kind: 'list', items: 'text', initial: 'a\nb' })
    expect(numbers).toMatchObject({ kind: 'list', items: 'integer', initial: '1\n2' })
    expect(objects).toMatchObject({ kind: 'json', shape: 'array', initial: JSON.stringify([{ a: 1 }], null, 2) })
    expect(badDefault.initial).toBe('')
    expect(runFields([{ name: 'rows', type: 'array', item_type: 'object' }])[0].initial).toBe('')
  })

  it('reads objects as JSON and ignores a default that is not an object', () => {
    const [good, bad] = runFields([
      { name: 'options', type: 'object', default: { a: 1 } },
      { name: 'other', type: 'object', default: [1] },
    ])
    expect(good).toMatchObject({ kind: 'json', shape: 'object', initial: '{\n  "a": 1\n}' })
    expect(bad.initial).toBe('')
  })

  it('has an initial value for each field', () => {
    const fields = runFields([
      { name: 'a', type: 'string', default: 'x' },
      { name: 'b', type: 'boolean', required: true },
    ])
    expect(initialValues(fields)).toEqual({ a: 'x', b: false })
  })
})

describe('tool run: reading what the owner typed', () => {
  it('leaves out empty optional fields and refuses empty required ones in plain words', () => {
    const fields = [
      field({ name: 'a', kind: 'text', required: true }),
      field({ name: 'b', kind: 'choice', required: true, choices: [] }),
      field({ name: 'c', kind: 'list', required: true, items: 'text' }),
      field({ name: 'd', kind: 'text' }),
    ]
    expect(readRunInputs(fields, { a: '  ', b: '', c: '\n', d: '' })).toEqual({
      args: null,
      errors: { a: 'Fill this in.', b: 'Choose one.', c: 'Add at least one item, one per line.' },
    })
    expect(readRunInputs([fields[3]], {})).toEqual({ args: {}, errors: null })
  })

  it('checks numbers against their type and range', () => {
    const integer = field({ name: 'n', kind: 'integer', min: 1, max: 5 })
    const read = (text: string) => readRunInputs([integer], { n: text })
    expect(read('3')).toEqual({ args: { n: 3 }, errors: null })
    expect(read(' 4 ').args).toEqual({ n: 4 })
    expect(read('abc').errors).toEqual({ n: 'Write a number, like 3 or 2.5.' })
    expect(read('2.5').errors).toEqual({ n: 'Write a whole number, like 3.' })
    expect(read('0').errors).toEqual({ n: 'Use 1 or more.' })
    expect(read('6').errors).toEqual({ n: 'Use 5 or less.' })
    expect(readRunInputs([field({ name: 'n', kind: 'number' })], { n: '2.5' }).args).toEqual({ n: 2.5 })
  })

  it('keeps a switch as true or false', () => {
    const fields = [field({ name: 's', kind: 'switch', initial: false })]
    expect(readRunInputs(fields, { s: true }).args).toEqual({ s: true })
    expect(readRunInputs(fields, {}).args).toEqual({ s: false })
  })

  it('keeps a choice as its real JSON type and refuses an unknown option', () => {
    const choice = field({
      name: 'c',
      kind: 'choice',
      choices: [
        { value: '3', label: '3' },
        { value: '"x"', label: 'x' },
      ],
    })
    expect(readRunInputs([choice], { c: '3' }).args).toEqual({ c: 3 })
    expect(readRunInputs([choice], { c: '"x"' }).args).toEqual({ c: 'x' })
    expect(readRunInputs([choice], { c: '4' }).errors).toEqual({ c: 'Choose one of the options.' })
  })

  it('reads a list one item per line and names the bad line', () => {
    const text = field({ name: 't', kind: 'list', items: 'text', minItems: 2, maxItems: 3 })
    expect(readRunInputs([text], { t: 'a\r\n\n b \nc' }).args).toEqual({ t: ['a', 'b', 'c'] })
    expect(readRunInputs([text], { t: 'a' }).errors).toEqual({ t: 'Add at least 2 items.' })
    expect(readRunInputs([text], { t: 'a\nb\nc\nd' }).errors).toEqual({ t: 'Use at most 3 items.' })
    const one = field({ name: 't', kind: 'list', items: 'text', minItems: 1, maxItems: 1 })
    expect(readRunInputs([one], { t: 'a\nb' }).errors).toEqual({ t: 'Use at most 1 item.' })
    const ints = field({ name: 'i', kind: 'list', items: 'integer', min: 0 })
    expect(readRunInputs([ints], { i: '1\n2' }).args).toEqual({ i: [1, 2] })
    expect(readRunInputs([ints], { i: '1\n2.5' }).errors).toEqual({ i: 'Line 2: Write a whole number, like 3.' })
    expect(readRunInputs([ints], { i: '-1' }).errors).toEqual({ i: 'Line 1: Use 0 or more.' })
    expect(readRunInputs([field({ name: 'o', kind: 'list', items: 'text', minItems: 1 })], { o: '' }).args).toEqual({})
  })

  it('reads JSON by the shape the field must hold', () => {
    const object = field({ name: 'o', kind: 'json', shape: 'object' })
    const array = field({ name: 'a', kind: 'json', shape: 'array', minItems: 1 })
    expect(readRunInputs([object], { o: '{"k": 1}' }).args).toEqual({ o: { k: 1 } })
    expect(readRunInputs([object], { o: '{nope' }).errors).toEqual({ o: 'Write a JSON object, like {"key": "value"}.' })
    expect(readRunInputs([object], { o: '[1]' }).errors).toEqual({ o: 'This must be an object in { }.' })
    expect(readRunInputs([object], { o: 'null' }).errors).toEqual({ o: 'This must be an object in { }.' })
    expect(readRunInputs([array], { a: '["x"]' }).args).toEqual({ a: ['x'] })
    expect(readRunInputs([array], { a: '[]' }).errors).toEqual({ a: 'Add at least 1 item.' })
    expect(readRunInputs([array], { a: 'x' }).errors).toEqual({ a: 'Write a JSON list, like ["a", "b"].' })
    expect(readRunInputs([array], { a: '{}' }).errors).toEqual({ a: 'This must be a list in [ ].' })
  })

  it('checks the length of text', () => {
    const text = field({ name: 't', kind: 'text', minLength: 2, maxLength: 4 })
    expect(readRunInputs([text], { t: 'abc' }).args).toEqual({ t: 'abc' })
    expect(readRunInputs([text], { t: 'a' }).errors).toEqual({ t: 'Use at least 2 characters.' })
    expect(readRunInputs([text], { t: 'abcde' }).errors).toEqual({ t: 'Use at most 4 characters.' })
  })

  it('refuses arguments over the 32 KB limit before anything is sent', () => {
    const big = field({ name: 'big', kind: 'long-text' })
    const result = readRunInputs([big], { big: 'x'.repeat(ARGUMENT_LIMIT) })
    expect(result.args).toBeNull()
    expect(result.errors).toEqual({ '': 'These inputs are too long to send (32 KB limit). Shorten the longest one.' })
    expect(readRunInputs([big], { big: 'x'.repeat(ARGUMENT_LIMIT - 20) }).errors).toBeNull()
  })
})

describe('tool run: what an answer means', () => {
  it('says done only for OK', () => {
    expect(runOutcome(answer({ code: 'OK' }))).toEqual({ state: 'done', reason: null, requestId: null })
    expect(runOutcome(answer({ code: 'SOMETHING_NEW' })).state).toBe('failed')
  })

  it('reports an approval request with its id', () => {
    expect(runOutcome(answer({ code: 'CONFIRMATION_REQUIRED', request_id: 'creq_1' }))).toEqual({ state: 'approval', reason: null, requestId: 'creq_1' })
    expect(runOutcome(answer({ code: 'CONFIRMATION_REQUIRED' })).requestId).toBeNull()
  })

  it('treats an unconfirmed run as unknown, not as failed', () => {
    expect(runOutcome(answer({ code: 'OUTCOME_UNKNOWN' })).state).toBe('unknown')
    expect(runOutcome(answer({ code: 'IN_PROGRESS' })).state).toBe('unknown')
  })

  it('names refusals in plain words and falls back for unknown codes', () => {
    expect(runOutcome(answer({ code: 'LOCKED_DOWN' })).reason).toContain('locked down')
    expect(runOutcome(answer({ code: 'POLICY_DENIED' })).reason).toContain('isn’t allowed')
    expect(runOutcome(answer({ code: 'VALIDATION_ERROR' })).reason).toContain('Check them')
    expect(runOutcome(answer({ code: 'WEIRD' })).reason).toBe('Your server turned this run down, so it didn’t run.')
  })

  it('explains a failed workflow by its failed step, else its message, else generally', () => {
    const steps = [
      { label: 'Fetch', status: 'completed' },
      { label: 'Send', status: 'failed', error: 'no network' },
    ]
    expect(runOutcome(answer({ code: 'WORKFLOW_FAILED', steps })).reason).toBe('It stopped at “Send”: no network')
    expect(runOutcome(answer({ code: 'WORKFLOW_FAILED', steps: [{ label: 'Send', status: 'failed' }] })).reason).toBe('It stopped at “Send”.')
    expect(runOutcome(answer({ code: 'WORKFLOW_FAILED', result: { message: 'boom' } })).reason).toBe('boom')
    expect(runOutcome(answer({ code: 'WORKFLOW_FAILED', result: [1] })).reason).toBe('It stopped before it finished.')
    expect(runOutcome(answer({ code: 'WORKFLOW_FAILED', result: { message: 3 } })).reason).toBe('It stopped before it finished.')
  })

  it('has words for every state', () => {
    expect(RUN_STATE.approval).toBe('Waiting for your OK')
    expect(Object.keys(RUN_STATE)).toHaveLength(5)
  })

  it('unwraps a finished workflow result', () => {
    expect(runResult(answer({ code: 'OK', result: { code: 'OK', result: { a: 1 } } }))).toEqual({ a: 1 })
    expect(runResult(answer({ code: 'OK', result: { code: 'OK' } }))).toEqual({ code: 'OK' })
    expect(runResult(answer({ code: 'OK', result: [1] }))).toEqual([1])
    expect(runResult(answer({ code: 'OK', result: 'text' }))).toBe('text')
  })
})

describe('tool run: the result, readable', () => {
  it('shows nothing, text and plain lists', () => {
    expect(resultView(null, 'T')).toEqual({ kind: 'empty', title: 'T' })
    expect(resultView('')).toEqual({ kind: 'empty', title: undefined })
    expect(resultView(5)).toMatchObject({ kind: 'text', text: '5' })
    expect(resultView(Number.NaN).kind).toBe('json')
    expect(resultView([])).toMatchObject({ kind: 'list', items: [] })
    expect(resultView(['a', 2, true])).toMatchObject({ kind: 'list', items: ['a', '2', 'true'] })
  })

  it('turns a list of records into a table with clipped cells and caps', () => {
    const rows = Array.from({ length: TABLE_ROWS + 5 }, (_, index) => ({ n: index, note: Array.from({ length: 300 }, () => 'x'), tags: ['a', 'b'], nested: { k: 1 }, gone: null }))
    const view = resultView(rows)
    if (view.kind !== 'table') throw new Error('expected a table')
    expect(view.total).toBe(TABLE_ROWS + 5)
    expect(view.rows).toHaveLength(TABLE_ROWS)
    expect(view.columns).toEqual(['n', 'note', 'tags', 'nested', 'gone'])
    expect(view.rows[0][1]).toHaveLength(200) // arrays clip at 200 characters
    expect(view.rows[0][1].endsWith('…')).toBe(true)
    expect(view.rows[0][2]).toBe('a, b')
    expect(view.rows[0][3]).toBe('{"k":1}')
    expect(view.rows[0][4]).toBe('')
    const wide = resultView([Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`c${index}`, index]))])
    expect(wide.kind === 'table' && wide.columns).toHaveLength(TABLE_COLUMNS)
  })

  it('shows a single-key object as a titled view of its value', () => {
    expect(resultView({ deadlines: [{ what: 'essay' }] })).toMatchObject({ kind: 'table', title: 'Deadlines', columns: ['what'] })
    expect(resultView({ a: { b: { c: { d: 1 } } } }).kind).toBe('json')
  })

  it('shows a flat record as fields and anything deeper as JSON', () => {
    expect(resultView({ first_name: 'Ann', age: 30, spouse: null })).toEqual({
      kind: 'fields',
      title: undefined,
      fields: [
        { label: 'First name', value: 'Ann' },
        { label: 'Age', value: '30' },
        { label: 'Spouse', value: '' },
      ],
    })
    expect(resultView({ a: 1, b: { c: 1 } }).kind).toBe('json')
    expect(resultView({})).toMatchObject({ kind: 'json', text: '{}' })
    expect(resultView([1, { a: 1 }])).toMatchObject({ kind: 'json' })
  })

  it('writes the inputs a run used in one short line', () => {
    expect(inputsLine({})).toBe('No inputs')
    expect(inputsLine({ chat_name: 'Study group', days: 3, empty: '' })).toBe('Chat name: Study group · Days: 3 · Empty: —')
    expect(inputsLine({ text: 'y'.repeat(100) })).toContain('…')
    expect(inputsLine({ a: 'x'.repeat(40), b: 'x'.repeat(40), c: 'x'.repeat(40) }).length).toBe(120)
  })
})

describe('tool run: which draft a published tool came from', () => {
  const digest = 'a'.repeat(64)

  it('reads only well-formed workflow tool ids', () => {
    const id = `workflow:editor-${'0'.repeat(32)}:7:${digest}`
    expect(workflowTool(id)).toEqual({ automationId: `editor-${'0'.repeat(32)}`, version: 7, digest })
    expect(workflowTool(`workflow:editor-${'0'.repeat(32)}:0:${digest}`)).toBeNull()
    expect(workflowTool(`workflow:editor-xyz:1:${digest}`)).toBeNull()
    expect(workflowTool('email.send')).toBeNull()
  })

  it('hashes a draft id the way ToolGate names it', async () => {
    const id = await automationIdFor('my-draft')
    expect(id).toMatch(/^editor-[0-9a-f]{32}$/)
    expect(await automationIdFor('my-draft')).toBe(id)
    expect(await automationIdFor('other-draft')).not.toBe(id)
  })

  const publication = (automation: string, version = 1, available = true) => ({ automation_id: automation, version, digest, available, authorization: 'auto' as const })
  const fake = (pages: string[][], publications: Record<string, ReturnType<typeof publication>[]>) => {
    const asked: string[] = []
    const drafts = {
      list: async (after?: string) => {
        const index = after ? Number(after) : 0
        return { items: pages[index].map(id => ({ id })), next_after: index + 1 < pages.length ? String(index + 1) : null }
      },
      publications: async (id: string) => {
        asked.push(id)
        return publications[id] ?? []
      },
    } as unknown as Pick<GatewayEditorDrafts, 'list' | 'publications'>
    return { drafts, asked }
  }

  it('asks the draft whose id hashes to the tool first, across pages', async () => {
    const automationId = (await automationIdFor('draft-b'))!
    const tool = { automationId, version: 1, digest }
    const { drafts, asked } = fake([['draft-a'], ['draft-b']], { 'draft-b': [publication(automationId)] })
    expect(await findRunTarget(drafts, tool)).toEqual({ draftId: 'draft-b', version: 1, digest, available: true, authorization: 'auto' })
    expect(asked).toEqual(['draft-b'])
  })

  it('falls back to every draft when none hashes to the tool, and answers null when none has it', async () => {
    const automationId = `editor-${'1'.repeat(32)}`
    const tool = { automationId, version: 2, digest }
    const found = fake([['a', 'b', 'c', 'd', 'e', 'f', 'g']], { g: [publication(automationId, 2, false)] })
    expect(await findRunTarget(found.drafts, tool)).toMatchObject({ draftId: 'g', version: 2, available: false })
    const none = fake([['a', 'b']], { a: [publication(automationId, 9)] })
    expect(await findRunTarget(none.drafts, tool)).toBeNull()
    expect(none.asked.sort()).toEqual(['a', 'b'])
  })
})
