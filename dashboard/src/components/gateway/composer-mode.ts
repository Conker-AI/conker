import type { AutoSettings, Complexity, Research } from '@/lib/gateway/auto-settings'

/** Modes are presets over the composer's settings; Auto takes its values from the routing model. */
export type ComposerMode = 'auto' | 'fast' | 'balanced' | 'deep'
export type ModeValues = { complexity: Complexity; think: boolean; research: Research }

export const composerModes: readonly { id: ComposerMode; label: string; description: string }[] = [
  { id: 'auto', label: 'Auto', description: 'Jev chooses every setting for each message.' },
  { id: 'fast', label: 'Fast', description: 'Ordinary model, no thinking, no web.' },
  { id: 'balanced', label: 'Balanced', description: 'Ordinary model with web search.' },
  { id: 'deep', label: 'Deep', description: 'Stronger model, thinking and deep research.' },
]

export const modePresets: Record<Exclude<ComposerMode, 'auto'>, ModeValues> = {
  fast: { complexity: 'easy', think: false, research: 'off' },
  balanced: { complexity: 'easy', think: false, research: 'web' },
  deep: { complexity: 'hard', think: true, research: 'deep' },
}

/** The values a mode asks for; thinking only where it is available. Auto has none until Jev answers. */
export function modeTarget(mode: ComposerMode, proposal: AutoSettings | null, thinkAvailable: boolean): ModeValues | null {
  const source = mode === 'auto' ? proposal : modePresets[mode]
  return source ? { complexity: source.complexity, think: source.think && thinkAvailable, research: source.research } : null
}

/** A mode stays selected while the values on screen are its own; any change shows Custom. */
export function effectiveMode(mode: ComposerMode, values: ModeValues, proposal: AutoSettings | null, thinkAvailable: boolean): ComposerMode | 'custom' {
  const target = modeTarget(mode, proposal, thinkAvailable)
  if (!target) return mode
  return target.complexity === values.complexity && target.think === values.think && target.research === values.research ? mode : 'custom'
}

export const modeLabel = (mode: ComposerMode | 'custom') => mode === 'custom' ? 'Custom' : composerModes.find(item => item.id === mode)!.label

/** Hard complexity travels with the turn as Pi's analysis hint; Easy is the ordinary route. */
export const complexityHints = (complexity: Complexity): { isAnalysis?: true } => complexity === 'hard' ? { isAnalysis: true } : {}
