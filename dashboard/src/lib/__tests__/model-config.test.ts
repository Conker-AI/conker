import { describe, expect, it } from 'vitest'
import { createModelsConfiguration, getAvailableModels, getDefaultModel, validateModelsConfiguration, type ModelsConfiguration } from '../api/model-catalogue'
import { MAX_BACKUPS, MODEL_ROLES, createModelRoles, followAnswerRoles, modelRolesErrors, planModelRole, sideJobChoice, withAnswerModel, withIdeas, withSideJob, type ModelRole, type ModelRolesConfiguration } from '../api/model-roles'

function configured(): ModelsConfiguration & { roleSettings: ModelRolesConfiguration } {
  const base = createModelsConfiguration()
  return { ...base, roleSettings: createModelRoles(base) }
}

describe('model catalogue', () => {
  it('hands out a fresh draft each time', () => {
    const first = createModelsConfiguration()
    first.models[0].name = 'changed'
    expect(createModelsConfiguration().models[0].name).toBe('Claude Sonnet 4')
    expect(first.defaultModelId).toBe('openrouter-sonnet')
  })

  it('lists only enabled models on enabled providers', () => {
    const config = createModelsConfiguration()
    config.providers[1].enabled = false
    config.models[0].enabled = false
    expect(getAvailableModels(config).map(model => model.id)).toEqual(['openrouter-gpt', 'openai-gpt'])
  })

  it('finds the default only while it is available', () => {
    const config = createModelsConfiguration()
    expect(getDefaultModel(config)?.id).toBe('openrouter-sonnet')
    config.providers[0].enabled = false
    expect(getDefaultModel(config)).toBeUndefined()
  })

  it('accepts the sample configuration', () => expect(validateModelsConfiguration(createModelsConfiguration())).toBeNull())

  it('refuses duplicate ids', () => {
    const providers = createModelsConfiguration()
    providers.providers[1].id = 'openrouter'
    expect(validateModelsConfiguration(providers)).toBe('Each provider must have a unique ID.')
    const models = createModelsConfiguration()
    models.models[1].id = 'openrouter-sonnet'
    expect(validateModelsConfiguration(models)).toBe('Each model must have a unique ID.')
  })

  it('refuses an empty endpoint only while the provider is enabled', () => {
    const config = createModelsConfiguration()
    config.providers[2].endpoint = '  '
    expect(validateModelsConfiguration(config)).toBe('Add an endpoint for OpenAI, or disable this provider.')
    config.providers[2].enabled = false
    config.models = config.models.filter(model => model.providerId !== 'openai')
    expect(validateModelsConfiguration(config)).toBeNull()
  })

  it('refuses endpoints that are not plain http or https', () => {
    const message = 'Use an HTTP or HTTPS endpoint without embedded credentials for Anthropic.'
    for (const endpoint of ['ftp://example.com', 'not a url', 'https://user:pw@example.com', 'https://user@example.com']) {
      const config = createModelsConfiguration()
      config.providers[1].endpoint = endpoint
      expect(validateModelsConfiguration(config)).toBe(message)
    }
    const http = createModelsConfiguration()
    http.providers[1].endpoint = 'http://localhost:11434/v1'
    expect(validateModelsConfiguration(http)).toBeNull()
  })

  it('skips endpoint checks for a server-managed catalogue', () => {
    const config = createModelsConfiguration()
    config.providers[1].endpoint = 'nonsense'
    config.providers[2].endpoint = ''
    expect(validateModelsConfiguration(config, true)).toBeNull()
  })

  it('refuses a model with a missing provider or blank fields', () => {
    const orphan = createModelsConfiguration()
    orphan.models[0].providerId = 'gone'
    expect(validateModelsConfiguration(orphan)).toBe('Choose an existing provider for Claude Sonnet 4.')
    const blank = createModelsConfiguration()
    blank.models[0].route = ' '
    expect(validateModelsConfiguration(blank)).toBe('Every model needs an ID, a name, and a route.')
  })

  it('refuses a default that is not enabled, or a missing default', () => {
    const disabled = createModelsConfiguration()
    disabled.models[0].enabled = false
    expect(validateModelsConfiguration(disabled)).toBe('Choose an enabled model as the default route.')
    const none = createModelsConfiguration()
    none.defaultModelId = null
    expect(validateModelsConfiguration(none)).toBe('Choose a default route from the enabled models.')
    const empty = createModelsConfiguration()
    empty.defaultModelId = null
    empty.models.forEach(model => (model.enabled = false))
    expect(validateModelsConfiguration(empty)).toBeNull()
  })

  it('reports the first role error when role settings are present', () => {
    const config = configured()
    expect(validateModelsConfiguration(config)).toBeNull()
    config.roleSettings.roles.answer.timeoutMs = 5
    expect(validateModelsConfiguration(config)).toBe('Talking / answers: timeout must be 100–600,000 milliseconds.')
  })
})

