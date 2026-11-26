import { describe, expect, it } from 'vitest'
import type { ContextPolicy } from '../gateway/chat-context'
import type { RuntimeTurn } from '../gateway/runtime'
import { canRuleMessage, messageRuleOf, messageRules, ruleLabel, ruleWords, withMessageRule } from '../chat/message-context-rules'
import { compilePrompt, emptyValues, missingRequired, type PromptTemplate } from '../chat/prompt-templates'
import { keepPrefix, nextReveal } from '../chat/smooth-text'
import { templateFill } from '../chat/template-fill'
import { readToolRecord } from '../chat/tool-record'
import { foldToolRequests, readToolRequest } from '../chat/tool-requests'
import { shownDetails, turnDetails as turnFacts } from '../chat/turn-details'

/** Every saved fact as one line, the way the transcript joins them when all are chosen. */
const turnDetails = (...args: Parameters<typeof turnFacts>) => {
  const text = shownDetails(turnFacts(...args).details, ['model', 'time', 'tokens', 'cost', 'route', 'tools'])
  return text ? { details: text } : {}
}

describe('smooth text', () => {
  const text = 'one two three four five six seven eight nine ten'

  it('shows everything once everything is shown, and nothing before time passes', () => {
    expect(nextReveal(text.length, text, 100)).toBe(text.length)
    expect(nextReveal(0, text, 0)).toBe(0)
    expect(nextReveal(5, text, -50)).toBe(5)
  })

  it('reveals whole words only', () => {
    const next = nextReveal(0, text, 100)
    expect(next).toBeGreaterThan(0)
    expect(text[next] === ' ' || next === text.length).toBe(true)
  })

  it('waits for the next word instead of cutting it', () => {
    // 10 ms at the minimum rate is under one character; nothing complete fits.
    expect(nextReveal(0, 'hello world', 10)).toBe(0)
  })

  it('catches up faster when a long backlog is waiting', () => {
    const backlog = Array.from({ length: 2000 }, () => 'word').join(' ')
    // A short text gets the base rate (80 characters a second); a 10,000-character backlog far more.
    expect(nextReveal(0, text, 1000)).toBe(text.length)
    expect(nextReveal(0, backlog, 100)).toBeGreaterThan(1000)
    expect(nextReveal(0, backlog, 1000)).toBeLessThanOrEqual(backlog.length)
  })

  it('breaks a very long word into pieces rather than stalling on it', () => {
    const word = 'x'.repeat(5000)
    const next = nextReveal(0, word, 1000)
    expect(next).toBeGreaterThan(0)
    expect(next).toBeLessThan(word.length + 1)
    expect(nextReveal(0, 'x'.repeat(30), 100)).toBe(0)
    expect(nextReveal(0, 'x'.repeat(30), 150)).toBe(27)
  })

  it('keeps what was shown only while the text still starts the same way', () => {
    expect(keepPrefix('Hello wor', 'Hello world', 9)).toBe(9)
    expect(keepPrefix('Hello world', 'Hello there', 11)).toBe(0)
    expect(keepPrefix('Hello world', 'Hello there', 5)).toBe(5)
    expect(keepPrefix('abc', 'xyz', 0)).toBe(0)
  })
})

