import { describe, expect, it } from 'vitest'
import { fenceClosed, isAnswerUiLanguage, MAX_BLOCK_CHARACTERS, MAX_BLOCK_DEPTH, MAX_BLOCK_NODES } from '@/components/answer-ui/fence'
import { formMessage, markdownTable, startValue } from '@/components/answer-ui/format'
import { checkedLink } from '@/components/answer-ui/links'
import { serviceIn } from '@/components/brand/service'
import { CHAT_ACCESS, DEFAULT_ACCESS, TOOL_ACCESS } from '@/components/gateway/access-labels'
import { effectiveMode, modeLabel, modeTarget, offersModel, composerModes, type ModeValues } from '@/components/gateway/composer-mode'
import { isResolvedSetupStep, setupLabels, setupOperations, setupStateLabels, summarizeSetup } from '@/components/gateway/setup-presentation'
import { inboxSummary } from '@/components/inbox/inbox-summary'
import { memoryRetrievalSummary, plainStatus } from '@/components/gateway/plain-status'
import { chatGPTConnectionRules, nativeClaudeConnectionRules } from '@/components/gateway/subscription-rules'
import { saveNewChatEffort } from '@/components/gateway/new-chat-effort'
import { failedRunReason, skippedRunLabel } from '@/lib/gateway/job-run-words'
import { claudeModels, CLAUDE_PROVIDER_ID, NUMBERED, addClaudeModels, hasClaudePlan, missingClaudeModels, modelMenuLayout } from '@/lib/gateway/claude-models'
import type { AutoSettings } from '@/lib/gateway/auto-settings'
import type { SetupStatus, SetupStep } from '@/lib/gateway/control'
import type { ChatGPTStatus } from '@/lib/gateway/chatgpt'
import type { NativeClaudeStatus } from '@/lib/gateway/native-claude'
import { GatewayError } from '@/lib/gateway/transport'

describe('answer ui fences', () => {
  it('knows the OpenUI languages in any case', () => {
    expect(isAnswerUiLanguage('openui')).toBe(true)
    expect(isAnswerUiLanguage('OpenUI-Lang')).toBe(true)
    expect(isAnswerUiLanguage('js')).toBe(false)
  })

  it('exports the block limits', () => expect([MAX_BLOCK_CHARACTERS, MAX_BLOCK_NODES, MAX_BLOCK_DEPTH]).toEqual([16000, 300, 64]))

  it('tells a closed fence from one still arriving', () => {
    expect(fenceClosed('```openui\nroot = A()\n```')).toBe(true)
    expect(fenceClosed('```openui\nroot = A()\n```\n\n')).toBe(true)
    expect(fenceClosed('~~~openui\nx\n~~~~')).toBe(true)
    expect(fenceClosed('```openui\nroot = A()')).toBe(false)
    expect(fenceClosed('```openui')).toBe(false)
    expect(fenceClosed('no fence\nat all')).toBe(false)
    expect(fenceClosed('')).toBe(false)
    expect(fenceClosed('~~~openui\nx\n```')).toBe(false)
    expect(fenceClosed('````openui\nx\n```')).toBe(false)
    expect(fenceClosed('```openui\nx\n``` trailing')).toBe(false)
  })
})