describe('createModelRoles', () => {
  it('enables only the answer role, on the default model', () => {
    const roles = configured().roleSettings
    expect(roles.answerMode).toBe('manual')
    expect(Object.keys(roles.roles)).toEqual([...MODEL_ROLES])
    expect(roles.roles.answer).toMatchObject({ enabled: true, modelId: 'openrouter-sonnet', eligibleModelIds: ['openrouter-sonnet'], failure: 'stop' })
    for (const role of MODEL_ROLES.filter(name => name !== 'answer')) {
      expect(roles.roles[role]).toEqual({ enabled: false, eligibleModelIds: [], modelId: null, timeoutMs: 30000, failure: 'stop', fallbackModelIds: [], followAnswer: false })
    }
  })

  it('leaves answer off when the default is unavailable', () => {
    const base = createModelsConfiguration()
    base.providers[0].enabled = false
    const answer = createModelRoles(base).roles.answer
    expect(answer.enabled).toBe(false)
    expect(answer.modelId).toBeNull()
    expect(answer.eligibleModelIds).toEqual([])
  })
})

describe('modelRolesErrors', () => {
  it('finds nothing wrong with the starting roles', () => expect(modelRolesErrors(configured().roleSettings, configured())).toEqual([]))

  it('refuses a missing or unknown answer mode', () => {
    const config = configured()
    const message = ['Choose a manual answer lock or configured router mode.']
    expect(modelRolesErrors({ ...config.roleSettings, answerMode: 'auto' as never }, config)).toEqual(message)
    expect(modelRolesErrors(undefined as never, config)).toEqual(message)
    expect(modelRolesErrors({ answerMode: 'manual', roles: null as never }, config)).toEqual(message)
  })

  it('refuses unknown or duplicate eligible models', () => {
    const config = configured()
    config.roleSettings.roles.reviewer.eligibleModelIds = ['ghost']
    expect(modelRolesErrors(config.roleSettings, config)).toEqual(['Checking actions (reviewer): choose unique catalogue models for the eligible list.'])
    config.roleSettings.roles.reviewer.eligibleModelIds = ['openai-gpt', 'openai-gpt']
    expect(modelRolesErrors(config.roleSettings, config)).toEqual(['Checking actions (reviewer): choose unique catalogue models for the eligible list.'])
    delete (config.roleSettings.roles as Partial<Record<ModelRole, unknown>>).reviewer
    expect(modelRolesErrors(config.roleSettings, config)).toEqual(['Checking actions (reviewer): choose unique catalogue models for the eligible list.'])
  })

  it('refuses a timeout outside the allowed range and an unknown failure mode', () => {
    const config = configured()
    config.roleSettings.roles.thinking.timeoutMs = 600001
    config.roleSettings.roles.routing.timeoutMs = 99.5
    config.roleSettings.roles.summarization.failure = 'retry' as never
    expect(modelRolesErrors(config.roleSettings, config)).toEqual([
      'Background thinking: timeout must be 100–600,000 milliseconds.',
      'Routing decision: timeout must be 100–600,000 milliseconds.',
      'Summarization: choose stop or explicit fallback on failure.',
    ])
  })

  it('limits backups and keeps them distinct from the primary', () => {
    const config = configured()
    const reviewer = config.roleSettings.roles.reviewer
    reviewer.eligibleModelIds = ['openrouter-sonnet', 'openrouter-gpt']
    reviewer.modelId = 'openrouter-sonnet'
    reviewer.failure = 'fallback'
    reviewer.fallbackModelIds = ['openrouter-sonnet']
    expect(modelRolesErrors(config.roleSettings, config)).toEqual(['Checking actions (reviewer): backups must differ from the primary model.'])
    reviewer.fallbackModelIds = Array.from({ length: MAX_BACKUPS + 1 }, (_, i) => `m${i}`)
    expect(modelRolesErrors(config.roleSettings, config)).toEqual([`Checking actions (reviewer): list each backup model once, at most ${MAX_BACKUPS}.`])
    reviewer.fallbackModelIds = ['openrouter-gpt', 'openrouter-gpt']
    expect(modelRolesErrors(config.roleSettings, config)).toEqual([`Checking actions (reviewer): list each backup model once, at most ${MAX_BACKUPS}.`])
  })

  it('requires selected and backup models to be eligible, and a stop role to carry no backups', () => {
    const config = configured()
    const reviewer = config.roleSettings.roles.reviewer
    reviewer.eligibleModelIds = ['openrouter-sonnet']
    reviewer.modelId = 'openai-gpt'
    expect(modelRolesErrors(config.roleSettings, config)).toEqual(['Checking actions (reviewer): selected and backup models must belong to its eligible list.'])
    reviewer.modelId = 'openrouter-sonnet'
    reviewer.fallbackModelIds = ['openrouter-sonnet']
    reviewer.failure = 'stop'
    expect(modelRolesErrors(config.roleSettings, config)).toEqual(['Checking actions (reviewer): backups must differ from the primary model.', 'Checking actions (reviewer): remove the backups or explicitly enable them.'])
  })

  it('requires an enabled role to have an enabled primary, backups and eligible models', () => {
    const config = configured()
    config.models[2].enabled = false
    const reviewer = config.roleSettings.roles.reviewer
    reviewer.enabled = true
    reviewer.eligibleModelIds = ['anthropic-sonnet']
    reviewer.modelId = 'anthropic-sonnet'
    expect(modelRolesErrors(config.roleSettings, config)).toEqual(['Checking actions (reviewer): choose an enabled primary model and provider.', 'Checking actions (reviewer): no eligible models are enabled.'])
    reviewer.modelId = 'openrouter-gpt'
    reviewer.eligibleModelIds = ['openrouter-gpt', 'anthropic-sonnet']
    reviewer.failure = 'fallback'
    reviewer.fallbackModelIds = ['anthropic-sonnet']
    expect(modelRolesErrors(config.roleSettings, config)).toEqual(['Checking actions (reviewer): choose enabled backup models and providers.'])
    reviewer.fallbackModelIds = []
    expect(modelRolesErrors(config.roleSettings, config)).toEqual(['Checking actions (reviewer): choose enabled backup models and providers.'])
  })

  it('does not let a manual lock fall back, and needs router roles for router mode', () => {
    const config = configured()
    config.roleSettings.roles.answer.failure = 'fallback'
    expect(modelRolesErrors(config.roleSettings, config)).toEqual(['Talking / answers: choose enabled backup models and providers.', 'A manual answer lock must stop on failure; it cannot silently switch models.'])
    config.roleSettings.roles.answer.failure = 'stop'
    config.roleSettings.answerMode = 'router'
    expect(modelRolesErrors(config.roleSettings, config)).toEqual(['Router mode needs an enabled answer role and routing decision role.'])
  })

  it('keeps decision classifiers to their own role and out of the default slot', () => {
    const config = configured()
    config.providers.push({ id: 'decisions', name: 'Decisions', endpoint: '', apiKeyDraft: '', enabled: true })
    config.models.push({ id: 'classifier', providerId: 'decisions', name: 'Classifier', route: 'model-routing', enabled: true })
    config.roleSettings.roles.routing.eligibleModelIds = ['classifier']
    expect(modelRolesErrors(config.roleSettings, config)).toEqual([])
    config.roleSettings.roles.reviewer.eligibleModelIds = ['classifier']
    expect(modelRolesErrors(config.roleSettings, config)).toEqual(['Checking actions (reviewer): this decision classifier cannot perform this role.'])
    config.roleSettings.roles.reviewer.eligibleModelIds = []
    config.defaultModelId = 'classifier'
    expect(modelRolesErrors(config.roleSettings, config)).toEqual(['A decision classifier cannot be the default talking model.'])
  })

  it('limits a routed shortlist when a classifier chooses', () => {
    const config = configured()
    config.providers.push({ id: 'decisions', name: 'Decisions', endpoint: '', apiKeyDraft: '', enabled: true })
    config.models.push({ id: 'classifier', providerId: 'decisions', name: 'Classifier', route: 'model-routing', enabled: true })
    for (let i = 0; i < 9; i++) config.models.push({ id: `extra-${i}`, providerId: 'openai', name: `Extra ${i}`, route: `r${i}`, enabled: true })
    const { roles } = config.roleSettings
    roles.answer.eligibleModelIds = ['openrouter-sonnet', ...Array.from({ length: 8 }, (_, i) => `extra-${i}`)]
    roles.routing = { ...roles.routing, enabled: true, eligibleModelIds: ['classifier'], modelId: 'classifier' }
    config.roleSettings.answerMode = 'router'
    expect(modelRolesErrors(config.roleSettings, config)).toEqual(['Laya supports a shortlist of at most eight talking models.'])
  })
})

