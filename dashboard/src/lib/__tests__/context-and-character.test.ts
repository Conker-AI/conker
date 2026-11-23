import { describe, expect, it } from 'vitest'
import { createContextPolicy, estimateContextTokens, normalizeContextPolicy, planContext, type ContextPolicy } from '../api/context-policy'
import type { ConversationMessage } from '../api/conversation-types'
import { characterDraft, characterSchema, previewCharacter, removeCharacterAsset, sameCharacterValue, validateCharacter, type CharacterStudio } from '../api/character'
import { createCharacterStudio } from '../api/character-defaults'
import type { Character } from '../api/client'
import { requireStillImage } from '../character-media'
import { insertTranscript } from '../voice/draft'

const open = { memoryDisabled: false, harnessDisabled: false }
const message = (id: string, extra: Partial<ConversationMessage> = {}): ConversationMessage => ({ id, role: 'user', text: `text ${id}`, createdAt: '2026-01-01T00:00:00Z', ...extra })

describe('context policy', () => {
  it('builds a normalized empty policy', () => {
    expect(createContextPolicy(1000, 100)).toEqual({ sessionInstructions: '', messagePolicies: {}, budget: { contextWindowTokens: 1000, outputReserveTokens: 100, otherInputTokens: 0 } })
  })

  it('refuses bad instructions, policies and budgets with exact messages', () => {
    const good = createContextPolicy(1000, 100)
    const refuse = (value: unknown) => () => normalizeContextPolicy(value as ContextPolicy)
    expect(refuse({ ...good, sessionInstructions: 'x'.repeat(16001) })).toThrow('Session instructions must be text of up to 16,000 characters.')
    expect(refuse({ ...good, sessionInstructions: 5 })).toThrow('Session instructions must be text of up to 16,000 characters.')
    expect(refuse(null)).toThrow('Session instructions must be text of up to 16,000 characters.')
    expect(refuse({ ...good, messagePolicies: [] })).toThrow('Use message IDs with explicit context policies.')
    expect(refuse({ ...good, messagePolicies: null })).toThrow('Use message IDs with explicit context policies.')
    for (const messagePolicies of [{ a: 'summarise' }, { ' ': 'exclude' }, { ['x'.repeat(201)]: 'exclude' }, JSON.parse('{"__proto__": "exclude"}'), { constructor: 'exclude' }]) {
      expect(refuse({ ...good, messagePolicies })).toThrow('Choose a supported policy for each valid message ID.')
    }
    const budgetMessage = 'Provide a context window, a positive output reserve smaller than that window, and a nonnegative estimate for other input.'
    for (const budget of [
      undefined,
      { ...good.budget, contextWindowTokens: 1 },
      { ...good.budget, outputReserveTokens: 0 },
      { ...good.budget, outputReserveTokens: 1000 },
      { ...good.budget, otherInputTokens: -1 },
      { ...good.budget, contextWindowTokens: 10.5 },
    ]) {
      expect(refuse({ ...good, budget })).toThrow(budgetMessage)
    }
  })

  it('keeps only the known fields', () => {
    const value = { sessionInstructions: 'Be brief', messagePolicies: { a: 'exclude' }, budget: { contextWindowTokens: 50, outputReserveTokens: 5, otherInputTokens: 2, extra: 1 } } as unknown as ContextPolicy
    expect(normalizeContextPolicy(value)).toEqual({ sessionInstructions: 'Be brief', messagePolicies: { a: 'exclude' }, budget: { contextWindowTokens: 50, outputReserveTokens: 5, otherInputTokens: 2 } })
  })

  it('estimates tokens from UTF-8 bytes plus framing', () => {
    expect(estimateContextTokens('')).toBe(0)
    expect(estimateContextTokens('abcd')).toBe(5)
    expect(estimateContextTokens('abcde')).toBe(6)
    expect(estimateContextTokens('é')).toBe(5)
  })
})