describe('answer ui text', () => {
  it('writes a markdown table with escaped cells', () => {
    expect(
      markdownTable(
        ['Name', 'Note'],
        [
          ['a|b', 'one\r\ntwo'],
          ['back\\slash', 'x'],
        ],
      ),
    ).toBe('| Name | Note |\n| --- | --- |\n| a\\|b | one two |\n| back\\\\slash | x |')
  })

  it('starts sliders with a value and everything else empty', () => {
    expect(startValue({ typeName: 'TextField' })).toBe('')
    expect(startValue({ typeName: 'SliderField', props: { value: 7, min: 1 } })).toBe('7')
    expect(startValue({ typeName: 'SliderField', props: { min: 2 } })).toBe('2')
    expect(startValue({ typeName: 'SliderField', props: { min: Infinity } })).toBe('')
    expect(startValue({ typeName: 'SliderField' })).toBe('')
    expect(startValue({ typeName: 'SliderField', props: { value: '5' } })).toBe('')
  })

  it('sends a form as its title then each answered field', () => {
    const fields = [{ props: { label: 'Name' } }, { props: { label: 7 } }, {}, { props: { label: 'Skipped' } }]
    expect(formMessage('  Sign up ', fields, [' Ada ', 'x', 'y', '   '])).toBe('Sign up\n- Name: Ada\n- 7: x\n- Field 3: y')
    expect(formMessage('Title', fields, ['', ' ', undefined as unknown as string, ''])).toBe('')
    expect(formMessage('  ', [{ props: { label: 'A' } }], ['v'])).toBe('- A: v')
  })

  it('opens only web and mail links that pass the answer link check', () => {
    expect(checkedLink('https://example.com/a')).toBe('https://example.com/a')
    expect(checkedLink('mailto:a@example.com')).toBe('mailto:a@example.com')
    expect(checkedLink('http://example.com')).toBe('http://example.com')
    expect(checkedLink('/inside')).toBeUndefined()
    expect(checkedLink('#anchor')).toBeUndefined()
    expect(checkedLink('javascript:alert(1)')).toBeUndefined()
    expect(checkedLink('https://user:pw@example.com')).toBeUndefined()
    expect(checkedLink(42)).toBeUndefined()
    expect(checkedLink(undefined)).toBeUndefined()
  })
})

describe('serviceIn', () => {
  it('finds a service as a whole word', () => {
    expect(serviceIn('Send a GitHub issue')).toBe('github')
    expect(serviceIn(null, undefined, 'Ask ChatGPT')).toBe('openai')
    expect(serviceIn('read my gmail.')).toBe('gmail')
  })
  it('prefers the longest name', () => {
    expect(serviceIn('Google Calendar events')).toBe('googlecalendar')
    expect(serviceIn('save to google drive')).toBe('googledrive')
    expect(serviceIn('search google')).toBe('google')
  })
  it('matches x only as twitter or x.com', () => {
    expect(serviceIn('post to twitter')).toBe('x')
    expect(serviceIn('see x.com/home')).toBe('x')
    expect(serviceIn('the letter x')).toBeNull()
    expect(serviceIn('xax.com')).toBeNull()
  })
  it('ignores words inside other words and empty input', () => {
    expect(serviceIn('githubber')).toBeNull()
    expect(serviceIn()).toBeNull()
    expect(serviceIn('', null)).toBeNull()
  })
})

describe('access labels', () => {
  it('names each chat access value once, with a hint', () => {
    expect(CHAT_ACCESS.map(item => [item.value, item.label])).toEqual([
      ['default', 'Agent’s settings'],
      ['ask', 'Ask me'],
      ['ai', 'AI decides'],
      ['full', 'Full access'],
    ])
    expect(CHAT_ACCESS.every(item => item.hint.length > 10)).toBe(true)
  })
  it('names a tool’s own setting and an agent’s tool settings', () => {
    expect(DEFAULT_ACCESS).toEqual({ auto: 'Free', ai_review: 'AI decides', owner_confirmation: 'Asks you', blocked: 'Blocked' })
    expect(TOOL_ACCESS).toEqual([
      { value: 'allow', label: 'Free' },
      { value: 'ai', label: 'AI decides' },
      { value: 'ask', label: 'Ask me' },
    ])
  })
})

const proposal = (extra: Partial<AutoSettings> = {}): AutoSettings => ({
  complexity: 'easy',
  think: true,
  research: 'web',
  effort: 'high',
  modelId: 'router',
  answerModelId: 'big',
  reasons: { complexity: 'a', think: 'b', research: 'c' },
  ...extra,
})
const layout = { top: [{ id: 'big', name: 'Big', providerName: 'P' }], more: [{ id: 'small', name: 'Small', providerName: 'P' }] }

