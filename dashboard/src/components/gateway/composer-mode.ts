import type { AutoSettings, Research } from '@/lib/gateway/auto-settings'
import type { ChatEffort } from '@/lib/gateway/chat-names'
import type { ModelMenuLayout } from '@/lib/gateway/claude-models'

/** Modes are presets over the composer's settings; Auto takes its values from the routing model. */
export type ComposerMode = 'auto' | 'fast' | 'balanced' | 'deep'
export type ModelTier = 'haiku' | 'sonnet' | 'opus'
/** What is on screen: whether it thinks first, searches, how hard the model works, and which model ('' is the default). */
export type ModeValues = { think: boolean; research: Research; effort: ChatEffort; modelId: string }
/** What a mode asks for. A null effort or model means the mode has no opinion, so any value matches. */
export type ModeTarget = { think: boolean; research: Research; effort: ChatEffort | null; modelId: string | null }
type Preset = { tier: ModelTier; effort: ChatEffort; think: boolean; research: Research }

export const composerModes: readonly { id: ComposerMode; label: string; description: string }[] = [
  { id: 'auto', label: 'Auto', description: 'Conker picks the model, effort, thinking and search for each message.' },
  { id: 'fast', label: 'Fast', description: 'Haiku, light effort, no thinking, no web.' },
  { id: 'balanced', label: 'Balanced', description: 'Sonnet, medium effort, with web search.' },
  { id: 'deep', label: 'Deep', description: 'Opus, high effort, thinking and deep research.' },
]

export const modePresets: Record<Exclude<ComposerMode, 'auto'>, Preset> = {
  fast: { tier: 'haiku', effort: 'light', think: false, research: 'off' },
  balanced: { tier: 'sonnet', effort: 'medium', think: false, research: 'web' },
  deep: { tier: 'opus', effort: 'high', think: true, research: 'deep' },
}

/** The id of the model menu's first row for a tier (by its name, "Haiku 5.5"); null when the list has none. */
export function tierModelId(layout: ModelMenuLayout | null, tier: ModelTier): string | null {
  const rows = layout ? [...layout.top, ...layout.more] : []
  return rows.find(row => row.id && row.name.toLowerCase().startsWith(tier))?.id ?? null
}

/** Whether the model menu offers this model; Auto only sets a model the owner can see and choose. */
export const offersModel = (layout: ModelMenuLayout | null, id: string) => Boolean(layout && [...layout.top, ...layout.more].some(row => row.id === id))

/** The values a mode asks for; thinking only where it is available. Auto has none until the routing model answers. */
export function modeTarget(mode: ComposerMode, proposal: AutoSettings | null, thinkAvailable: boolean, layout: ModelMenuLayout | null): ModeTarget | null {
  if (mode === 'auto') return proposal ? { think: proposal.think && thinkAvailable, research: proposal.research, effort: proposal.effort ?? null, modelId: offersModel(layout, proposal.modelId) ? proposal.modelId : null } : null
  const preset = modePresets[mode]
  return { think: preset.think && thinkAvailable, research: preset.research, effort: preset.effort, modelId: tierModelId(layout, preset.tier) }
}

/** A mode stays selected while the values on screen are its own; any change shows Custom. */
export function effectiveMode(mode: ComposerMode, values: ModeValues, proposal: AutoSettings | null, thinkAvailable: boolean, layout: ModelMenuLayout | null): ComposerMode | 'custom' {
  const target = modeTarget(mode, proposal, thinkAvailable, layout)
  if (!target) return mode
  const same = target.think === values.think && target.research === values.research && (target.effort === null || target.effort === values.effort) && (target.modelId === null || target.modelId === values.modelId)
  return same ? mode : 'custom'
}

export const modeLabel = (mode: ComposerMode | 'custom') => mode === 'custom' ? 'Custom' : composerModes.find(item => item.id === mode)!.label