describe('planContext', () => {
  const plan = (messages: ConversationMessage[], policy: ContextPolicy = createContextPolicy(10000, 100), privacy = open) => planContext({ policy, messages, privacy })

  it('includes unpinned messages exactly and marks them summary-eligible', () => {
    const result = plan([message('a'), message('b', { role: 'assistant' })])
    expect(result.messages.map(row => [row.messageId, row.requestedPolicy, row.effectivePolicy, row.disposition, row.estimatedTokens, row.text])).toEqual([
      ['a', 'allow-summary', 'allow-summary', 'included-exact', 6, 'text a'],
      ['b', 'allow-summary', 'allow-summary', 'included-exact', 6, 'text b'],
    ])
    expect(result.summaryEligibleMessageIds).toEqual(['a', 'b'])
    expect(result.nextAction).toBe('within-estimated-budget')
    expect(result.conflicts).toEqual([])
    expect(result.helpers).toEqual({ memoryReadsAllowed: true, memoryWritesAllowed: true, harnessAllowed: true, summaryEligible: true, sessionRetrievalEligible: true, providerAuthorization: 'not-evaluated' })
    expect(result.budget).toMatchObject({ historyTokens: 12, instructionTokens: 0, exactPinTokens: 0, estimatedInputTokens: 12, estimatedTotalTokens: 112, remainingInputTokens: 9888, overflowTokens: 0 })
  })

  it('reports privacy switches in the helper flags', () => {
    const result = plan([message('a')], createContextPolicy(10000, 100), { memoryDisabled: true, harnessDisabled: true })
    expect(result.helpers).toMatchObject({ memoryReadsAllowed: false, memoryWritesAllowed: false, harnessAllowed: false, summaryEligible: false, sessionRetrievalEligible: false })
    expect(result.summaryEligibleMessageIds).toEqual([])
  })

  it('protects a pinned message and flags a policy that would omit it', () => {
    const policy = { ...createContextPolicy(10000, 100), messagePolicies: { p: 'exclude' as const } }
    const result = plan([message('p', { pinned: true }), message('q', { pinned: true })], policy)
    expect(result.messages[0]).toMatchObject({ requestedPolicy: 'exclude', effectivePolicy: 'keep-exact', disposition: 'included-exact' })
    expect(result.messages[1]).toMatchObject({ requestedPolicy: 'keep-exact', effectivePolicy: 'keep-exact' })
    expect(result.conflicts.map(conflict => [conflict.code, conflict.messageId])).toEqual([['pinned-policy', 'p']])
    expect(result.nextAction).toBe('review-conflicts')
    expect(result.budget.exactPinTokens).toBe(12)
  })

  it('treats a redacted pin as unavailable and a redacted plain message as quietly unavailable', () => {
    const result = plan([message('r', { redacted: true, pinned: true }), message('s', { redacted: true })])
    expect(result.messages.map(row => row.disposition)).toEqual(['unavailable', 'unavailable'])
    expect(result.conflicts.map(conflict => [conflict.code, conflict.messageId])).toEqual([['unavailable-pin', 'r']])
    expect(result.messages[0].text).toBeUndefined()
  })

  it('excludes and retrieves by policy', () => {
    const policy = { ...createContextPolicy(10000, 100), messagePolicies: { x: 'exclude' as const, y: 'retrieve' as const } }
    const result = plan([message('x'), message('y')], policy)
    expect(result.messages.map(row => row.disposition)).toEqual(['excluded', 'retrieval-pending'])
    expect(result.retrievalCandidateMessageIds).toEqual(['y'])
    expect(result.conflicts.map(conflict => conflict.code)).toEqual(['retrieval-pending'])
    expect(result.nextAction).toBe('resolve-retrieval')
    const blocked = plan([message('x'), message('y')], policy, { memoryDisabled: false, harnessDisabled: true })
    expect(blocked.messages[1].disposition).toBe('retrieval-disabled')
    expect(blocked.nextAction).toBe('review-conflicts')
  })

  it('flags a policy that points at a missing message', () => {
    const policy = { ...createContextPolicy(10000, 100), messagePolicies: { ghost: 'exclude' as const } }
    const result = plan([message('a')], policy)
    expect(result.conflicts).toEqual([{ code: 'missing-message', messageId: 'ghost', detail: 'This policy points outside the supplied context boundary. Review it; no message was fetched.' }])
    expect(result.nextAction).toBe('review-conflicts')
  })

  it('orders instructions from broad to specific and counts them', () => {
    const policy = { ...createContextPolicy(10000, 100), sessionInstructions: 'session rules' }
    const result = planContext({
      policy,
      messages: [],
      privacy: open,
      inheritedInstructions: [
        { scope: 'project', text: 'project rules' },
        { scope: 'global', text: 'global rules' },
        { scope: 'agent', text: '   ' },
      ],
    })
    expect(result.instructions.map(layer => [layer.scope, layer.estimatedTokens])).toEqual([
      ['global', 7],
      ['project', 8],
      ['session', 8],
    ])
    expect(result.budget.instructionTokens).toBe(23)
  })

  it('reports an overflow and asks for a fork', () => {
    const result = plan([message('a', { text: 'x'.repeat(400) })], createContextPolicy(100, 10))
    expect(result.budget).toMatchObject({ estimatedInputTokens: 104, estimatedTotalTokens: 114, overflowTokens: 14, remainingInputTokens: 0 })
    expect(result.conflicts.map(conflict => conflict.code)).toEqual(['budget-overflow'])
    expect(result.nextAction).toBe('fork-required')
  })

  it('refuses malformed input with exact messages', () => {
    const policy = createContextPolicy(1000, 100)
    expect(() => planContext({ policy, messages: [], privacy: undefined as never })).toThrow('Provide both independent privacy settings.')
    expect(() => planContext({ policy, messages: [], privacy: { memoryDisabled: true } as never })).toThrow('Provide both independent privacy settings.')
    const invalid = 'Provide unique valid messages from one conversation boundary.'
    expect(() => planContext({ policy, messages: [message('a'), message('a')], privacy: open })).toThrow(invalid)
    expect(() => planContext({ policy, messages: [message('')], privacy: open })).toThrow(invalid)
    expect(() => planContext({ policy, messages: [{ ...message('a'), role: 'system' as never }], privacy: open })).toThrow(invalid)
    expect(() => planContext({ policy, messages: [{ ...message('a'), text: 4 as never }], privacy: open })).toThrow(invalid)
    const layers = 'Provide at most one text instruction layer per global, agent or project scope.'
    expect(() =>
      planContext({
        policy,
        messages: [],
        privacy: open,
        inheritedInstructions: [
          { scope: 'global', text: 'a' },
          { scope: 'global', text: 'b' },
        ],
      }),
    ).toThrow(layers)
    expect(() => planContext({ policy, messages: [], privacy: open, inheritedInstructions: [{ scope: 'session' as never, text: 'a' }] })).toThrow(layers)
    expect(() => planContext({ policy, messages: [], privacy: open, inheritedInstructions: [{ scope: 'agent', text: 'x'.repeat(16001) }] })).toThrow(layers)
  })
})