describe('composer mode', () => {
  const values: ModeValues = { think: true, research: 'web', effort: 'high', modelId: 'big' }

  it('lists the four modes', () => expect(composerModes.map(mode => mode.id)).toEqual(['auto', 'fast', 'balanced', 'deep']))

  it('offers only models the menu shows', () => {
    expect(offersModel(layout, 'big')).toBe(true)
    expect(offersModel(layout, 'small')).toBe(true)
    expect(offersModel(layout, 'ghost')).toBe(false)
    expect(offersModel(null, 'big')).toBe(false)
  })

  it('reads the routing proposal as a target', () => {
    expect(modeTarget(null, true, layout)).toBeNull()
    expect(modeTarget(proposal(), true, layout)).toEqual({ think: true, research: 'web', effort: 'high', modelId: 'big' })
    expect(modeTarget(proposal(), false, layout)?.think).toBe(false)
    expect(modeTarget(proposal({ effort: undefined, answerModelId: undefined }), true, layout)).toMatchObject({ effort: null, modelId: null })
    expect(modeTarget(proposal({ answerModelId: 'ghost' }), true, layout)?.modelId).toBeNull()
    expect(modeTarget(proposal(), true, null)?.modelId).toBeNull()
  })

  it('keeps the mode while the screen matches, else says custom', () => {
    expect(effectiveMode('fast', values, null, true, layout)).toBe('fast')
    expect(effectiveMode('fast', values, proposal(), true, layout)).toBe('fast')
    expect(effectiveMode('fast', { ...values, think: false }, proposal(), true, layout)).toBe('custom')
    expect(effectiveMode('fast', { ...values, research: 'off' }, proposal(), true, layout)).toBe('custom')
    expect(effectiveMode('fast', { ...values, effort: 'light' }, proposal(), true, layout)).toBe('custom')
    expect(effectiveMode('fast', { ...values, modelId: 'small' }, proposal(), true, layout)).toBe('custom')
    expect(effectiveMode('deep', { ...values, effort: 'light', modelId: 'small' }, proposal({ effort: undefined, answerModelId: undefined }), true, layout)).toBe('deep')
  })

  it('labels modes', () => {
    expect(modeLabel('custom')).toBe('Custom')
    expect(modeLabel('balanced')).toBe('Balanced')
  })
})

function step(id: SetupStep['id'], state: SetupStep['state'], required = true): SetupStep {
  return { id, state, required, prerequisites: [], blockingReasonCode: null, evidence: [] }
}

describe('setup presentation', () => {
  it('labels every step and state', () => {
    expect(Object.keys(setupLabels)).toEqual(['security', 'companion', 'model', 'memory', 'capabilities', 'boundaries', 'protection', 'rehearsal'])
    expect(setupLabels.model.title).toBe('Choose how it thinks')
    expect(setupStateLabels).toEqual({ not_started: 'Not started', in_progress: 'In progress', blocked: 'Blocked', skipped: 'Off for now', complete: 'Verified', degraded: 'Needs attention' })
    expect(setupOperations.configure_model).toEqual({ label: 'Choose an answer model', to: '/settings' })
  })

  it('counts a complete or skipped step as resolved', () => {
    expect(isResolvedSetupStep(step('model', 'complete'))).toBe(true)
    expect(isResolvedSetupStep(step('model', 'skipped'))).toBe(true)
    expect(isResolvedSetupStep(step('model', 'blocked'))).toBe(false)
  })

  it('summarizes the setup', () => {
    const status = {
      currentStep: 'model',
      recommendedNextOperation: 'test_model',
      steps: [step('security', 'complete'), step('companion', 'skipped', false), step('model', 'blocked'), step('memory', 'degraded', false), step('capabilities', 'in_progress')],
    } as unknown as SetupStatus
    const summary = summarizeSetup(status)
    expect(summary.current?.id).toBe('model')
    expect(summary.operation).toEqual({ label: 'Test the answer model', to: '/settings' })
    expect(summary).toMatchObject({ resolved: 2, remainingRequired: 2, attention: 2 })
    expect(summarizeSetup({ ...status, currentStep: null, recommendedNextOperation: null })).toMatchObject({ current: null, operation: null })
  })
})

