import type { OwnerModelsConfiguration } from './control'

/**
 * The Claude models the composer's model menu names. Each runs on the Claude plan under its exact
 * Anthropic model id, which Pi's catalogue keeps as the entry's route and the plan runtime passes
 * to Claude unchanged. The first four are the current ones and get the 1-4 keys.
 */
export const CLAUDE_PROVIDER_ID = 'claude-code'
export type ClaudeModel = { readonly name: string; readonly route: string }
export const claudeModels: readonly ClaudeModel[] = [
  { name: 'Opus 5.5', route: 'claude-opus-5-5' },
  { name: 'Fable 5.2', route: 'claude-fable-5-2' },
  { name: 'Sonnet 5.5', route: 'claude-sonnet-5-5' },
  { name: 'Haiku 5.5', route: 'claude-haiku-5-5' },
  { name: 'Fable 5.1', route: 'claude-fable-5-1' },
  { name: 'Haiku 4.5', route: 'claude-haiku-4-5' },
  { name: 'Sonnet 5', route: 'claude-sonnet-5' },
  { name: 'Opus 5', route: 'claude-opus-5' },
  { name: 'Fable 5', route: 'claude-fable-5' },
  { name: 'Opus 4.8', route: 'claude-opus-4-8' },
  { name: 'Opus 4.7', route: 'claude-opus-4-7' },
  { name: 'Opus 4.6', route: 'claude-opus-4-6' },
  { name: 'Sonnet 4.6', route: 'claude-sonnet-4-6' },
]
/** How many models stand at the top of the menu with a number key. */
export const NUMBERED = 4

type Catalogue = OwnerModelsConfiguration
export type CatalogueModel = Catalogue['models'][number]

/** One selectable row of the model menu. `id` is the catalogue id, null while the owner's list has no entry for it yet. */
export type ModelRow = { id: string | null; name: string; number?: number; providerName: string }
export type ModelMenuLayout = { top: ModelRow[]; more: ModelRow[] }

const entryFor = (config: Catalogue, claude: ClaudeModel) => config.models.find(model => model.providerId === CLAUDE_PROVIDER_ID && model.route === claude.route)
const claudeFor = (model: CatalogueModel) => model.providerId === CLAUDE_PROVIDER_ID ? claudeModels.find(claude => claude.route === model.route) : undefined

/** Whether the owner's list has the Claude plan to run Claude models on. */
export function hasClaudePlan(config: Catalogue) {
  return config.providers.some(provider => provider.id === CLAUDE_PROVIDER_ID && provider.enabled)
}

/** The Claude models the owner's list does not hold yet, or holds switched off or not allowed to answer. */
export function missingClaudeModels(config: Catalogue) {
  const answer = new Set(config.roleSettings.roles.answer.eligibleModelIds)
  return claudeModels.filter(claude => {
    const entry = entryFor(config, claude)
    return !entry || !entry.enabled || !answer.has(entry.id)
  })
}

/** A new catalogue with every Claude model present, on, and allowed to answer; nothing else changes. */
export function addClaudeModels(config: Catalogue): Catalogue {
  const taken = new Set(config.models.map(model => model.id))
  const added: string[] = []
  const models = config.models.map(model => {
    const claude = claudeFor(model)
    if (!claude) return model
    added.push(model.id)
    return model.enabled ? model : { ...model, enabled: true }
  })
  for (const claude of claudeModels) {
    if (entryFor(config, claude)) continue
    let id = claude.route
    for (let n = 2; taken.has(id); n++) id = `${claude.route}-${n}`
    taken.add(id); added.push(id)
    models.push({ id, providerId: CLAUDE_PROVIDER_ID, name: claude.name, route: claude.route, enabled: true, routingDescription: '' })
  }
  const answer = config.roleSettings.roles.answer
  const eligibleModelIds = [...answer.eligibleModelIds, ...added.filter(id => !answer.eligibleModelIds.includes(id))]
  return { ...config, models, roleSettings: { ...config.roleSettings, roles: { ...config.roleSettings.roles, answer: { ...answer, eligibleModelIds } } } }
}

/**
 * The model menu: the four current Claude models first with number keys (or, with no Claude plan,
 * the first four models the owner has), then every other selectable model under More models,
 * older Claude models first. `selectable` is what may answer, in the owner's catalogue order.
 */
export function modelMenuLayout(config: Catalogue, selectable: readonly CatalogueModel[]): ModelMenuLayout {
  const providerName = (model: CatalogueModel) => config.providers.find(provider => provider.id === model.providerId)?.name ?? ''
  const row = (model: CatalogueModel, number?: number): ModelRow => ({ id: model.id, name: claudeFor(model)?.name ?? model.name, ...(number ? { number } : {}), providerName: providerName(model) })
  let top: ModelRow[], rest: readonly CatalogueModel[]
  if (hasClaudePlan(config)) {
    const used = new Set<string>()
    const claudeName = config.providers.find(provider => provider.id === CLAUDE_PROVIDER_ID)?.name ?? ''
    top = claudeModels.slice(0, NUMBERED).map((claude, index) => {
      const entry = selectable.find(model => model.providerId === CLAUDE_PROVIDER_ID && model.route === claude.route)
      if (entry) used.add(entry.id)
      return { id: entry?.id ?? null, name: claude.name, number: index + 1, providerName: claudeName }
    })
    const older = (model: CatalogueModel) => { const index = claudeModels.findIndex(claude => claude.route === claudeFor(model)?.route); return index < 0 ? Infinity : index }
    rest = selectable.filter(model => !used.has(model.id)).map((model, index) => ({ model, index })).sort((a, b) => older(a.model) - older(b.model) || a.index - b.index).map(item => item.model)
  } else {
    top = selectable.slice(0, NUMBERED).map((model, index) => row(model, index + 1))
    rest = selectable.slice(NUMBERED)
  }
  const more = rest.map(model => row(model))
  // The provider joins a name only where two rows would otherwise look the same.
  const seen = new Map<string, number>()
  for (const item of [...top, ...more]) seen.set(item.name, (seen.get(item.name) ?? 0) + 1)
  const named = (item: ModelRow): ModelRow => (seen.get(item.name) ?? 0) > 1 && item.providerName ? { ...item, name: `${item.name} · ${item.providerName}` } : item
  return { top: top.map(named), more: more.map(named) }
}