describe('planModelRole', () => {
  it('blocks on a structural error before looking at anything else', () => {
    const config = configured()
    config.roleSettings.roles.answer.timeoutMs = 1
    const plan = planModelRole({ configuration: config, settings: config.roleSettings, role: 'answer' })
    expect(plan).toMatchObject({ status: 'blocked', reason: 'Talking / answers: timeout must be 100–600,000 milliseconds.', eligibleModelIds: [] })
  })

  it('plans the configured answer model without contacting anything', () => {
    const config = configured()
    expect(planModelRole({ configuration: config, settings: config.roleSettings, role: 'answer' })).toEqual({
      mode: 'preview',
      execution: 'not-wired',
      role: 'answer',
      status: 'planned',
      reason: 'Configured model proposed; capabilities and dispatch authorization still require verification.',
      selectedModelId: 'openrouter-sonnet',
      providerId: 'openrouter',
      route: 'anthropic/claude-sonnet-4',
      timeoutMs: 30000,
      basis: 'manual-lock',
      eligibleModelIds: ['openrouter-sonnet'],
      memoryAccessAllowed: true,
      capabilityEvidence: 'owner-assigned-unverified',
      dispatchAuthorization: 'not-evaluated',
    })
  })

  it('reports a disabled role and refuses an unsupported failure category', () => {
    const config = configured()
    expect(planModelRole({ configuration: config, settings: config.roleSettings, role: 'reviewer' })).toMatchObject({ status: 'disabled', reason: 'This role is disabled.' })
    expect(planModelRole({ configuration: config, settings: config.roleSettings, role: 'answer', failure: 'crash' as never })).toMatchObject({
      status: 'blocked',
      reason: 'Use a supported failure category; no retry was proposed.',
    })
  })

  it('reports memory being off and refuses helper roles when the harness is disabled', () => {
    const config = configured()
    config.roleSettings.roles.reviewer = { ...config.roleSettings.roles.reviewer, enabled: true, modelId: 'openai-gpt', eligibleModelIds: ['openai-gpt'] }
    const privacy = { memoryDisabled: true, harnessDisabled: true }
    expect(planModelRole({ configuration: config, settings: config.roleSettings, role: 'answer', privacy }).memoryAccessAllowed).toBe(false)
    expect(planModelRole({ configuration: config, settings: config.roleSettings, role: 'reviewer', privacy })).toMatchObject({ status: 'blocked', reason: 'No harness disables helper model roles.' })
  })

  it('honours an owner override and never substitutes for a locked answer', () => {
    const config = configured()
    config.roleSettings.roles.answer.eligibleModelIds = ['openrouter-sonnet', 'openai-gpt']
    expect(planModelRole({ configuration: config, settings: config.roleSettings, role: 'answer', ownerAnswerOverride: 'openai-gpt' })).toMatchObject({ status: 'planned', selectedModelId: 'openai-gpt', basis: 'owner-override' })
    const failed = planModelRole({ configuration: config, settings: config.roleSettings, role: 'answer', failure: 'timeout' })
    expect(failed).toMatchObject({ status: 'blocked', reason: 'The manually locked answer model failed or is unavailable. Review the choice; no substitute was selected.' })
    expect(planModelRole({ configuration: config, settings: config.roleSettings, role: 'answer', ownerAnswerOverride: 'anthropic-sonnet' }).status).toBe('blocked')
  })

  it('narrows eligibility by attempts and server restrictions', () => {
    const config = configured()
    config.roleSettings.roles.answer.eligibleModelIds = ['openrouter-sonnet', 'openai-gpt']
    const byProvider = planModelRole({ configuration: config, settings: config.roleSettings, role: 'answer', allowedProviderIds: ['openai'], ownerAnswerOverride: 'openai-gpt' })
    expect(byProvider.eligibleModelIds).toEqual(['openai-gpt'])
    const byModel = planModelRole({ configuration: config, settings: config.roleSettings, role: 'answer', allowedModelIds: ['openrouter-sonnet'] })
    expect(byModel.eligibleModelIds).toEqual(['openrouter-sonnet'])
    const attempted = planModelRole({ configuration: config, settings: config.roleSettings, role: 'answer', attemptedModelIds: ['openrouter-sonnet'] })
    expect(attempted).toMatchObject({ status: 'blocked', eligibleModelIds: ['openai-gpt'] })
  })

  it('waits for the router, then takes its choice if the owner allowed it', () => {
    const config = configured()
    config.providers.push({ id: 'decisions', name: 'Decisions', endpoint: '', apiKeyDraft: '', enabled: true })
    config.models.push({ id: 'classifier', providerId: 'decisions', name: 'Classifier', route: 'model-routing', enabled: true })
    const { roles } = config.roleSettings
    roles.answer.eligibleModelIds = ['openrouter-sonnet', 'openai-gpt']
    roles.routing = { ...roles.routing, enabled: true, eligibleModelIds: ['classifier'], modelId: 'classifier' }
    config.roleSettings.answerMode = 'router'
    const plan = (extra: object = {}) => planModelRole({ configuration: config, settings: config.roleSettings, role: 'answer', ...extra })
    expect(plan()).toMatchObject({ status: 'needs-routing', reason: 'Await a typed decision from the configured routing role. No routing model has run.' })
    expect(plan({ routedAnswerModelId: 'openai-gpt' })).toMatchObject({ status: 'planned', selectedModelId: 'openai-gpt', basis: 'router-choice' })
    expect(plan({ routedAnswerModelId: 'anthropic-sonnet' })).toMatchObject({ status: 'blocked', reason: 'The routing result is outside the owner-assigned answer choices.' })
    expect(plan({ privacy: { memoryDisabled: false, harnessDisabled: true } })).toMatchObject({ status: 'blocked', reason: 'No harness disables answer routing. Choose a manual answer model.' })
    expect(plan({ failure: 'unavailable' })).toMatchObject({ status: 'blocked', reason: 'The selected model failed or is unavailable. This role has no distinct permitted backup.' })
  })

  it('proposes the first backup that is still available after a failure', () => {
    const config = configured()
    const reviewer = config.roleSettings.roles.reviewer
    Object.assign(reviewer, { enabled: true, eligibleModelIds: ['openrouter-sonnet', 'openrouter-gpt', 'openai-gpt'], modelId: 'openrouter-sonnet', failure: 'fallback', fallbackModelIds: ['openrouter-gpt', 'openai-gpt'] })
    const plan = planModelRole({ configuration: config, settings: config.roleSettings, role: 'reviewer', failure: 'timeout', attemptedModelIds: ['openrouter-gpt'] })
    expect(plan).toMatchObject({
      status: 'planned',
      selectedModelId: 'openai-gpt',
      basis: 'fallback',
      reason: 'Backup model proposed after failure or unavailability; no provider was contacted.',
    })
    const noneLeft = planModelRole({ configuration: config, settings: config.roleSettings, role: 'reviewer', failure: 'timeout', allowedModelIds: ['openrouter-sonnet'] })
    expect(noneLeft).toMatchObject({ status: 'blocked', reason: 'No eligible configured model is available under the current restrictions.' })
  })
})