describe('inboxSummary', () => {
  const answered = { answered: true, failed: false }
  it('waits while any source has neither answered nor failed', () => {
    expect(inboxSummary([answered, { answered: false, failed: false }], 3, 1)).toEqual({ state: 'loading', text: 'Loading your Inbox…' })
  })
  it('never counts a failed source as empty', () => {
    expect(inboxSummary([answered, { answered: false, failed: true }], 0, 4)).toEqual({ state: 'partial', text: 'Part of your Inbox didn’t load' })
    expect(inboxSummary([answered, { answered: false, failed: true }], 2, 4)).toEqual({ state: 'partial', text: '2 need you · part of your Inbox didn’t load' })
  })
  it('reports all clear or what waits', () => {
    expect(inboxSummary([answered], 0, 0)).toEqual({ state: 'ready', text: 'All clear · 0 decided today' })
    expect(inboxSummary([answered], 1, 5)).toEqual({ state: 'ready', text: '1 needs you · 5 decided today' })
    expect(inboxSummary([], 3, 2).text).toBe('3 need you · 2 decided today')
  })
})

describe('plain status', () => {
  it('uses plain words for known statuses and spaces for unknown ones', () => {
    expect(plainStatus('ok')).toBe('Ready')
    expect(plainStatus('awaiting_approval')).toBe('Waiting for your OK')
    expect(plainStatus('CONFIRMATION_REQUIRED')).toBe('Waiting for your OK')
    expect(plainStatus('some_new-state')).toBe('some new state')
  })
  it('summarizes memory retrieval', () => {
    expect(memoryRetrievalSummary({ status: 'ok', records: 1 } as never)).toBe('Memory · 1 record supplied')
    expect(memoryRetrievalSummary({ status: 'ok', records: 3 } as never)).toBe('Memory · 3 records supplied')
    expect(memoryRetrievalSummary({ status: 'degraded', records: 0 } as never)).toBe('Memory · Needs attention · 0 records supplied')
  })
})