function profile(): Character {
  return {
    name: 'Sprout',
    speakingPreset: 'warm',
    speakingStyle: '',
    personality: '',
    renderer: 'static',
    portrait: '',
    face: 'sprout',
    tone: 'green',
    mood: 'calm',
    emotions: { neutral: 'default', happy: 'default', thinking: 'default', concerned: 'default', celebrating: 'default' },
  }
}
const png = 'data:image/png;base64,AAAA'
const asset = (id: string) => ({ id, name: id, kind: 'image' as const, src: png })

describe('character studio', () => {
  it('starts with empty identity and authored examples', () => {
    const studio = createCharacterStudio()
    expect(studio.soul).toBe('')
    expect(studio.modes.default).toBe('character')
    expect(studio.examples.prompt).toBe('Help me get started on a difficult task.')
    expect(createCharacterStudio()).not.toBe(studio)
    expect(characterSchema.shape.studio.safeParse(studio).success).toBe(true)
  })

  it('makes a custom-preset draft without sharing the original', () => {
    const original = profile()
    const draft = characterDraft(original)
    expect(draft.speakingPreset).toBe('custom')
    expect(original.speakingPreset).toBe('warm')
    expect(draft.studio).toEqual(createCharacterStudio())
    const withStudio = characterDraft({ ...original, studio: { ...createCharacterStudio(), soul: 'kind' } })
    expect(withStudio.studio.soul).toBe('kind')
  })

  it('accepts a valid profile and returns the parsed draft', () => {
    const result = validateCharacter(profile())
    expect(result.name).toBe('Sprout')
    expect(result.speakingPreset).toBe('custom')
  })

  it('refuses invalid fields with the first issue message', () => {
    expect(() => validateCharacter({ ...profile(), name: '   ' })).toThrow('Give your character a name.')
    expect(() => validateCharacter({ ...profile(), portrait: 'https://example.com/a.png' })).toThrow('Use an embedded PNG, JPEG, or WebP image.')
    const studio = createCharacterStudio()
    studio.appearance.assets = [asset('main')]
    expect(() => validateCharacter({ ...profile(), studio })).toThrow('Choose a unique asset identifier.')
  })

  it('refuses an oversized package', () => {
    expect(() => validateCharacter({ ...profile(), mood: 'x'.repeat(33 * 1024 * 1024) })).toThrow('Keep the character package under 32 MB. Remove a large asset and try again.')
  })

  it('refuses duplicate ids and dangling assignments', () => {
    const duplicateAssets = createCharacterStudio()
    duplicateAssets.appearance.assets = [asset('one'), asset('one')]
    expect(() => validateCharacter({ ...profile(), studio: duplicateAssets })).toThrow('Asset IDs must be unique.')
    const duplicateDetails = createCharacterStudio()
    duplicateDetails.details = [
      { id: 'a', label: 'x', value: 'y' },
      { id: 'a', label: 'x', value: 'y' },
    ]
    expect(() => validateCharacter({ ...profile(), studio: duplicateDetails })).toThrow('Profile detail IDs must be unique.')
    const duplicateExpressions = createCharacterStudio()
    duplicateExpressions.appearance.expressions = [
      { id: 'e', name: 'Glad', instruction: '', assetId: null },
      { id: 'e', name: 'Sad', instruction: '', assetId: null },
    ]
    expect(() => validateCharacter({ ...profile(), studio: duplicateExpressions })).toThrow('Expression IDs must be unique.')
    const dangling = createCharacterStudio()
    dangling.appearance.activities.idle = 'missing'
    expect(() => validateCharacter({ ...profile(), studio: dangling })).toThrow('An appearance assignment refers to a missing asset.')
    const danglingExpression = createCharacterStudio()
    danglingExpression.appearance.expressions = [{ id: 'e', name: 'Glad', instruction: '', assetId: 'missing' }]
    expect(() => validateCharacter({ ...profile(), studio: danglingExpression })).toThrow('An appearance assignment refers to a missing asset.')
  })

  it('compares structurally', () => {
    expect(sameCharacterValue(1, 1)).toBe(true)
    expect(sameCharacterValue({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true)
    expect(sameCharacterValue({ a: 1 }, { a: 2 })).toBe(false)
    expect(sameCharacterValue({ a: 1 }, { b: 1 })).toBe(false)
    expect(sameCharacterValue({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    expect(sameCharacterValue(null, {})).toBe(false)
    expect(sameCharacterValue('a', 'b')).toBe(false)
    expect(sameCharacterValue({}, 1)).toBe(false)
  })

  it('removes an asset and every reference to it', () => {
    const studio: CharacterStudio = createCharacterStudio()
    studio.appearance.assets = [asset('one'), asset('two')]
    studio.appearance.activities = { idle: 'one', listening: 'two', thinking: null, speaking: 'one' }
    studio.appearance.expressions = [
      { id: 'e1', name: 'A', instruction: '', assetId: 'one' },
      { id: 'e2', name: 'B', instruction: '', assetId: 'two' },
    ]
    const next = removeCharacterAsset(studio, 'one')
    expect(next.appearance.assets.map(item => item.id)).toEqual(['two'])
    expect(next.appearance.activities).toEqual({ idle: null, listening: 'two', thinking: null, speaking: null })
    expect(next.appearance.expressions.map(item => item.assetId)).toEqual([null, 'two'])
    expect(studio.appearance.assets).toHaveLength(2)
  })

  it('previews an authored example for a mode', () => {
    expect(previewCharacter(profile(), 'focus')).toEqual({
      kind: 'authored-example',
      prompt: 'Help me get started on a difficult task.',
      text: 'Choose the smallest useful step. Work on it for ten minutes, then reassess.',
      delivery: 'Use the same voice identity with clear, restrained, natural delivery.',
      mode: 'focus',
    })
    expect(previewCharacter(profile(), 'character').text).toMatch(/^Let's make the first step small/)
    expect(() => previewCharacter({ ...profile(), name: '' }, 'focus')).toThrow('Give your character a name.')
  })
})

describe('requireStillImage', () => {
  const bytes = (...parts: (number[] | string)[]) => Uint8Array.from(parts.flatMap(part => (typeof part === 'string' ? [...part].map(char => char.charCodeAt(0)) : part)))
  const u32 = (value: number, little = false) => (little ? [value & 255, (value >> 8) & 255, (value >> 16) & 255, (value >>> 24) & 255] : [(value >>> 24) & 255, (value >> 16) & 255, (value >> 8) & 255, value & 255])
  const header = '\u0089PNG\r\n\u001a\n'
  const mismatch = "This image's contents do not match its format. Choose a still PNG, JPEG, or WebP."

  it('accepts a still PNG, JPEG and WebP', () => {
    expect(() => requireStillImage(bytes(header, u32(0), 'IHDR', u32(0)), 'image/png')).not.toThrow()
    expect(() => requireStillImage(bytes([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg')).not.toThrow()
    expect(() => requireStillImage(bytes('RIFF', u32(4, true), 'WEBP', 'VP8 ', u32(0, true)), 'image/webp')).not.toThrow()
  })

  it('refuses contents that do not match the declared format', () => {
    expect(() => requireStillImage(bytes([1, 2, 3]), 'image/png')).toThrow(mismatch)
    expect(() => requireStillImage(bytes([0xff, 0xd8, 0xff]), 'image/png')).toThrow(mismatch)
    expect(() => requireStillImage(bytes(header), 'image/gif')).toThrow(mismatch)
  })

  it('refuses an animated PNG', () => {
    const animated = bytes(header, u32(0), 'IHDR', u32(0), u32(8), 'acTL', new Array(8).fill(0), u32(0))
    expect(() => requireStillImage(animated, 'image/png')).toThrow('Use a still PNG for portraits. Upload an MP4/WebM loop for animation so motion can be paused.')
  })

  it('refuses an animated WebP', () => {
    for (const tag of ['ANIM', 'ANMF']) {
      const animated = bytes('RIFF', u32(16, true), 'WEBP', tag, u32(0, true))
      expect(() => requireStillImage(animated, 'image/webp')).toThrow('Use a still WebP for portraits. Upload an MP4/WebM loop for animation so motion can be paused.')
    }
  })
})

describe('insertTranscript', () => {
  const anchor = (text: string, start: number, end = start) => ({ text, start, end })

  it('ignores an empty transcript', () => expect(insertTranscript('hello', '   ', anchor('hello', 5))).toEqual({ text: 'hello', caret: 5 }))
  it('inserts at the cursor with spacing', () => {
    expect(insertTranscript('hello world', 'big', anchor('hello world', 5))).toEqual({ text: 'hello big world', caret: 9 })
    expect(insertTranscript('', ' hi ', anchor('', 0))).toEqual({ text: 'hi', caret: 2 })
  })
  it('replaces a selection and keeps punctuation tight', () => {
    expect(insertTranscript('say XX.', 'it', anchor('say XX.', 4, 6))).toEqual({ text: 'say it.', caret: 6 })
  })
  it('clamps the anchor into the draft', () => {
    expect(insertTranscript('ab', 'c', anchor('ab', 99, 5))).toEqual({ text: 'ab c', caret: 4 })
    expect(insertTranscript('ab', 'c', anchor('ab', -4, -1))).toEqual({ text: 'c ab', caret: 2 })
  })
  it('appends when the draft changed since the anchor was captured', () => {
    expect(insertTranscript('edited text', 'more', anchor('old text', 0))).toEqual({ text: 'edited text more', caret: 16 })
  })
})