describe('tool record', () => {
  const record = (value: unknown) => readToolRecord(JSON.stringify(value))

  it('shows text that is not a record as is, cut to one short line', () => {
    expect(readToolRecord('plain text\nsecond')).toMatchObject({ tool: null, label: 'Tool', status: 'unknown', summary: 'plain text', output: null, raw: 'plain text\nsecond' })
    expect(readToolRecord('[1,2]').tool).toBeNull()
    expect(readToolRecord('x'.repeat(100)).summary).toBe(`${'x'.repeat(79)}…`)
    expect(readToolRecord('').summary).toBe('')
  })

  it('reads a successful run: label, output, duration and raw JSON', () => {
    const view = record({ tool: 'sandbox.run_code', result: { stdout: 'hello\nworld', stderr: '', exitCode: 0, durationMs: 12 } })
    expect(view).toMatchObject({ tool: 'sandbox.run_code', label: 'Run code', status: 'ok', summary: 'hello', output: 'hello\nworld', error: null, durationMs: 12 })
    expect(view.raw).toBe(JSON.stringify({ tool: 'sandbox.run_code', result: { stdout: 'hello\nworld', stderr: '', exitCode: 0, durationMs: 12 } }, null, 2))
  })

  it('reads a record that was encoded twice', () => {
    const view = readToolRecord(JSON.stringify(JSON.stringify({ tool: 'files.read', result: 'contents' })))
    expect(view).toMatchObject({ label: 'Read', status: 'ok', output: 'contents' })
  })

  it('tells failed, timed out and declined apart', () => {
    expect(record({ tool: 't', ok: false }).status).toBe('failed')
    expect(record({ tool: 't', result: { exitCode: 2, stderr: 'boom' } })).toMatchObject({ status: 'failed', error: 'boom', summary: 'boom' })
    expect(record({ tool: 't', result: { timedOut: true, exitCode: 0 } }).status).toBe('timed out')
    expect(record({ tool: 't', declined: 'owner said no', ok: true }).status).toBe('declined')
  })

  it('says unknown when nothing says how it went, and ok only on a real sign', () => {
    expect(record({ tool: 't' })).toMatchObject({ status: 'unknown', summary: 'unknown' })
    expect(record({ tool: 't', ok: true }).status).toBe('ok')
    expect(record({ tool: 't', result: { exitCode: 0 } }).status).toBe('ok')
    expect(record({ result: 'x' })).toMatchObject({ tool: null, label: 'Tool', status: 'ok' })
  })

  it('ignores a duration that is not a number', () => {
    expect(record({ tool: 't', result: { stdout: 'x', durationMs: 'fast' } }).durationMs).toBeNull()
    expect(record({ tool: 't', result: { stdout: 'x', durationMs: Number.POSITIVE_INFINITY } }).durationMs).toBeNull()
  })

  it('shows only the outcome of Conker’s own tools, never what they found', () => {
    const recall = record({ tool: 'conker.recall', result: { status: 'found', count: 3, text: 'private' } })
    expect(recall).toMatchObject({ label: 'Searched memory', status: 'ok', summary: '3 found', output: null, error: null, durationMs: null })
    expect(record({ tool: 'conker.recall', result: { status: 'none' } }).summary).toBe('0 found')
    expect(record({ tool: 'conker.recall', result: { status: 'error' } })).toMatchObject({ status: 'failed', summary: 'Couldn’t search memory' })
    expect(record({ tool: 'conker.recall' }).status).toBe('failed')
  })

  it('names the agent a run_agent call used and links its chat', () => {
    const done = record({ tool: 'conker.run_agent', result: { status: 'done', agentName: 'Tutor', sessionId: 'ses_1', reply: 'secret' } })
    expect(done).toMatchObject({ label: 'Ran Tutor', status: 'ok', summary: 'Answered in its own chat', chat: 'ses_1', output: null })
    expect(record({ tool: 'conker.run_agent', result: { status: 'failed' } })).toMatchObject({ label: 'Ran an agent', status: 'failed', summary: 'Didn’t finish; see its chat' })
    expect(record({ tool: 'conker.run_agent', result: { status: 'weird' } }).summary).toBe('Not run')
    expect(record({ tool: 'conker.run_agent', result: { status: 'done' } })).not.toHaveProperty('chat')
    expect(record({ tool: 'conker.run_agent', result: { status: 'done', agentName: 'A'.repeat(100) } }).label.length).toBe(80)
  })
})

