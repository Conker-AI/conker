import type { AutoSettings, Research } from '@/lib/gateway/auto-settings'
import type { ChatEffort } from '@/lib/gateway/chat-names'
import type { ModelMenuLayout } from '@/lib/gateway/claude-models'

/** Every mode is decided by the routing model when the message is written; a mode only biases that decision. */
export type ComposerMode = 'auto' | 'fast' | 'balanced' | 'deep'
/** What is on screen: whether it thinks first, searches, how hard the model works, and which model ('' is the default). */
export type ModeValues = { think: boolean; research: Research; effort: ChatEffort; modelId: string }
/** What a mode asks for. A null effort or model means the mode has no opinion, so any value matches. */
export type ModeTarget = { think: boolean; research: Research; effort: ChatEffort | null; modelId: string | null }

export const composerModes: readonly { id: ComposerMode; label: string; description: string }[] = [
  { id: 'auto', label: 'Auto', description: 'Conker reads your message and decides the model, effort, thinking and search.' },
  { id: 'fast', label: 'Fast', description: 'Conker decides, leaning to the quickest answer that is good enough.' },
  { id: 'balanced', label: 'Balanced', description: 'Conker decides, weighing quality against speed.' },
  { id: 'deep', label: 'Deep', description: 'Conker decides, leaning to the most thorough answer.' },
]

/** Whether the model menu offers this model; Auto only sets a model the owner can see and choose. */
export const offersModel = (layout: ModelMenuLayout | null, id: string) => Boolean(layout && [...layout.top, ...layout.more].some(row => row.id === id))

/** What Conker decided for the message: every mode takes its values from the routing model's proposal. */
export function modeTarget(proposal: AutoSettings | null, thinkAvailable: boolean, layout: ModelMenuLayout | null): ModeTarget | null {
  if (!proposal) return null
  const id = proposal.answerModelId
  return { think: proposal.think && thinkAvailable, research: proposal.research, effort: proposal.effort ?? null, modelId: id && offersModel(layout, id) ? id : null }
}

/** A mode stays selected while the values on screen are its own; any change shows Custom. */
export function effectiveMode(mode: ComposerMode, values: ModeValues, proposal: AutoSettings | null, thinkAvailable: boolean, layout: ModelMenuLayout | null): ComposerMode | 'custom' {
  const target = modeTarget(proposal, thinkAvailable, layout)
  if (!target) return mode
  const same = target.think === values.think && target.research === values.research && (target.effort === null || target.effort === values.effort) && (target.modelId === null || target.modelId === values.modelId)
  return same ? mode : 'custom'
}

export const modeLabel = (mode: ComposerMode | 'custom') => mode === 'custom' ? 'Custom' : composerModes.find(item => item.id === mode)!.label
