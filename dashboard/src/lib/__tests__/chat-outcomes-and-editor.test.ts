import { describe, expect, it } from 'vitest'
import type { Action } from '../chat/contract'
import { isMemoryNote, memoryFeedback } from '../chat/memory-feedback'
import { FIELD_TYPE_HINTS, FIELD_TYPE_LABELS, blankField, blankTemplate, editorFrom, fieldIdFor, isChanged, isFieldType, toDraft, type EditorField, type EditorState } from '../chat/template-editor'
import { parkedTurn, retryText, retryableTurn, sameTurnOutcome, turnCheckCopy, turnOutcomeCopy, visibleTurnOutcomes } from '../chat/turn-outcomes'
import type { MemoryDelivery } from '../gateway/memory-delivery'
import type { PiTemplate } from '../gateway/prompt-templates'
import { FIELD_ID_PATTERN, TEMPLATE_LIMITS } from '../gateway/prompt-templates'
import type { RuntimeMessage, RuntimeTurn } from '../gateway/runtime'

const turn = (partial: Partial<RuntimeTurn> = {}): RuntimeTurn =>
  ({
    id: 't1',
    sessionId: 's',
    status: 'complete',
    acted: false,
    startedAt: '2026-01-01T10:00:00Z',
    endedAt: '2026-01-01T10:00:05Z',
    provider: null,
    model: null,
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
    detail: null,
    action: null,
    ...partial,
  }) as RuntimeTurn

describe('turn outcomes: what stays on screen', () => {
  it('keeps parked turns and uncertain actions visible, whatever their age', () => {
    const turns = [
      turn({ id: 'a', status: 'awaiting_approval', startedAt: '2026-01-01T01:00:00Z' }),
      turn({ id: 'b', status: 'complete', action: { id: 'x', state: 'in_progress', jobId: null }, startedAt: '2026-01-01T02:00:00Z' }),
      turn({ id: 'c', status: 'complete', startedAt: '2026-01-01T03:00:00Z' }),
    ]
    expect(visibleTurnOutcomes(turns).map(item => item.id)).toEqual(['a', 'b'])
  })

  it('shows only the latest failure, and not while an answer is being written', () => {
    const turns = [turn({ id: 'old', status: 'failed', startedAt: '2026-01-01T01:00:00Z' }), turn({ id: 'new', status: 'cancelled', startedAt: '2026-01-01T02:00:00Z' })]
    expect(visibleTurnOutcomes(turns).map(item => item.id)).toEqual(['new'])
    expect(visibleTurnOutcomes(turns, true)).toEqual([])
    expect(visibleTurnOutcomes([...turns, turn({ id: 'newest', status: 'complete', startedAt: '2026-01-01T03:00:00Z' })])).toEqual([])
  })

  it('keeps an interrupted turn that acted, and orders by start time then id without changing the input', () => {
    const input = [turn({ id: 'b', status: 'interrupted', acted: true, startedAt: 'same' }), turn({ id: 'a', status: 'awaiting_budget', startedAt: 'same' })]
    const before = [...input]
    expect(visibleTurnOutcomes(input, true).map(item => item.id)).toEqual(['a', 'b'])
    expect(input).toEqual(before)
  })

  it('knows which statuses are parked', () => {
    for (const status of ['awaiting_approval', 'awaiting_budget', 'acted_no_reply', 'action_in_progress', 'outcome_unknown']) expect(parkedTurn(status)).toBe(true)
    for (const status of ['complete', 'failed', 'interrupted']) expect(parkedTurn(status)).toBe(false)
  })

  it('offers a retry only for a turn that ended without doing anything', () => {
    expect(retryableTurn(turn({ status: 'failed' }))).toBe(true)
    expect(retryableTurn(turn({ status: 'interrupted' }))).toBe(true)
    expect(retryableTurn(turn({ status: 'failed', acted: true }))).toBe(false)
    expect(retryableTurn(turn({ status: 'failed', action: { id: 'x', state: 'done', jobId: null } }))).toBe(false)
    expect(retryableTurn(turn({ status: 'cancelled' }))).toBe(false)
  })

  it('treats two reads of the same turn as the same outcome only when what the screen shows is the same', () => {
    const base = turn({ status: 'failed', action: { id: 'x', state: 'done', jobId: null } })
    expect(sameTurnOutcome(base, { ...base, detail: 'other words' })).toBe(true)
    expect(sameTurnOutcome(base, { ...base, status: 'complete' })).toBe(false)
    expect(sameTurnOutcome(base, { ...base, acted: true })).toBe(false)
    expect(sameTurnOutcome(base, { ...base, endedAt: null })).toBe(false)
    expect(sameTurnOutcome(base, { ...base, approvalRequestId: 'creq' })).toBe(false)
    expect(sameTurnOutcome(base, { ...base, action: { id: 'y', state: 'done', jobId: null } })).toBe(false)
    expect(sameTurnOutcome(base, { ...base, action: { id: 'x', state: 'unknown', jobId: null } })).toBe(false)
    expect(sameTurnOutcome(base, { ...base, id: 'other' })).toBe(false)
  })
})