describe('tool requests', () => {
  const request = { tool: 'files.read', args: { path: 'a.txt' } }

  it('reads a bare, fenced or double-encoded request', () => {
    expect(readToolRequest(JSON.stringify(request))).toEqual(request)
    expect(readToolRequest(`  \n${JSON.stringify(request)}\n `)).toEqual(request)
    expect(readToolRequest('```json\n' + JSON.stringify(request) + '\n```')).toEqual(request)
    expect(readToolRequest('```\n{"tool":"a","args":{}}\n```')).toEqual({ tool: 'a', args: {} })
    expect(readToolRequest(JSON.stringify(JSON.stringify(request)))).toEqual(request)
  })

  it('refuses anything that is not exactly a tool and its args', () => {
    expect(readToolRequest('Let me read the file for you.')).toBeNull()
    expect(readToolRequest('{"tool":"a","args":{},"extra":1}')).toBeNull()
    expect(readToolRequest('{"tool":"a"}')).toBeNull()
    expect(readToolRequest('{"tool":"","args":{}}')).toBeNull()
    expect(readToolRequest('{"tool":3,"args":{}}')).toBeNull()
    expect(readToolRequest('{"tool":"a","args":[]}')).toBeNull()
    expect(readToolRequest('{"tool":"a","args":null}')).toBeNull()
    expect(readToolRequest('[{"tool":"a","args":{}}]')).toBeNull()
    expect(readToolRequest('null')).toBeNull()
    expect(readToolRequest('```python\n{"tool":"a","args":{}}\n```')).toBeNull()
  })

  const text = (role: string, body: string) => ({ role, content: { kind: 'text', text: body } })
  const record = (tool: string) => text('tool', JSON.stringify({ tool, result: 'ok' }))

  it('folds a request and its record into one row, keeping the request', () => {
    const asked = text('assistant', JSON.stringify(request)),
      done = record('files.read'),
      after = text('assistant', 'Here it is.')
    const folded = foldToolRequests([text('user', 'read it'), asked, done, after])
    expect(folded.map(row => row.message)).toEqual([expect.objectContaining({ role: 'user' }), done, after])
    expect(folded[1].request).toEqual(request)
    expect(folded[0].request).toBeNull()
  })

  it('folds a double-encoded record too', () => {
    const asked = text('assistant', JSON.stringify(request)),
      done = text('tool', JSON.stringify(JSON.stringify({ tool: 'files.read' })))
    expect(foldToolRequests([asked, done]).map(row => row.request)).toEqual([request])
  })

  it('keeps both messages when the record is for another tool, damaged, or missing', () => {
    const asked = text('assistant', JSON.stringify(request))
    expect(foldToolRequests([asked, record('files.delete')])).toHaveLength(2)
    expect(foldToolRequests([asked, text('tool', 'not json')])).toHaveLength(2)
    expect(foldToolRequests([asked, text('tool', '[1]')])).toHaveLength(2)
    expect(foldToolRequests([asked, text('assistant', 'next')])).toHaveLength(2)
    expect(foldToolRequests([asked])).toEqual([{ message: asked, request: null }])
    expect(foldToolRequests([])).toEqual([])
  })

  it('does not fold messages that only look like requests', () => {
    const user = text('user', JSON.stringify(request))
    expect(foldToolRequests([user, record('files.read')])).toHaveLength(2)
    const unavailable = { role: 'assistant', content: { kind: 'unavailable' } }
    expect(foldToolRequests([unavailable, record('files.read')])).toHaveLength(2)
  })
})

describe('turn details', () => {
  const turn = (partial: Partial<RuntimeTurn> = {}): RuntimeTurn =>
    ({
      id: 't',
      sessionId: 's',
      status: 'complete',
      acted: false,
      startedAt: '2026-01-01T10:00:00Z',
      endedAt: '2026-01-01T10:00:07Z',
      provider: null,
      model: 'claude-x',
      inputTokens: 600,
      outputTokens: 900,
      costUsd: 0.5,
      detail: null,
      action: null,
      ...partial,
    }) as RuntimeTurn

  it('shows nothing before Pi has recorded the end of the turn', () => {
    expect(turnDetails(undefined)).toEqual({})
    expect(turnDetails(turn({ endedAt: null }))).toEqual({})
  })

  it('joins model, seconds, tokens and cost', () => {
    expect(turnDetails(turn())).toEqual({ details: 'claude-x · 7 s · 1.5k tokens · $0.50' })
  })

  it('writes tokens compactly and leaves them out when there are none', () => {
    expect(turnDetails(turn({ inputTokens: 100, outputTokens: 50 })).details).toContain('150 tokens')
    expect(turnDetails(turn({ inputTokens: 1000, outputTokens: 1000 })).details).toContain('2k tokens')
    expect(turnDetails(turn({ inputTokens: 12_400, outputTokens: 0 })).details).toContain('12k tokens')
    expect(turnDetails(turn({ inputTokens: null, outputTokens: 300 })).details).toContain('300 tokens')
    expect(turnDetails(turn({ inputTokens: null, outputTokens: null })).details).toBe('claude-x · 7 s · $0.50')
  })

  it('writes cost as free, fractions of a cent or dollars, and nothing when unknown', () => {
    expect(turnDetails(turn({ costUsd: 0 })).details).toMatch(/free$/)
    expect(turnDetails(turn({ costUsd: 0.0042 })).details).toMatch(/\$0\.0042$/)
    expect(turnDetails(turn({ costUsd: 1.234 })).details).toMatch(/\$1\.23$/)
    expect(turnDetails(turn({ costUsd: null })).details).toBe('claude-x · 7 s · 1.5k tokens')
  })

  it('never shows a negative time and drops a time that cannot be read', () => {
    expect(turnDetails(turn({ endedAt: '2025-01-01T00:00:00Z' })).details).toContain('0 s')
    expect(turnDetails(turn({ endedAt: 'garbage' })).details).not.toContain(' s')
    expect(turnDetails(turn({ model: null, inputTokens: null, outputTokens: null, costUsd: null, endedAt: 'garbage' }))).toEqual({})
  })

  it('says how Auto chose only when the saved routing receipt says so', () => {
    const receipt = (attempts: unknown) => turnFacts(turn({ detail: JSON.stringify({ attempts }) })).details?.route
    expect(receipt([{ role: 'routing', status: 'completed' }])).toBe('picked by Auto')
    expect(receipt([null, { role: 'routing', status: 'reused' }])).toBe('picked by Auto')
    expect(receipt([{ role: 'answer', selectionReason: 'single_eligible_model' }])).toBe('only model ready')
    expect(receipt([{ role: 'routing', status: 'failed' }])).toBeUndefined()
    expect(receipt('not a list')).toBeUndefined()
    expect(turnFacts(turn({ detail: '{broken' })).details?.route).toBeUndefined()
    expect(turnFacts(turn({ detail: 'plain words' })).details?.route).toBeUndefined()
    expect(turnFacts(turn({ detail: `{${' '.repeat(16_001)}}` })).details?.route).toBeUndefined()
  })

  it('counts saved tools and shows only the chosen facts, in their fixed order', () => {
    expect(turnFacts(turn(), 1).details?.tools).toBe('1 tool')
    expect(turnFacts(turn(), 3).details?.tools).toBe('3 tools')
    expect(shownDetails(turnFacts(turn(), 2).details, ['tools', 'model'])).toBe('claude-x · 2 tools')
    expect(shownDetails(turnFacts(turn()).details, ['route'])).toBe('')
    expect(shownDetails(undefined, ['model'])).toBe('')
  })
})