describe('subscription connection rules', () => {
  const gpt = (extra: Partial<ChatGPTStatus> = {}) =>
    ({ available: true, connected: false, connectionId: null, plan: null, loginId: null, loginState: 'idle', problem: null, models: [], catalogueComplete: true, credentialsIncluded: false, ...extra }) as ChatGPTStatus
  const connectionId = 'connection_' + '0'.repeat(32)

  it('allows ChatGPT operations only in the states they fit', () => {
    const allowed = chatGPTConnectionRules.allowed
    expect(allowed(gpt({ available: false }), { operation: 'login' })).toBe(false)
    expect(allowed(gpt(), { operation: 'login' })).toBe(true)
    expect(allowed(gpt({ loginState: 'pending', loginId: 'a' }), { operation: 'login' })).toBe(false)
    expect(allowed(gpt({ connected: true, connectionId }), { operation: 'login' })).toBe(false)
    expect(allowed(gpt({ loginState: 'pending', loginId: 'a' }), { operation: 'cancel', loginId: 'a' })).toBe(true)
    expect(allowed(gpt({ loginState: 'pending', loginId: 'a' }), { operation: 'cancel', loginId: 'b' })).toBe(false)
    expect(allowed(gpt({ connected: true, connectionId }), { operation: 'logout', connectionId })).toBe(true)
    expect(allowed(gpt({ connected: true, connectionId }), { operation: 'logout', connectionId: 'connection_' + '1'.repeat(32) })).toBe(false)
    expect(allowed(gpt(), { operation: 'logout', connectionId })).toBe(false)
    expect(allowed(gpt({ connected: true, connectionId }), { operation: 'models' })).toBe(true)
    expect(allowed(gpt(), { operation: 'models' })).toBe(false)
  })

  it('keeps a device code only while a login is pending', () => {
    const code = { verificationUrl: 'https://auth.openai.com/codex/device', userCode: 'ABCD-1234' } as const
    const pending = gpt({ loginState: 'pending', loginId: 'a' })
    expect(chatGPTConnectionRules.accept(null, { ...pending, deviceCode: code }, { operation: 'login' }).deviceCode).toEqual(code)
    expect(chatGPTConnectionRules.accept({ ...pending, deviceCode: code }, pending).deviceCode).toEqual(code)
    expect(chatGPTConnectionRules.accept({ ...pending, loginId: 'other', deviceCode: code }, pending).deviceCode).toBeNull()
    expect(chatGPTConnectionRules.accept({ ...pending, deviceCode: code }, pending, { operation: 'models' }).deviceCode).toBeNull()
    expect(chatGPTConnectionRules.accept(null, { ...gpt(), deviceCode: code }, { operation: 'login' }).deviceCode).toBeNull()
    expect(chatGPTConnectionRules.accept(null, { ...pending, available: false, deviceCode: code }, { operation: 'login' }).deviceCode).toBeNull()
  })

  const claude = (extra: Partial<NativeClaudeStatus> = {}) =>
    ({ available: true, connected: false, loginState: 'idle', loginId: null, authorizationUrl: null, credentialsIncluded: false, runtime: 'Claude Code', models: [], ...extra }) as NativeClaudeStatus
  const loginId = 'login_' + '0'.repeat(32)

  it('allows Claude operations only in the states they fit', () => {
    const allowed = nativeClaudeConnectionRules.allowed
    expect(allowed(claude({ available: false }), { operation: 'login' })).toBe(false)
    expect(allowed(claude(), { operation: 'login' })).toBe(true)
    expect(allowed(claude({ connected: true }), { operation: 'login' })).toBe(false)
    expect(allowed(claude({ loginState: 'pending', loginId }), { operation: 'login' })).toBe(false)
    expect(allowed(claude({ loginState: 'pending', loginId }), { operation: 'cancel', loginId })).toBe(true)
    expect(allowed(claude({ loginState: 'pending', loginId }), { operation: 'cancel', loginId: 'login_' + '1'.repeat(32) })).toBe(false)
    expect(allowed(claude({ connected: true }), { operation: 'logout' })).toBe(true)
    expect(allowed(claude(), { operation: 'logout' })).toBe(false)
  })

  it('keeps an authorization link only while a login is pending', () => {
    const url = 'https://claude.ai/oauth'
    const pending = claude({ loginState: 'pending', loginId, authorizationUrl: url })
    expect(nativeClaudeConnectionRules.accept(null, pending).authorizationUrl).toBe(url)
    expect(nativeClaudeConnectionRules.accept(null, { ...pending, connected: true }).authorizationUrl).toBeNull()
    expect(nativeClaudeConnectionRules.accept(null, { ...pending, available: false }).authorizationUrl).toBeNull()
    expect(nativeClaudeConnectionRules.accept(null, { ...pending, loginId: null }).authorizationUrl).toBeNull()
  })
})

describe('saveNewChatEffort', () => {
  const output = { format: 'auto', length: 'auto', language: 'English' }
  const control = (calls: unknown[], fail?: unknown) =>
    ({
      chatNames: {
        output: async (id: string) => {
          calls.push(['output', id])
          if (fail) throw fail
          return { output, revision: 4 }
        },
        saveOutput: async (...args: unknown[]) => void calls.push(['save', ...args]),
      },
    }) as never

  it('saves nothing without a control or for auto effort', async () => {
    const calls: unknown[] = []
    expect(await saveNewChatEffort(undefined, 's1', 'high')).toBeNull()
    expect(await saveNewChatEffort(control(calls), 's1', 'auto')).toBeNull()
    expect(calls).toEqual([])
  })

  it('saves the effort on top of the current output settings', async () => {
    const calls: unknown[] = []
    expect(await saveNewChatEffort(control(calls), 's1', 'high')).toBeNull()
    expect(calls).toEqual([
      ['output', 's1'],
      ['save', 's1', { ...output, effort: 'high' }, 4],
    ])
  })

  it('explains a failure in a sentence', async () => {
    const message = await saveNewChatEffort(control([], new GatewayError('network')), 's1', 'high')
    expect(message).toMatch(/^The chat was created, but its effort was not saved: .+ Set it from the model button\.$/)
  })
})