describe('turn outcomes: the words to send again', () => {
  const message = (sequence: number, role: RuntimeMessage['role'], text: string, turnId?: string): RuntimeMessage =>
    ({ id: `m${sequence}`, sessionId: 's', sequence, role, createdAt: '', agentId: null, ...(turnId ? { turnId } : {}), content: { kind: 'text', text } }) as RuntimeMessage

  it('uses the turn’s own message, the newest if there are several', () => {
    const messages = [message(1, 'user', 'first try', 't1'), message(2, 'user', 'second try', 't1'), message(3, 'user', 'other', 't2')]
    expect(retryText(messages, 't1')).toBe('second try')
  })

  it('falls back to the newest message nothing has answered', () => {
    expect(retryText([message(1, 'user', 'hello')], 't1')).toBe('hello')
    expect(retryText([message(1, 'user', 'hello'), message(2, 'assistant', 'hi'), message(3, 'user', 'again')], 't1')).toBe('again')
    expect(retryText([message(1, 'user', 'hello'), message(2, 'assistant', 'hi')], 't1')).toBeNull()
  })

  it('gives nothing for empty or unavailable text, and orders by sequence', () => {
    expect(retryText([message(1, 'user', '   ', 't1')], 't1')).toBeNull()
    expect(retryText([{ ...message(1, 'user', '', 't1'), content: { kind: 'unavailable', reason: 'forgotten' } }], 't1')).toBeNull()
    expect(retryText([message(2, 'user', 'later'), message(1, 'user', 'earlier')], 'x')).toBe('later')
    expect(retryText([], 't1')).toBeNull()
  })
})