describe('message context rules', () => {
  const policy = (messagePolicies: ContextPolicy['messagePolicies'] = {}): ContextPolicy =>
    ({ sessionInstructions: 'be brief', messagePolicies, budget: { contextWindowTokens: 1000, outputReserveTokens: 100, otherInputTokens: 5 } }) as ContextPolicy
  const A = 'msg_0123456789abcdef',
    B = 'msg_fedcba9876543210'

  it('accepts only Pi’s message ids', () => {
    expect(canRuleMessage(A)).toBe(true)
    for (const bad of ['msg_123', 'msg_0123456789ABCDEF', `${A}0`, `x${A}`, '']) expect(canRuleMessage(bad)).toBe(false)
  })

  it('lists every rule with words and a capitalised label', () => {
    for (const rule of messageRules) expect(ruleWords[rule]).toBeTruthy()
    expect(new Set(messageRules).size).toBe(4)
    expect(ruleLabel('exclude')).toBe('Left out')
    expect(ruleLabel('keep-exact')).toBe('Always kept exactly')
  })

  it('reads the rule set on one message, or null for the default', () => {
    expect(messageRuleOf(null, A)).toBeNull()
    expect(messageRuleOf(policy(), A)).toBeNull()
    expect(messageRuleOf(policy({ [A]: 'exclude' }), A)).toBe('exclude')
    expect(messageRuleOf(policy({ [A]: 'exclude' }), B)).toBeNull()
    expect(messageRuleOf(policy(), 'toString')).toBeNull()
  })

  it('sets one message’s rule and leaves the others and the rest of the policy alone', () => {
    const before = policy({ [B]: 'retrieve' })
    const after = withMessageRule(before, A, 'exclude')
    expect(after.messagePolicies).toEqual({ [B]: 'retrieve', [A]: 'exclude' })
    expect(after.sessionInstructions).toBe('be brief')
    expect(before.messagePolicies).toEqual({ [B]: 'retrieve' })
    expect(withMessageRule(after, A, null).messagePolicies).toEqual({ [B]: 'retrieve' })
    expect(withMessageRule(after, A, 'keep-exact').messagePolicies[A]).toBe('keep-exact')
  })

  it('starts from Conker’s default budget when the chat has no policy yet', () => {
    expect(withMessageRule(null, A, 'retrieve')).toEqual({ sessionInstructions: '', messagePolicies: { [A]: 'retrieve' }, budget: { contextWindowTokens: 128000, outputReserveTokens: 4096, otherInputTokens: 0 } })
  })

  it('refuses a message id or rule Pi would not accept', () => {
    expect(() => withMessageRule(null, 'nope', 'exclude')).toThrow('Not a message id')
    expect(() => withMessageRule(null, A, 'shred' as never)).toThrow('Not a message rule')
  })
})