describe('failedRunReason', () => {
  it('explains known outcome codes in plain words', () => {
    expect(failedRunReason('LOCKED_DOWN')).toBe('Conker is locked down, so nothing ran.')
    expect(failedRunReason('TOOL_UNAVAILABLE')).toBe('The tool this job uses did not answer.')
  })
  it('falls back to the general line, never a raw code', () => {
    expect(failedRunReason(null)).toBe('The job started but did not finish.')
    expect(failedRunReason('SOMETHING_NEW')).toBe('The job started but did not finish.')
  })
})

describe('skippedRunLabel', () => {
  it('names the job limits Pi holds a run back for', () => {
    expect(skippedRunLabel('TRIGGER_OFF')).toBe('Skipped: trigger not allowed')
    expect(skippedRunLabel('TOO_SOON')).toBe('Skipped: shortest interval')
    expect(skippedRunLabel('RUN_LIMIT')).toBe('Skipped: runs a day reached')
    expect(skippedRunLabel('SOMETHING_NEW')).toBe('Skipped: your limits')
  })
})

type Row = { id: string; providerId: string; name: string; route: string; enabled: boolean; routingDescription: string }
const entry = (id: string, providerId: string, name: string, route: string, enabled = true): Row => ({ id, providerId, name, route, enabled, routingDescription: '' })

function catalogue(models: Row[], providers: { id: string; name: string; enabled: boolean }[], eligible: string[] = []) {
  const role = { enabled: true, eligibleModelIds: eligible, modelId: null, timeoutMs: 1, failure: 'stop', fallbackModelIds: [], followAnswer: false }
  return { providers: providers.map(provider => ({ ...provider, endpoint: '', apiKeyDraft: '' })), models, defaultModelId: null, roleSettings: { answerMode: 'manual', roles: { answer: role } } } as never as Parameters<
    typeof hasClaudePlan
  >[0]
}
const plan = { id: CLAUDE_PROVIDER_ID, name: 'Claude plan', enabled: true }