describe('turn outcomes: plain words', () => {
  it('says what a failed turn that did nothing means, by its saved reason', () => {
    const failed = (detail: string | null) => turnOutcomeCopy(turn({ status: 'failed', detail }))
    expect(failed(null)).toMatchObject({ title: 'Conker couldn’t finish the reply', consequence: 'Nothing ran for this message. It is kept in this chat.', modelUnavailable: false, toolUnavailable: false })
    expect(failed(null).description).toContain('may be offline or overloaded')
    expect(failed('The daily spending cap is reached').description).toContain('spending limit is reached')
    expect(failed('local capacity is busy').description).toContain('busy with another job')
    expect(failed('raw provider exception: key=sk-secret').description).not.toContain('sk-secret')
  })

  it('recognises an unavailable model and an unavailable tool', () => {
    const model = turnOutcomeCopy(turn({ status: 'failed', detail: 'No configured eligible model could answer; no unapproved substitute was used.' }))
    expect(model.modelUnavailable).toBe(true)
    expect(model.description).toContain('choose another answer model')
    for (const detail of ['model requested unavailable tool', 'The model requested an unavailable tool. This request was not executed.']) {
      const tool = turnOutcomeCopy(turn({ status: 'failed', detail }))
      expect(tool.toolUnavailable).toBe(true)
      expect(tool.description).toContain('Review enabled tools')
    }
    expect(turnOutcomeCopy(turn({ status: 'interrupted', detail: 'model requested unavailable tool' })).toolUnavailable).toBe(false)
  })

  it('warns that repeating a request may repeat work when the outcome is not confirmed', () => {
    for (const status of ['outcome_unknown', 'action_in_progress']) expect(turnOutcomeCopy(turn({ status })).consequence).toBe('The tool outcome is not confirmed. Sending the request again could repeat work.')
    expect(turnOutcomeCopy(turn({ status: 'complete', action: { id: 'x', state: 'dispatching', jobId: null } })).consequence).toContain('not confirmed')
  })

  it('tells apart what a recorded action means for the next step', () => {
    expect(turnOutcomeCopy(turn({ status: 'acted_no_reply', acted: true })).consequence).toBe('A tool action was recorded. Asking only for the reply will not repeat it.')
    expect(turnOutcomeCopy(turn({ status: 'failed', acted: true })).consequence).toContain('Review its outcome')
    expect(turnOutcomeCopy(turn({ status: 'failed', action: { id: 'x', state: 'done', jobId: null } })).consequence).toContain('An action record exists')
    expect(turnOutcomeCopy(turn({ status: 'cancelled' })).consequence).toContain('No tool action is recorded')
  })

  it('gives each parked status its own title and description', () => {
    const copy = (status: string, extra: Partial<RuntimeTurn> = {}) => turnOutcomeCopy(turn({ status, ...extra }))
    expect(copy('awaiting_approval')).toMatchObject({ title: 'Waiting for your approval', description: 'Review the exact requested action, then continue after approving it.' })
    expect(copy('awaiting_budget').title).toBe('Waiting for a spending decision')
    expect(copy('acted_no_reply', { acted: true }).description).toContain('ask for the missing reply')
    expect(copy('acted_no_reply').description).toContain('action record is incomplete')
    expect(copy('action_in_progress').title).toBe('Action still in progress')
    expect(copy('outcome_unknown').description).toContain('never confirmed')
    expect(copy('cancelled').title).toBe('Response stopped')
    expect(copy('canceled').title).toBe('Response stopped')
    expect(copy('interrupted').description).toContain('Nothing ran. Try again')
    expect(copy('interrupted', { acted: true }).description).toContain('Check the saved outcome')
    expect(copy('mystery')).toMatchObject({ title: undefined, description: 'Conker stopped before completing a reply. Check the saved outcome before sending a new request.' })
  })

  it('walks through each step of checking an unconfirmed action', () => {
    expect(turnCheckCopy({ turnId: 't', phase: 'checking' })).toMatchObject({ title: 'Checking what happened', status: 'Checking with your tools… The action is not sent again.' })
    expect(turnCheckCopy({ turnId: 't', phase: 'checking' }).description).toContain('is asking')
    const failed = turnCheckCopy({ turnId: 't', phase: 'failed', reason: 'Tools did not answer.' })
    expect(failed).toMatchObject({ title: 'Couldn’t check what happened', status: 'Tools did not answer. The action was not sent again.' })
    expect(failed.description).toContain('asked')
  })

  it('names the saved status after a check, with a general line for any other', () => {
    const checked = (status: string | null) => turnCheckCopy({ turnId: 't', phase: 'checked', status })
    expect(checked('complete').status).toContain('Done. Your tools had the result')
    expect(checked('acted_no_reply').status).toContain('the reply is missing')
    expect(checked('outcome_unknown').status).toContain('Still unknown')
    expect(checked('action_in_progress').status).toContain('Still running')
    expect(checked('awaiting_approval').status).toContain('needs your approval again')
    expect(checked('some_new_state').status).toBe('Checked. This turn is now some new state.')
    expect(checked(null).status).toBe('Checked. This turn is now saved.')
    expect(checked(null).title).toBe('Checked what happened')
  })
})