describe('prompt templates', () => {
  const template: PromptTemplate = {
    id: 'tpl',
    name: 'Study plan',
    description: '',
    fields: [
      { id: 'topic', label: 'Topic', type: 'shortText', required: true },
      { id: 'goal', label: 'Goal', type: 'longText' },
      { id: 'days', label: 'Days', type: 'number' },
      { id: 'due', label: 'Due', type: 'date' },
      { id: 'books', label: 'Books', type: 'list', required: true },
      { id: 'level', label: 'Level', type: 'choice', options: ['easy', 'hard'], required: true },
      { id: 'tags', label: 'Tags', type: 'choice', options: ['a', 'b'], multiple: true },
      { id: 'quiet', label: 'Quiet', type: 'switch' },
    ],
  }

  it('starts every field empty in the shape its type needs', () => {
    expect(emptyValues(template)).toEqual({ topic: '', goal: '', days: '', due: '', books: [], level: '', tags: [], quiet: false })
  })

  it('lists required fields that are still empty, by label', () => {
    expect(missingRequired(template, emptyValues(template))).toEqual(['Topic', 'Books', 'Level'])
    expect(missingRequired(template, { ...emptyValues(template), topic: '   ', books: ['x'], level: 'easy' })).toEqual(['Topic'])
    expect(missingRequired(template, { ...emptyValues(template), topic: 'Math', books: ['x'], level: 'easy' })).toEqual([])
  })

  it('treats a required switch as missing until it is on, and a required multiple choice until one is chosen', () => {
    const strict: PromptTemplate = {
      ...template,
      fields: [
        { id: 's', label: 'Agree', type: 'switch', required: true },
        { id: 'm', label: 'Pick', type: 'choice', multiple: true, required: true },
      ],
    }
    expect(missingRequired(strict, { s: false, m: [] })).toEqual(['Agree', 'Pick'])
    expect(missingRequired(strict, { s: true, m: ['x'] })).toEqual([])
    expect(missingRequired(strict, {})).toEqual(['Pick'])
  })

  it('writes only what was filled in, one block per field', () => {
    expect(compilePrompt(template, emptyValues(template))).toBe('Study plan request')
    const values = { ...emptyValues(template), topic: ' Algebra ', goal: ' Pass the exam\nstep by step ', days: '14', books: [' Book A ', '', 'Book B'], level: 'hard', tags: ['a', 'b'], quiet: true }
    expect(compilePrompt(template, values)).toBe(
      ['Study plan request', '', 'Topic: Algebra', '', 'Goal:\nPass the exam\nstep by step', '', 'Days: 14', '', 'Books:\n- Book A\n- Book B', '', 'Level: hard', '', 'Tags: a, b', '', 'Quiet: Yes'].join('\n'),
    )
  })

  it('skips lists with nothing but blanks and a switch that is off', () => {
    expect(compilePrompt(template, { ...emptyValues(template), books: ['  ', ''], quiet: false, topic: 'x' })).toBe('Study plan request\n\nTopic: x')
  })
})

describe('template fill', () => {
  const template: PromptTemplate = {
    id: 't',
    name: 'T',
    description: '',
    fields: [
      { id: 'a', label: 'A', type: 'shortText', required: true },
      { id: 'b', label: 'B', type: 'shortText' },
      { id: 'c', label: 'C', type: 'shortText' },
    ],
  }

  it('sorts labels into filled, blank and missing, in the template’s own order', () => {
    expect(templateFill(template, { fields: { c: 'x' }, missing: ['A'] })).toEqual({ filled: ['C'], blank: ['B'], missing: ['A'] })
  })

  it('treats an empty reply as everything blank', () => {
    expect(templateFill(template, {})).toEqual({ filled: [], blank: ['A', 'B', 'C'], missing: [] })
  })

  it('counts a field Pi accepted as filled even when its value is empty', () => {
    expect(templateFill(template, { fields: { a: '', b: 'x' } })).toEqual({ filled: ['A', 'B'], blank: ['C'], missing: [] })
  })
})