describe('Claude model catalogue', () => {
  it('names thirteen models with the first four numbered', () => {
    expect(claudeModels).toHaveLength(13)
    expect(NUMBERED).toBe(4)
    expect(claudeModels[0]).toEqual({ name: 'Opus 5.5', route: 'claude-opus-5-5' })
  })

  it('needs an enabled Claude plan provider', () => {
    expect(hasClaudePlan(catalogue([], [plan]))).toBe(true)
    expect(hasClaudePlan(catalogue([], [{ ...plan, enabled: false }]))).toBe(false)
    expect(hasClaudePlan(catalogue([], []))).toBe(false)
  })

  it('lists Claude models that are missing, off or not allowed to answer', () => {
    const models = [entry('a', CLAUDE_PROVIDER_ID, 'Opus', 'claude-opus-5-5'), entry('b', CLAUDE_PROVIDER_ID, 'Fable', 'claude-fable-5-2', false), entry('c', CLAUDE_PROVIDER_ID, 'Sonnet', 'claude-sonnet-5-5')]
    const missing = missingClaudeModels(catalogue(models, [plan], ['a'])).map(model => model.route)
    expect(missing).not.toContain('claude-opus-5-5')
    expect(missing).toContain('claude-fable-5-2')
    expect(missing).toContain('claude-sonnet-5-5')
    expect(missing).toContain('claude-haiku-5-5')
    expect(missing).toHaveLength(12)
  })

  it('adds every Claude model, switches existing ones on and allows them to answer', () => {
    const models = [entry('openai', 'openai', 'GPT', 'gpt'), entry('mine', CLAUDE_PROVIDER_ID, 'Mine', 'claude-opus-5-5', false), entry('claude-fable-5-2', 'openai', 'Taken id', 'other')]
    const config = catalogue(models, [plan], ['openai'])
    const next = addClaudeModels(config)
    expect(next.models.find(model => model.id === 'mine')?.enabled).toBe(true)
    expect(next.models.find(model => model.id === 'openai')).toBe(config.models[0])
    const fable = next.models.find(model => model.route === 'claude-fable-5-2' && model.providerId === CLAUDE_PROVIDER_ID)
    expect(fable).toEqual({ id: 'claude-fable-5-2-2', providerId: CLAUDE_PROVIDER_ID, name: 'Fable 5.2', route: 'claude-fable-5-2', enabled: true, routingDescription: '' })
    expect(next.models).toHaveLength(3 + 12)
    expect(next.roleSettings.roles.answer.eligibleModelIds.slice(0, 2)).toEqual(['openai', 'mine'])
    expect(next.roleSettings.roles.answer.eligibleModelIds).toHaveLength(14)
    expect(config.models).toHaveLength(3)
    expect(missingClaudeModels(next)).toEqual([])
    expect(addClaudeModels(next).models).toHaveLength(next.models.length)
  })

  it('lays out the menu with number keys for the four current Claude models', () => {
    const models = [
      entry('gpt', 'openai', 'Sonnet 5.5', 'gpt'),
      entry('s', CLAUDE_PROVIDER_ID, 'raw', 'claude-sonnet-5-5'),
      entry('h45', CLAUDE_PROVIDER_ID, 'raw2', 'claude-haiku-4-5'),
      entry('o46', CLAUDE_PROVIDER_ID, 'raw3', 'claude-opus-4-6'),
      entry('zz', 'openai', 'Zed', 'zed'),
    ]
    const config = catalogue(models, [plan, { id: 'openai', name: 'OpenAI', enabled: true }])
    const layout = modelMenuLayout(config, models)
    expect(layout.top).toEqual([
      { id: null, name: 'Opus 5.5', number: 1, providerName: 'Claude plan' },
      { id: null, name: 'Fable 5.2', number: 2, providerName: 'Claude plan' },
      { id: 's', name: 'Sonnet 5.5 · Claude plan', number: 3, providerName: 'Claude plan' },
      { id: null, name: 'Haiku 5.5', number: 4, providerName: 'Claude plan' },
    ])
    expect(layout.more.map(row => [row.id, row.name])).toEqual([
      ['h45', 'Haiku 4.5'],
      ['o46', 'Opus 4.6'],
      ['gpt', 'Sonnet 5.5 · OpenAI'],
      ['zz', 'Zed'],
    ])
  })

  it('without a Claude plan, numbers the first four models the owner has', () => {
    const models = ['a', 'b', 'c', 'd', 'e'].map(id => entry(id, 'openai', id.toUpperCase(), id))
    const layout = modelMenuLayout(catalogue(models, [{ id: 'openai', name: 'OpenAI', enabled: true }]), models)
    expect(layout.top.map(row => [row.id, row.number])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
      ['d', 4],
    ])
    expect(layout.more).toEqual([{ id: 'e', name: 'E', providerName: 'OpenAI' }])
  })

  it('names a model only by its own name when the provider is unknown', () => {
    const models = [entry('a', 'ghost', 'Same', 'a'), entry('b', 'ghost', 'Same', 'b')]
    const layout = modelMenuLayout(catalogue(models, []), models)
    expect(layout.top.map(row => row.name)).toEqual(['Same', 'Same'])
  })
})