describe('memory feedback', () => {
  const refresh: Action = { availability: 'enabled', run: () => undefined }
  const delivery = (partial: Partial<MemoryDelivery>): MemoryDelivery => ({ state: 'saved', reasonCode: null, admissionMethod: 'signal', memoryId: 'mem_1', ...partial })
  const watch = (receipts: Record<string, MemoryDelivery>, phase: 'checking' | 'ready' | 'paused' | 'error' = 'ready', truncated = false) => ({ phase, receipts, truncated })

  it('turns only a saved receipt into the quiet Remembered note with its memory id', () => {
    const view = memoryFeedback('m1', watch({ m1: delivery({}) }), refresh)
    expect(view).toMatchObject({ label: 'Remembered', memoryId: 'mem_1', checking: false })
    expect(view.description).toBe('Memory acknowledged this message. This does not guarantee it will be recalled in every reply.')
    expect(isMemoryNote(view)).toBe(true)
    expect(memoryFeedback('m1', watch({ m1: delivery({ admissionMethod: 'owner_requested' }) }), refresh).description).toContain('your request to retain this message')
  })

  it('does not call any other receipt remembered', () => {
    const words: [MemoryDelivery['state'], string][] = [
      ['pending', 'Memory pending'],
      ['filtered', 'Not added to memory'],
      ['unavailable', 'Couldn’t check memory'],
      ['excluded', 'Memory excluded'],
      ['removed', 'Removed from memory'],
    ]
    for (const [state, label] of words) {
      const view = memoryFeedback('m1', watch({ m1: delivery({ state, memoryId: null }) }), refresh)
      expect(view.label).toBe(label)
      expect(view.memoryId).toBeNull()
      expect(isMemoryNote(view)).toBe(false)
    }
  })

  it('explains a receipt by its reason code before its state', () => {
    expect(memoryFeedback('m1', watch({ m1: delivery({ state: 'pending', reasonCode: 'retry_scheduled', memoryId: null }) }), refresh).description).toContain('scheduled another delivery attempt')
    expect(memoryFeedback('m1', watch({ m1: delivery({ state: 'excluded', reasonCode: 'privacy_disabled', memoryId: null }) }), refresh).description).toContain('Memory was off')
  })

  it('explains the quieter states in plain words', () => {
    const text = (state: MemoryDelivery['state']) => memoryFeedback('m1', watch({ m1: delivery({ state, memoryId: null }) }), refresh).description
    expect(text('filtered')).toContain('did not retain it')
    expect(text('removed')).toContain('was removed')
    expect(text('excluded')).toContain('excluded from memory')
    expect(text('pending')).toContain('has not been confirmed')
  })

  it('says what is going on before there is a receipt', () => {
    expect(memoryFeedback('m1', null, refresh)).toMatchObject({ label: 'Checking memory…', checking: true })
    expect(memoryFeedback('m1', watch({}, 'checking'), refresh).description).toContain('Reading the recorded memory outcome')
    expect(memoryFeedback('m1', watch({}), refresh)).toMatchObject({ label: 'Memory not checked yet', checking: false })
    expect(memoryFeedback('m1', watch({}), refresh).description).toContain('No memory receipt is available')
    expect(memoryFeedback('m1', watch({}, 'ready', true), refresh).description).toContain('latest 100 user messages')
  })

  it('says so when memory could not be checked, without sending anything again', () => {
    const view = memoryFeedback('m1', watch({ m1: delivery({}) }, 'error'), refresh)
    expect(view.label).toBe('Couldn’t check memory')
    expect(view.description).toContain('does not send the message again')
  })

  it('adds a note when automatic checks paused on a pending receipt', () => {
    const pending = delivery({ state: 'pending', memoryId: null })
    expect(memoryFeedback('m1', watch({ m1: pending }, 'paused'), refresh).description).toContain('Automatic status checks have paused. Check again whenever you need an update.')
    expect(memoryFeedback('m1', watch({ m1: delivery({}) }, 'paused'), refresh).description).not.toContain('paused')
  })

  it('shows Forgotten once Undo has worked, and keeps Undo unsupported by default', () => {
    const view = memoryFeedback('m1', watch({ m1: delivery({}) }), refresh, { action: refresh, state: { phase: 'forgotten' } })
    expect(view).toMatchObject({ label: 'Forgotten', undoState: { phase: 'forgotten' }, undo: refresh })
    expect(isMemoryNote({ ...view, memoryId: null })).toBe(true)
    const plain = memoryFeedback('m1', watch({ m1: delivery({}) }), refresh)
    expect(plain.undo).toEqual({ availability: 'unsupported', reason: 'Not available here.' })
    expect(plain).not.toHaveProperty('undoState')
  })
})