describe('role setting updates', () => {
  it('withAnswerModel locks one model for every chat without mutating the input', () => {
    const config = configured()
    const next = withAnswerModel(config, 'openai-gpt')
    expect(next.defaultModelId).toBe('openai-gpt')
    expect(next.roleSettings.answerMode).toBe('manual')
    expect(next.roleSettings.roles.answer).toMatchObject({ enabled: true, modelId: 'openai-gpt', eligibleModelIds: ['openrouter-sonnet', 'openai-gpt'], failure: 'stop', fallbackModelIds: [] })
    expect(config.defaultModelId).toBe('openrouter-sonnet')
    expect(withAnswerModel(next, 'openai-gpt').roleSettings.roles.answer.eligibleModelIds).toEqual(['openrouter-sonnet', 'openai-gpt'])
  })

  it('withIdeas turns the ideas pass on with a model, or off', () => {
    const config = configured()
    const on = withIdeas(config, 'openai-gpt')
    expect(on.roleSettings.roles.proposals).toMatchObject({ enabled: true, modelId: 'openai-gpt', eligibleModelIds: ['openai-gpt'], failure: 'stop' })
    const again = withIdeas(on, 'openai-gpt')
    expect(again.roleSettings.roles.proposals.eligibleModelIds).toEqual(['openai-gpt'])
    const off = withIdeas(on, null)
    expect(off.roleSettings.roles.proposals).toMatchObject({ enabled: false, modelId: 'openai-gpt', eligibleModelIds: ['openai-gpt'] })
    expect(config.roleSettings.roles.proposals.enabled).toBe(false)
  })

  it('sideJobChoice reads off, auto or a model', () => {
    expect(sideJobChoice(undefined)).toBe('__off__')
    expect(sideJobChoice('nope')).toBe('__off__')
    expect(sideJobChoice({ enabled: false, modelId: 'x', followAnswer: true })).toBe('__off__')
    expect(sideJobChoice({ enabled: true, modelId: 'x', followAnswer: true })).toBe('__auto__')
    expect(sideJobChoice({ enabled: true, modelId: 'x', followAnswer: false })).toBe('x')
    expect(sideJobChoice({ enabled: true, modelId: null, followAnswer: false })).toBe('__off__')
  })

  it('withSideJob sets a model, follows the answer, or switches off', () => {
    const config = withAnswerModel(configured(), 'openrouter-gpt')
    const answer = config.roleSettings.roles.answer
    answer.failure = 'fallback'
    answer.fallbackModelIds = ['openai-gpt', 'openrouter-gpt']
    const model = withSideJob(config, 'summarization', 'anthropic-sonnet')
    expect(model.roleSettings.roles.summarization).toMatchObject({ enabled: true, followAnswer: false, modelId: 'anthropic-sonnet', eligibleModelIds: ['anthropic-sonnet'], failure: 'stop', fallbackModelIds: [] })
    const auto = withSideJob(config, 'summarization', '__auto__')
    expect(auto.roleSettings.roles.summarization).toMatchObject({
      enabled: true,
      followAnswer: true,
      modelId: 'openrouter-gpt',
      eligibleModelIds: ['openrouter-gpt', 'openai-gpt'],
      failure: 'fallback',
      fallbackModelIds: ['openai-gpt', 'openrouter-gpt'],
    })
    const off = withSideJob(auto, 'summarization', '__off__')
    expect(off.roleSettings.roles.summarization).toMatchObject({ enabled: false, followAnswer: false, modelId: 'openrouter-gpt' })
    const fresh = withSideJob(config, 'brand-new', 'openai-gpt')
    expect((fresh.roleSettings.roles as Record<string, { timeoutMs: number }>)['brand-new'].timeoutMs).toBe(120000)
  })

  it('withSideJob auto with no answer model leaves nothing eligible and stops on failure', () => {
    const config = configured()
    config.roleSettings.roles.answer = { ...config.roleSettings.roles.answer, modelId: null, fallbackModelIds: [] }
    const auto = withSideJob(config, 'routing', '__auto__')
    expect(auto.roleSettings.roles.routing).toMatchObject({ enabled: true, followAnswer: true, modelId: null, eligibleModelIds: [], failure: 'stop' })
  })

  it('followAnswerRoles refreshes only roles that follow the answer', () => {
    const config = withAnswerModel(configured(), 'openai-gpt')
    const followed = withSideJob(config, 'routing', '__auto__')
    followed.roleSettings.roles.routing.followAnswer = true
    const independent = withSideJob(followed, 'summarization', 'anthropic-sonnet')
    const switched = withAnswerModel(independent, 'openrouter-gpt')
    const result = followAnswerRoles(switched)
    expect(result.roleSettings.roles.routing).toMatchObject({ modelId: 'openrouter-gpt', eligibleModelIds: ['openrouter-gpt'], failure: 'stop', fallbackModelIds: [] })
    expect(result.roleSettings.roles.summarization.modelId).toBe('anthropic-sonnet')
    expect(result.roleSettings.roles.answer).toBe(switched.roleSettings.roles.answer)
    switched.roleSettings.roles.answer.modelId = null
    expect(followAnswerRoles(switched).roleSettings.roles.routing.eligibleModelIds).toEqual([])
  })
})
