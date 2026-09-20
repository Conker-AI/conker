import { modelRolesErrors, type ModelRolesConfiguration } from "./model-roles"

/** Editable preview configuration. No provider is contacted by the fixture client. */
export type ModelProvider = {
  id: "openrouter" | "anthropic" | "openai"
  name: string
  endpoint: string
  apiKeyDraft: string
  enabled: boolean
}

export type CatalogueModel = {
  id: string
  providerId: ModelProvider["id"]
  name: string
  route: string
  enabled: boolean
}

export type ModelsConfiguration = {
  providers: ModelProvider[]
  models: CatalogueModel[]
  defaultModelId: string | null
  roleSettings?: ModelRolesConfiguration
}

/** A new, isolated draft for every client; names and routes are sample configuration. */
export function createModelsConfiguration(): ModelsConfiguration {
  return {
    providers: [
      { id: "openrouter", name: "OpenRouter", endpoint: "https://openrouter.ai/api/v1", apiKeyDraft: "", enabled: true },
      { id: "anthropic", name: "Anthropic", endpoint: "https://api.anthropic.com/v1", apiKeyDraft: "", enabled: true },
      { id: "openai", name: "OpenAI", endpoint: "https://api.openai.com/v1", apiKeyDraft: "", enabled: true },
    ],
    models: [
      { id: "openrouter-sonnet", providerId: "openrouter", name: "Claude Sonnet 4", route: "anthropic/claude-sonnet-4", enabled: true },
      { id: "openrouter-gpt", providerId: "openrouter", name: "GPT-4.1", route: "openai/gpt-4.1", enabled: true },
      { id: "anthropic-sonnet", providerId: "anthropic", name: "Claude Sonnet 4", route: "claude-sonnet-4-20250514", enabled: true },
      { id: "openai-gpt", providerId: "openai", name: "GPT-4.1", route: "gpt-4.1", enabled: true },
    ],
    defaultModelId: "openrouter-sonnet",
  }
}

/** Availability means enabled in this draft, never a verified or connected provider. */
export function getAvailableModels(configuration: ModelsConfiguration): CatalogueModel[] {
  const providers = new Set(configuration.providers.filter(provider => provider.enabled).map(provider => provider.id))
  return configuration.models.filter(model => model.enabled && providers.has(model.providerId))
}

export function getDefaultModel(configuration: ModelsConfiguration): CatalogueModel | undefined {
  return getAvailableModels(configuration).find(model => model.id === configuration.defaultModelId)
}

export function validateModelsConfiguration(configuration: ModelsConfiguration): string | null {
  if (new Set(configuration.providers.map(provider => provider.id)).size !== configuration.providers.length) return "Each provider must have a unique ID."
  if (new Set(configuration.models.map(model => model.id)).size !== configuration.models.length) return "Each model must have a unique ID."
  for (const provider of configuration.providers) {
    if (!provider.endpoint.trim()) {
      if (provider.enabled) return `Add an endpoint for ${provider.name}, or disable this provider.`
      continue
    }
    try {
      const endpoint = new URL(provider.endpoint)
      if (!["https:", "http:"].includes(endpoint.protocol) || endpoint.username || endpoint.password) throw new Error("Invalid endpoint")
    } catch {
      return `Use an HTTP or HTTPS endpoint without embedded credentials for ${provider.name}.`
    }
  }
  for (const model of configuration.models) {
    if (!configuration.providers.some(provider => provider.id === model.providerId)) return `Choose an existing provider for ${model.name}.`
    if (!model.id.trim() || !model.name.trim() || !model.route.trim()) return "Every model needs an ID, a name, and a route."
  }
  const available = getAvailableModels(configuration)
  if (configuration.defaultModelId !== null && !getDefaultModel(configuration)) return "Choose an enabled model as the default route."
  if (available.length && configuration.defaultModelId === null) return "Choose a default route from the enabled models."
  if (configuration.roleSettings) return modelRolesErrors(configuration.roleSettings, configuration)[0] || null
  return null
}
