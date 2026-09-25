const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { webcrypto } = require('node:crypto')
globalThis.crypto ??= webcrypto
const root = path.resolve(__dirname, '..')
const cache = new Map()
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports
  const source = fs.readFileSync(path.join(root, relative), 'utf8').replaceAll('import.meta.env', '({})')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const module = { exports: {} }
  cache.set(relative, module)
  new Function('require', 'module', 'exports', compiled.outputText)(request => {
    if (request === 'zod') return require('zod')
    assert.ok(request.startsWith('.'), `Unexpected dependency: ${request}`)
    return load(`${path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))}.ts`)
  }, module, module.exports)
  return module.exports
}
async function main() {
  const { createModelsConfiguration, validateModelsConfiguration } = load('src/lib/api/model-catalogue.ts')
  const { createModelRoles, modelRolesErrors, planModelRole, withAnswerModel } = load('src/lib/api/model-roles.ts')
  const config = createModelsConfiguration()
  const settings = createModelRoles(config)
  const primary = config.defaultModelId
  const secondary = config.models.find(model => model.id !== primary).id
  const crossProvider = config.models.find(model => model.providerId !== config.models.find(item => item.id === primary).providerId).id
  assert.deepEqual(modelRolesErrors(settings, config), [])
  // Choosing the answer model moves the Answer role (what Pi uses) and the default together.
  const routed = { ...config, roleSettings: { ...settings, answerMode: 'router', roles: { ...settings.roles, answer: { ...settings.roles.answer, failure: 'fallback', fallbackModelId: primary, eligibleModelIds: [primary] } } } }
  const chosen = withAnswerModel(routed, secondary)
  assert.equal(chosen.defaultModelId, secondary)
  assert.equal(chosen.roleSettings.answerMode, 'manual')
  assert.deepEqual(chosen.roleSettings.roles.answer, { ...routed.roleSettings.roles.answer, enabled: true, modelId: secondary, eligibleModelIds: [primary, secondary], failure: 'stop', fallbackModelId: null })
  assert.equal(withAnswerModel(chosen, secondary).roleSettings.roles.answer.eligibleModelIds.length, 2, 'Choosing again does not duplicate eligibility')
  assert.deepEqual(modelRolesErrors(chosen.roleSettings, chosen), [])
  assert.equal(routed.roleSettings.answerMode, 'router', 'The input is not mutated')
  assert.equal(settings.answerMode, 'manual')
  assert.equal(settings.roles.answer.modelId, primary)
  for (const role of ['routing', 'context-selection', 'summarization']) assert.equal(settings.roles[role].enabled, false, 'Helpers are never enabled by default')
  let plan = planModelRole({ configuration: config, settings, role: 'answer' })
  assert.equal(plan.selectedModelId, primary)
  assert.equal(plan.basis, 'manual-lock')
  assert.equal(plan.execution, 'not-wired')
  assert.equal(plan.capabilityEvidence, 'owner-assigned-unverified')
  assert.equal(plan.dispatchAuthorization, 'not-evaluated')
  assert.equal(planModelRole({ configuration: config, settings, role: 'summarization' }).status, 'disabled')
  assert.equal(planModelRole({ configuration: config, settings, role: 'answer', failure: 'timeout' }).status, 'blocked')
  assert.equal(planModelRole({ configuration: { ...config, defaultModelId: secondary }, settings, role: 'answer' }).selectedModelId, primary, 'Changing the workspace default does not rewrite a role lock')
  const fallback = { enabled: true, eligibleModelIds: [primary, crossProvider], modelId: primary, timeoutMs: 4000, failure: 'fallback', fallbackModelId: crossProvider }
  const helperSettings = structuredClone(settings)
  helperSettings.roles.summarization = structuredClone(fallback)
  assert.deepEqual(modelRolesErrors(helperSettings, config), [])
  plan = planModelRole({ configuration: config, settings: helperSettings, role: 'summarization', failure: 'timeout' })
  assert.equal(plan.selectedModelId, crossProvider)
  assert.equal(plan.basis, 'fallback')
  assert.equal(plan.timeoutMs, 4000)
  assert.equal(planModelRole({ configuration: config, settings: helperSettings, role: 'summarization', failure: 'timeout', attemptedModelIds: [primary, crossProvider] }).status, 'blocked', 'Exhausted primary/fallback attempts cannot loop')
  assert.equal(planModelRole({ configuration: config, settings: helperSettings, role: 'summarization', failure: 'invalid-failure' }).status, 'blocked')
  const providerId = config.models.find(model => model.id === crossProvider).providerId
  plan = planModelRole({ configuration: config, settings: helperSettings, role: 'summarization', allowedProviderIds: [providerId] })
  assert.equal(plan.selectedModelId, crossProvider, 'Runtime privacy/provider filters never widen the owner allowlist')
  assert.equal(planModelRole({ configuration: config, settings: helperSettings, role: 'summarization', allowedModelIds: [] }).status, 'blocked')
  for (const invalid of [{ fallbackModelId: primary }, { fallbackModelId: 'unknown' }, { eligibleModelIds: [primary] }, { timeoutMs: 0 }, { timeoutMs: 120001 }, { timeoutMs: NaN }, { failure: 'retry-forever' }, { failure: 'stop' }, { eligibleModelIds: [primary, primary, crossProvider] }]) {
    const broken = structuredClone(helperSettings)
    Object.assign(broken.roles.summarization, invalid)
    assert.ok(modelRolesErrors(broken, config).length, JSON.stringify(invalid))
    assert.equal(planModelRole({ configuration: config, settings: broken, role: 'summarization' }).status, 'blocked')
  }
  const badLock = structuredClone(helperSettings)
  badLock.roles.answer = structuredClone(fallback)
  assert.ok(modelRolesErrors(badLock, config).some(error => error.includes('manual answer lock')))
  const runtimeDown = structuredClone(config)
  runtimeDown.providers.find(provider => provider.id === config.models.find(model => model.id === primary).providerId).enabled = false
  assert.ok(modelRolesErrors(helperSettings, runtimeDown).some(error => error.includes('enabled primary')))
  assert.equal(planModelRole({ configuration: runtimeDown, settings: helperSettings, role: 'summarization' }).selectedModelId, crossProvider)
  assert.equal(planModelRole({ configuration: runtimeDown, settings, role: 'answer' }).status, 'blocked', 'Locked answer never silently substitutes another enabled provider')
  for (const memoryDisabled of [false, true]) {
    plan = planModelRole({ configuration: config, settings: helperSettings, role: 'summarization', privacy: { memoryDisabled, harnessDisabled: false } })
    assert.equal(plan.status, 'planned')
    assert.equal(plan.memoryAccessAllowed, !memoryDisabled)
    assert.equal(planModelRole({ configuration: config, settings: helperSettings, role: 'summarization', privacy: { memoryDisabled, harnessDisabled: true } }).status, 'blocked')
    assert.equal(planModelRole({ configuration: config, settings, role: 'answer', privacy: { memoryDisabled, harnessDisabled: true } }).selectedModelId, primary)
  }
  const routerSettings = structuredClone(helperSettings)
  routerSettings.answerMode = 'router'
  assert.ok(modelRolesErrors(routerSettings, config).some(error => error.includes('routing decision')))
  routerSettings.roles.routing = { ...structuredClone(fallback), failure: 'stop', fallbackModelId: null }
  routerSettings.roles.answer.eligibleModelIds.push(secondary)
  assert.deepEqual(modelRolesErrors(routerSettings, config), [])
  assert.equal(planModelRole({ configuration: config, settings: routerSettings, role: 'answer' }).status, 'needs-routing')
  assert.equal(planModelRole({ configuration: config, settings: routerSettings, role: 'answer', routedAnswerModelId: secondary }).selectedModelId, secondary)
  assert.equal(planModelRole({ configuration: config, settings: routerSettings, role: 'answer', routedAnswerModelId: crossProvider }).status, 'blocked')
  plan = planModelRole({ configuration: config, settings: routerSettings, role: 'answer', ownerAnswerOverride: primary, routedAnswerModelId: secondary, privacy: { memoryDisabled: true, harnessDisabled: true } })
  assert.equal(plan.selectedModelId, primary)
  assert.equal(plan.basis, 'owner-override')
  assert.equal(planModelRole({ configuration: config, settings: routerSettings, role: 'answer', privacy: { memoryDisabled: false, harnessDisabled: true } }).status, 'blocked')
  const sentinel = structuredClone(config)
  sentinel.providers[0].apiKeyDraft = 'SENTINEL_DO_NOT_COPY'
  assert.ok(!JSON.stringify(planModelRole({ configuration: sentinel, settings, role: 'answer' })).includes('SENTINEL_DO_NOT_COPY'))
  assert.equal(validateModelsConfiguration({ ...config, roleSettings: helperSettings }), null)
  assert.match(validateModelsConfiguration({ ...config, roleSettings: badLock }), /manual answer lock/)
  const { createFixtureClient } = load('src/lib/api/fixture-adapter.ts')
  const client = createFixtureClient()
  const saved = await client.saveModelsConfiguration({ ...config, roleSettings: helperSettings })
  assert.deepEqual(saved.roleSettings, helperSettings, 'Existing Models API preserves role settings without fixture changes')
  saved.roleSettings.roles.summarization.modelId = 'external mutation'
  assert.equal((await client.load()).modelsConfiguration.roleSettings.roles.summarization.modelId, primary)
  await assert.rejects(client.saveModelsConfiguration({ ...config, roleSettings: badLock }), /manual answer lock/)
  assert.equal((await client.load()).modelsConfiguration.roleSettings.roles.summarization.modelId, primary)
  for (const disable of ['model', 'provider']) {
    const isolated = createFixtureClient()
    const snapshot = await isolated.load()
    const sessionId = snapshot.companionSessionId
    const selected = snapshot.modelsConfiguration.models.find(model => model.id === crossProvider)
    await isolated.updateConversation(sessionId, { modelId: selected.id })
    const changed = structuredClone(snapshot.modelsConfiguration)
    if (disable === 'model') changed.models.find(model => model.id === selected.id).enabled = false
    else changed.providers.find(provider => provider.id === selected.providerId).enabled = false
    await isolated.saveModelsConfiguration(changed)
    const after = await isolated.load()
    assert.equal(after.conversations[sessionId].modelId, selected.id, `Disabling a ${disable} must retain the explicit conversation choice`)
    const count = after.conversations[sessionId].messages.length
    await assert.rejects(isolated.streamReply(sessionId, { signal: new AbortController().signal }, () => {}), /enabled model/)
    assert.equal((await isolated.load()).conversations[sessionId].messages.length, count, 'Blocked route creates no replacement-model response')
  }
  console.log('Model role checks passed: explicit eligibility, manual lock, typed routing choices, timeout/provider fallback, privacy separation, no secret copying and isolated Models API round-trip.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
