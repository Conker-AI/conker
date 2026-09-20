const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const cache = new Map()
globalThis.crypto ??= require('node:crypto').webcrypto
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports
  const module = { exports: {} }
  cache.set(relative, module)
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8').replaceAll('import.meta.env', '({})'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(request => {
    if (request === 'zod') return require('zod')
    assert.ok(request.startsWith('.'), `Unexpected dependency: ${request}`)
    return load(`${path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))}.ts`)
  }, module, module.exports)
  return module.exports
}
const { createAgentCollaborationPreviewClient, collaborationReferences } = load('src/lib/api/agent-collaboration-preview.ts')
const at = '2026-09-20T10:00:00Z'
const configuration = { name: 'Researcher', role: 'Research', instructions: 'Cite sources.', modelId: 'model', toolIds: ['search'], memory: { scope: 'selected', memoryIds: ['preference'] } }
const templateInput = { name: 'Source-backed research', description: 'Prepare research configurations.', agent: configuration }
const budget = { maxTurns: 4, maxTokens: 2000, maxCostCents: 0 }
function teamInput() {
  return {
    name: 'Research and review', objective: 'Prepare a report for owner review.',
    roles: [
      { id: 'research', name: 'Researcher', agentId: 'researcher', instructions: 'Find relevant evidence.', toolIds: ['search'], memory: { scope: 'selected', memoryIds: ['preference'] }, context: { mode: 'selected', sourceIds: ['source'] }, budget: { ...budget } },
      { id: 'review', name: 'Reviewer', agentId: 'reviewer', instructions: 'Check claims against citations.', toolIds: ['read'], memory: { scope: 'none', memoryIds: [] }, context: { mode: 'task_only', sourceIds: [] }, budget: { ...budget } },
    ],
    handoffs: [{ id: 'review-evidence', fromRoleId: 'research', toRoleId: 'review', condition: 'Research has citations ready for review.', payload: 'result_and_citations', maxTransfers: 1 }],
    budget: { maxTurns: 8, maxTokens: 4000, maxCostCents: 0, maxHandoffs: 1 },
  }
}
function fixture() {
  let state = {
    templates: [], teams: [], agentPreparations: [], teamPreparations: [],
    agents: [{ id: 'researcher', name: 'Researcher', configuration: structuredClone(configuration), version: 3 }, { id: 'reviewer', name: 'Reviewer', version: 1, configuration: { ...structuredClone(configuration), name: 'Reviewer', toolIds: ['read'], memory: { scope: 'none', memoryIds: [] } } }],
    companionName: 'Conker', modelIds: ['model'], toolIds: ['search', 'read'], memoryIds: ['preference', 'private'], contextSourceIds: ['source'], references: [],
  }
  let id = 0, writes = 0
  const client = createAgentCollaborationPreviewClient({ getSnapshot: () => state, setData: data => { state = { ...state, ...data }; writes++ }, now: () => at, newId: () => String(++id) })
  return { client, state: () => state, writes: () => writes }
}
async function main() {
  const { client, state, writes } = fixture()
  for (const input of [
    { ...templateInput, name: ' ' },
    { ...templateInput, agent: { ...configuration, grants: ['all'] } },
    { ...templateInput, agent: { ...configuration, toolIds: ['missing'] } },
    { ...templateInput, agent: { ...configuration, modelId: 'disabled' } },
    { ...templateInput, agent: { ...configuration, memory: { scope: 'none', memoryIds: ['private'] } } },
  ]) await assert.rejects(client.createTemplate(input))
  assert.equal(writes(), 0)
  let template = await client.createTemplate(templateInput)
  await assert.rejects(client.instantiateTemplate(template.id, 1, { name: 'New researcher' }, template.revision), /published template version/)
  const version1 = await client.publishTemplate(template.id, template.revision)
  template = (await client.list()).templates[0]
  await assert.rejects(client.updateTemplate(template.id, templateInput, template.revision - 1), /changed/)
  await assert.rejects(client.publishTemplate(template.id, template.revision), /already published/)
  await assert.rejects(client.instantiateTemplate(template.id, 1, { name: 'Conker' }, template.revision), /unique specialist/)
  await assert.rejects(client.instantiateTemplate(template.id, 1, { name: 'researcher' }, template.revision), /unique specialist/)
  await assert.rejects(client.instantiateTemplate(template.id, 1, { name: 'New', overrides: { grants: ['all'] } }, template.revision))
  const agentsBefore = JSON.stringify(state().agents)
  const prepared = await client.instantiateTemplate(template.id, 1, { name: 'New researcher', overrides: { toolIds: ['read'], memory: { scope: 'none', memoryIds: [] }, modelId: null } }, template.revision)
  assert.deepEqual(prepared.configuration.toolIds, ['read'], 'Overrides replace; they never union tool selections')
  assert.deepEqual(prepared.configuration.memory, { scope: 'none', memoryIds: [] })
  assert.equal(prepared.configuration.modelId, null)
  assert.equal(prepared.status, 'prepared')
  assert.equal(prepared.authority, 'none')
  assert.equal(prepared.provenance, 'preview')
  assert.equal(JSON.stringify(state().agents), agentsBefore, 'Preparing a payload never creates agents or grants')
  version1.definition.agent.instructions = 'External mutation'
  prepared.configuration.instructions = 'External mutation'
  const changedInput = { ...structuredClone(templateInput), agent: { ...structuredClone(configuration), instructions: 'A newer owner instruction.' } }
  template = await client.updateTemplate(template.id, changedInput, template.revision)
  const version2 = await client.publishTemplate(template.id, template.revision)
  template = (await client.list()).templates[0]
  assert.equal(version2.version, 2)
  assert.equal(template.versions[0].definition.agent.instructions, 'Cite sources.')
  assert.equal((await client.list()).agentPreparations[0].configuration.instructions, 'Cite sources.')
  const oldVersion = await client.instantiateTemplate(template.id, 1, { name: 'Older configuration' }, template.revision)
  assert.equal(oldVersion.configuration.instructions, 'Cite sources.', 'Explicit old version never silently upgrades')
  state().modelIds.length = 0
  await assert.rejects(client.instantiateTemplate(template.id, 1, { name: 'Unavailable model' }, template.revision), /enabled model/)
  state().modelIds.push('model')
  template = await client.archiveTemplate(template.id, true, template.revision)
  await assert.rejects(client.instantiateTemplate(template.id, 1, { name: 'Archived' }, template.revision), /Restore/)
  await assert.rejects(client.removeTemplate(template.id, template.revision), /Archive/)
  template = await client.archiveTemplate(template.id, false, template.revision)
  assert.equal(template.versions.length, 2)

  const invalidTeams = [
    value => { value.roles[0].toolIds = ['read'] },
    value => { value.roles[1].memory = { scope: 'selected', memoryIds: ['preference'] } },
    value => { value.roles[0].memory.memoryIds = ['private'] },
    value => { value.roles[0].context.sourceIds = ['unknown'] },
    value => { value.roles[1].context.sourceIds = ['source'] },
    value => { value.roles[0].agentId = 'absent' },
    value => { value.roles[1].id = value.roles[0].id },
    value => { value.roles[1].name = value.roles[0].name },
    value => { value.roles[0].budget.maxCostCents = 1 },
    value => { value.budget.maxTokens = 1 },
    value => { value.budget.maxTurns = 1 },
    value => { value.handoffs[0].toRoleId = 'research' },
    value => { value.handoffs[0].toRoleId = 'absent' },
    value => { value.handoffs[0].maxTransfers = 2 },
    value => { value.handoffs.push({ ...value.handoffs[0], id: 'duplicate' }); value.budget.maxHandoffs = 2 },
    value => { value.roles[0].grants = ['all'] },
  ]
  const beforeInvalid = writes()
  for (const change of invalidTeams) { const value = teamInput(); change(value); await assert.rejects(client.createTeam(value)) }
  assert.equal(writes(), beforeInvalid, 'Invalid teams do not partially commit roles or handoffs')
  state().agents[0].archivedAt = at
  await assert.rejects(client.createTeam(teamInput()), /Configure an active agent/)
  delete state().agents[0].archivedAt
  const savedConfiguration = state().agents[0].configuration
  delete state().agents[0].configuration
  await assert.rejects(client.createTeam(teamInput()), /Configure an active agent/)
  state().agents[0].configuration = savedConfiguration
  let team = await client.createTeam(teamInput())
  const preparation = await client.prepareTeam(team.id, team.revision)
  assert.equal(preparation.status, 'prepared')
  assert.equal(preparation.authority, 'none')
  assert.equal(preparation.agents[0].agentVersion, 3)
  assert.deepEqual(preparation.definition.roles.map(role => role.toolIds), [['search'], ['read']], 'Role permissions never union across teammates')
  const beforeEdit = structuredClone(preparation)
  team = await client.updateTeam(team.id, { ...teamInput(), objective: 'A revised outcome.' }, team.revision)
  await assert.rejects(client.prepareTeam(team.id, team.revision - 1), /changed/)
  state().agents[0].configuration.instructions = 'Later agent edits'
  state().agents[0].configuration.toolIds = []
  await assert.rejects(client.prepareTeam(team.id, team.revision), /tools selected/)
  assert.deepEqual((await client.list()).teamPreparations[0], beforeEdit, 'Prepared snapshots survive both team and agent edits unchanged')
  preparation.definition.roles[0].toolIds.push('read')
  assert.deepEqual((await client.list()).teamPreparations[0].definition.roles[0].toolIds, ['search'])
  state().agents[0].configuration.toolIds = ['search']
  team = await client.archiveTeam(team.id, true, team.revision)
  await assert.rejects(client.prepareTeam(team.id, team.revision), /Restore/)
  await assert.rejects(client.removeTeam(team.id, team.revision), /Archive/)
  assert.ok(collaborationReferences(await client.list(), 'agent', 'researcher').includes('prepared team configurations'))
  assert.ok(collaborationReferences(await client.list(), 'tool', 'search').includes('published templates'))
  assert.ok(collaborationReferences(await client.list(), 'memory', 'preference').includes('team definitions'))
  assert.ok(collaborationReferences(await client.list(), 'context', 'source').includes('prepared team configurations'))
  assert.ok(collaborationReferences(await client.list(), 'template', template.id).includes('prepared agent configurations'))

  const unusedTemplate = await client.createTemplate({ ...templateInput, name: 'Unused draft' })
  state().references.push({ kind: 'template', id: unusedTemplate.id, label: 'linked project' })
  await assert.rejects(client.removeTemplate(unusedTemplate.id, unusedTemplate.revision), /Archive/)
  state().references = []
  await client.removeTemplate(unusedTemplate.id, unusedTemplate.revision)
  const unusedTeam = await client.createTeam({ ...teamInput(), name: 'Unused team' })
  await client.removeTeam(unusedTeam.id, unusedTeam.revision)
  const another = fixture()
  assert.deepEqual(await another.client.list(), { templates: [], teams: [], agentPreparations: [], teamPreparations: [] }, 'Client state and history are isolated')
  assert.equal(JSON.stringify(another.state().agents), agentsBefore)
  const { createFixtureClient } = load('src/lib/api/fixture-adapter.ts')
  for (const removeFirst of [true, false]) {
    const concurrent = createFixtureClient()
    await concurrent.toolWorkspace.publish('notes')
    const candidate = { ...templateInput, agent: { ...configuration, name: 'Concurrent owner', modelId: null, toolIds: ['notes'], memory: { scope: 'none', memoryIds: [] } } }
    const remove = () => concurrent.toolWorkspace.remove('notes')
    const select = () => concurrent.collaboration.createTemplate(candidate)
    const outcomes = await Promise.allSettled((removeFirst ? [remove, select] : [select, remove]).map(action => action()))
    assert.deepEqual(outcomes.map(result => result.status), ['fulfilled', 'rejected'], 'Removal and new template references are atomic in both invocation orders')
    const current = await concurrent.load()
    assert.equal(current.collaboration.templates.length, removeFirst ? 0 : 1)
    assert.equal(current.tools.some(tool => tool.id === 'notes'), !removeFirst)
    const recovery = await concurrent.collaboration.createTemplate({ ...candidate, name: 'Queue recovery', agent: { ...candidate.agent, toolIds: [] } })
    assert.ok(recovery.id, 'Rejected queued operation does not poison future writes')
  }
  const integrated = createFixtureClient()
  await integrated.toolWorkspace.publish('calendar')
  const initial = await integrated.load()
  const draft = { name: 'Integration template', description: 'Owner review before creation.', agent: { name: 'Integration researcher', role: 'Research', instructions: 'Cite evidence.', modelId: null, toolIds: [initial.tools[0].id], memory: { scope: 'selected', memoryIds: [initial.memories[0].id] } } }
  await integrated.toolWorkspace.remove('notes')
  await assert.rejects(integrated.collaboration.createTemplate({ ...draft, agent: { ...draft.agent, toolIds: ['notes'] } }), /existing tools/)
  const fresh = await integrated.toolWorkspace.create('Current workflow')
  fresh.draft.agentVisible = true
  await integrated.toolWorkspace.save(fresh.draft)
  const freshInput = { ...draft, name: 'Fresh workflow template', agent: { ...draft.agent, toolIds: [fresh.id] } }
  await assert.rejects(integrated.collaboration.createTemplate(freshInput), /existing tools/)
  await integrated.toolWorkspace.publish(fresh.id)
  const scopedAgent = await integrated.createAgent({ ...freshInput.agent, name: 'Current tool owner', memory: { scope: 'none', memoryIds: [] } })
  const scopedTeamInput = { name: 'Current tool team', objective: 'Use eligible publication.', budget: { ...budget, maxHandoffs: 0 }, roles: [{ id: 'owner', name: 'Owner', agentId: scopedAgent.id, instructions: 'Review result.', toolIds: [fresh.id], memory: { scope: 'none', memoryIds: [] }, context: { mode: 'task_only', sourceIds: [] }, budget }], handoffs: [] }
  const scopedTeam = await integrated.collaboration.createTeam(scopedTeamInput)
  await integrated.collaboration.prepareTeam(scopedTeam.id, scopedTeam.revision)
  let freshTemplate = await integrated.collaboration.createTemplate(freshInput)
  await integrated.collaboration.publishTemplate(freshTemplate.id, freshTemplate.revision)
  freshTemplate = (await integrated.collaboration.list()).templates.find(item => item.id === freshTemplate.id)
  fresh.draft.name = 'Unpublished renamed workflow'
  fresh.draft.agentVisible = false
  await integrated.toolWorkspace.save(fresh.draft)
  assert.equal((await integrated.load()).tools.find(tool => tool.id === fresh.id).name, 'Current workflow', 'Unpublished edits cannot alter catalogue')
  await integrated.toolWorkspace.publish(fresh.id)
  await assert.rejects(integrated.collaboration.prepareTeam(scopedTeam.id, scopedTeam.revision), /existing tools/)
  await assert.rejects(integrated.collaboration.updateTeam(scopedTeam.id, scopedTeamInput, scopedTeam.revision), /existing tools/)
  await assert.rejects(integrated.collaboration.createTeam({ ...scopedTeamInput, name: 'Hidden tool team' }), /existing tools/)
  await assert.rejects(integrated.collaboration.instantiateTemplate(freshTemplate.id, 1, { name: 'Hidden capability' }, freshTemplate.revision), /existing tools/)
  await assert.rejects(integrated.collaboration.updateTemplate(freshTemplate.id, freshInput, freshTemplate.revision), /existing tools/)
  await assert.rejects(integrated.collaboration.publishTemplate(freshTemplate.id, freshTemplate.revision), /existing tools/)
  assert.equal((await integrated.load()).tools.some(tool => tool.id === fresh.id), false, 'Latest hidden publication is not selectable')
  await assert.rejects(integrated.toolWorkspace.remove(fresh.id), /agent configurations/)
  await integrated.saveAgent(scopedAgent.id, { ...scopedAgent.configuration, toolIds: [] })
  await assert.rejects(integrated.toolWorkspace.remove(fresh.id), /configuration history/)
  const integratedTemplate = await integrated.collaboration.createTemplate(draft)
  await integrated.collaboration.publishTemplate(integratedTemplate.id, integratedTemplate.revision)
  const publishedRecord = (await integrated.load()).collaboration.templates.find(item => item.id === integratedTemplate.id)
  await assert.rejects(integrated.deleteMemory(initial.memories[0].id), /template configuration history/)
  await assert.rejects(integrated.toolWorkspace.remove(initial.tools[0].id), /template configuration history/)
  const preparedAgent = await integrated.collaboration.instantiateTemplate(publishedRecord.id, 1, { name: 'Reviewed agent', overrides: { toolIds: [], memory: { scope: 'none', memoryIds: [] } } }, publishedRecord.revision)
  assert.equal((await integrated.load()).agents.length, initial.agents.length + 1)
  const created = await integrated.createAgent(preparedAgent.configuration)
  assert.equal(created.grants, 0)
  assert.deepEqual(created.configuration.toolIds, [])
  const configuredTeam = await integrated.collaboration.createTeam({ name: 'Reviewed team', objective: 'Prepare a scoped configuration.', budget: { ...budget, maxHandoffs: 0 }, roles: [{ id: 'review', name: 'Reviewer', agentId: created.id, instructions: 'Check citations.', toolIds: [], memory: { scope: 'none', memoryIds: [] }, context: { mode: 'selected', sourceIds: [`session:${initial.sessions[0].id}`] }, budget }], handoffs: [] })
  await integrated.collaboration.prepareTeam(configuredTeam.id, configuredTeam.revision)
  await assert.rejects(integrated.deleteAgent(created.id), /Archive/)
  await integrated.collaboration.archiveTeam(configuredTeam.id, true, configuredTeam.revision)
  await assert.rejects(integrated.deleteAgent(created.id), /Archive/)
  const final = await integrated.load()
  assert.equal(final.collaboration.teamPreparations[0].authority, 'none')
  assert.equal(final.agents.length, initial.agents.length + 2)
  assert.deepEqual(final.jobs, initial.jobs, 'Preparation starts no job')
  assert.deepEqual(final.conversations, initial.conversations, 'Preparation starts no conversation or run')
  final.collaboration.templates[0].versions[0].definition.agent.instructions = 'Mutation'
  assert.equal((await integrated.load()).collaboration.templates[0].versions[0].definition.agent.instructions, 'Cite evidence.')
  assert.equal((await createFixtureClient().load()).collaboration.templates.length, 0)
  console.log('Template versioning, replacement overrides, team scopes/budgets, immutable preparations, stale writes, archive/reference retention and no-execution checks passed.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