describe('template editor', () => {
  const editor = (...fields: Partial<EditorField>[]): EditorState => ({ name: 'Plan', description: 'A plan', fields: fields.map(partial => ({ ...blankField(), label: 'Topic', ...partial })) })

  it('has a label and a hint for every field type', () => {
    expect(Object.keys(FIELD_TYPE_LABELS).sort()).toEqual(Object.keys(FIELD_TYPE_HINTS).sort())
    expect(isFieldType('choice')).toBe(true)
    expect(isFieldType('nope')).toBe(false)
    expect(isFieldType(3)).toBe(false)
  })

  it('starts a blank template with one required long field and gives every field its own key', () => {
    const blank = blankTemplate()
    expect(blank.fields).toHaveLength(1)
    expect(blank.fields[0]).toMatchObject({ label: 'Request', type: 'longText', required: true, id: null })
    expect(new Set([blankField().key, blankField().key, blank.fields[0].key]).size).toBe(3)
  })

  it('opens a saved template for editing, options one per line', () => {
    const saved = {
      id: 'tpl_1',
      name: 'N',
      description: 'D',
      fields: [
        { id: 'level', label: 'Level', type: 'choice', required: true, multiple: false, options: ['easy', 'hard'], example: 'easy', help: 'pick' },
        { id: 'x', label: 'X', type: 'shortText', required: false, multiple: false },
      ],
    } as unknown as PiTemplate
    const opened = editorFrom(saved)
    expect(opened).toMatchObject({ name: 'N', description: 'D' })
    expect(opened.fields[0]).toMatchObject({ id: 'level', optionsText: 'easy\nhard', example: 'easy', help: 'pick' })
    expect(opened.fields[1]).toMatchObject({ example: '', help: '', optionsText: '' })
    expect(opened.fields[0].key).not.toBe(opened.fields[1].key)
  })

  it('makes a camel-case field id from a label, never starting with a digit and never taken', () => {
    const none = new Set<string>()
    expect(fieldIdFor('Study topic', none)).toBe('studyTopic')
    expect(fieldIdFor('  Day-of  the WEEK ', none)).toBe('dayOfTheWEEK')
    expect(fieldIdFor('3 goals', none)).toBe('field3Goals')
    expect(fieldIdFor('Ünïcode café', none)).toMatch(FIELD_ID_PATTERN)
    expect(fieldIdFor('!!!', none)).toBe('field')
    expect(fieldIdFor('topic', new Set(['topic', 'topic2']))).toBe('topic3')
    const long = fieldIdFor('x'.repeat(80), none)
    expect(long.length).toBeLessThanOrEqual(TEMPLATE_LIMITS.fieldId)
  })

  it('builds the draft Pi gets, and keeps existing field ids', () => {
    const { draft, problems } = toDraft(
      editor(
        { label: ' Topic ', required: true, example: ' algebra ', help: ' one line ' },
        { id: 'kept', label: 'Level', type: 'choice', multiple: true, optionsText: ' easy \n\nhard\n' },
        { label: 'Topic', type: 'shortText', multiple: true },
      ),
    )
    expect(problems).toEqual([])
    expect(draft).toEqual({
      name: 'Plan',
      description: 'A plan',
      fields: [
        { id: 'topic', label: 'Topic', type: 'shortText', required: true, multiple: false, example: 'algebra', help: 'one line' },
        { id: 'kept', label: 'Level', type: 'choice', required: false, multiple: true, options: ['easy', 'hard'] },
        { id: 'topic2', label: 'Topic', type: 'shortText', required: false, multiple: false },
      ],
    })
  })

  it('says in plain sentences what to fix and gives no draft', () => {
    const bad = (state: EditorState) => toDraft(state)
    expect(bad({ name: ' ', description: '', fields: [] })).toEqual({ draft: null, problems: ['Give the template a name.', 'Add at least one field.'] })
    expect(bad({ ...editor({}), name: 'x'.repeat(61) }).problems).toEqual([`The name has at most ${TEMPLATE_LIMITS.name} characters.`])
    expect(bad({ ...editor({}), description: 'x'.repeat(201) }).problems).toEqual([`The description has at most ${TEMPLATE_LIMITS.description} characters.`])
    expect(bad(editor(...Array.from({ length: 13 }, (_, index) => ({ label: `F${index}` })))).problems).toEqual([`A template has at most ${TEMPLATE_LIMITS.fields} fields.`])
    expect(bad(editor({ label: ' ' })).problems).toEqual(['Field 1 needs a label.'])
    expect(bad(editor({ label: 'x'.repeat(41) })).problems[0]).toContain('a label of more than 40 characters')
    expect(bad(editor({ example: 'x'.repeat(201) })).problems).toEqual(['The field "Topic" has an example or hint of more than 200 characters.'])
    expect(bad(editor({ help: 'x'.repeat(201) })).problems).toHaveLength(1)
  })

  it('checks a choice field’s options', () => {
    const choice = (optionsText: string) => toDraft(editor({ type: 'choice', optionsText })).problems
    expect(choice('')).toEqual(['The field "Topic" needs at least one option, one per line.'])
    expect(choice(Array.from({ length: 21 }, (_, index) => `o${index}`).join('\n'))).toEqual([`The field "Topic" has at most ${TEMPLATE_LIMITS.options} options.`])
    expect(choice('x'.repeat(61))[0]).toContain('an option of more than 60 characters')
    expect(choice('Easy\neasy')).toEqual(['The field "Topic" lists the same option twice.'])
    expect(toDraft(editor({ type: 'shortText', optionsText: 'ignored' })).draft?.fields[0]).not.toHaveProperty('options')
  })

  it('tells a real edit from a trim', () => {
    const from = editor({ id: 'a', label: 'Topic' })
    expect(isChanged(from, structuredClone(from))).toBe(false)
    expect(isChanged({ ...from, name: ' Plan ' }, from)).toBe(false)
    expect(isChanged({ ...from, name: 'Plan 2' }, from)).toBe(true)
    expect(isChanged({ ...from, fields: [{ ...from.fields[0], required: true }] }, from)).toBe(true)
    expect(isChanged({ ...from, fields: [] }, from)).toBe(true)
    expect(isChanged({ ...from, fields: [{ ...from.fields[0], key: 'another-key' }] }, from)).toBe(false)
  })
})
