import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { AutoSettings, AutoSettingsField, Complexity, Research } from '@/lib/gateway/auto-settings'
import { gatewayError } from '@/lib/gateway/transport'
import { complexityHints, composerModes, effectiveMode, modeLabel, modePresets, type ComposerMode, type ModeValues } from './composer-mode'
import { composerOutlined } from './composer-select'

type Propose = (text: string, options: { sessionId?: string | null; harnessDisabled?: boolean; signal?: AbortSignal }) => Promise<AutoSettings>
type Props = {
  text: string; think: boolean; research: Research; thinkAvailable: boolean; harnessDisabled: boolean; sessionId: string | null; disabled: boolean
  propose: Propose
  /** Writes think and research into the draft, where Pi saves them with the message. */
  apply: (values: { think: boolean; researchMode: Research }) => void
  /** Complexity is sent with the turn; the workspace reads it at send time. */
  onHints: (hints: { isAnalysis?: true }) => void
  children: ReactNode
}

/** What the chips read: the values on screen, what Auto chose and why, and the one way back to Auto. */
export type ComposerModeState = {
  current: ComposerMode | 'custom'; disabled: boolean
  /** Auto's proposal while Auto is in effect, else null: a chip tags itself "auto" and shows its reason from it. */
  auto: AutoSettings | null
  complexity: Complexity; setComplexity: (value: Complexity) => void
  think: boolean; research: Research; apply: Props['apply']
  choose: (mode: ComposerMode) => void
  status: { kind: 'idle' | 'choosing' | 'error'; message?: string }
}
const ModeContext = createContext<ComposerModeState | null>(null)
/** Null outside a composer, so a chip then renders nothing. */
// eslint-disable-next-line react-refresh/only-export-components -- the hook belongs with its provider
export const useComposerMode = () => useContext(ModeContext)

/** One composer per chat; remount it per draft so a mode never leaks between chats. Presets only set the chips. */
export function ComposerModeProvider({ text, think, research, thinkAvailable, harnessDisabled, sessionId, disabled, propose, apply, onHints, children }: Props) {
  const [mode, setMode] = useState<ComposerMode>('auto')
  const [complexity, setComplexity] = useState<Complexity>('easy')
  const [proposal, setProposal] = useState<(AutoSettings & { text: string }) | null>(null)
  const [status, setStatus] = useState<ComposerModeState['status']>({ kind: 'idle' })
  const values: ModeValues = { complexity, think, research }
  const current = effectiveMode(mode, values, proposal, thinkAvailable)
  const trimmed = text.trim()
  // Callbacks change identity on every parent render; only real input changes may restart a proposal.
  const latest = useRef({ propose, apply, onHints, thinkAvailable })
  useEffect(() => { latest.current = { propose, apply, onHints, thinkAvailable } })
  useEffect(() => { latest.current.onHints(complexityHints(complexity)) }, [complexity])
  useEffect(() => {
    if (mode !== 'auto' || current === 'custom' || disabled || trimmed.length < 8 || proposal?.text === trimmed) return
    if (harnessDisabled) { queueMicrotask(() => setStatus({ kind: 'error', message: 'Auto needs helper models, which are off for this chat. Choose the settings yourself.' })); return }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setStatus({ kind: 'choosing' })
      latest.current.propose(trimmed, { sessionId, harnessDisabled, signal: controller.signal }).then(result => {
        if (controller.signal.aborted) return
        setProposal({ ...result, text: trimmed }); setComplexity(result.complexity); setStatus({ kind: 'idle' })
        latest.current.apply({ think: result.think && latest.current.thinkAvailable, researchMode: result.research })
      }).catch(error => { if (!controller.signal.aborted) setStatus({ kind: 'error', message: gatewayError(error).message }) })
    }, 900)
    return () => { clearTimeout(timer); controller.abort() }
  }, [mode, current, disabled, trimmed, proposal?.text, harnessDisabled, sessionId])
  const choose = (next: ComposerMode) => {
    setMode(next); setStatus({ kind: 'idle' })
    if (next === 'auto') { setProposal(null); return }
    const preset = modePresets[next]
    setComplexity(preset.complexity); apply({ think: preset.think && thinkAvailable, researchMode: preset.research })
  }
  const auto = mode === 'auto' && current === 'auto' ? proposal : null
  return <ModeContext.Provider value={{ current, disabled, auto, complexity, setComplexity, think, research, apply, choose, status }}>{children}</ModeContext.Provider>
}

/** The presets. They are only a quick way to set the settings; changing one afterwards shows Custom. */
export function ModePresetControl() {
  const state = useComposerMode()
  if (!state) return null
  const { current, auto, status, disabled, choose } = state
  // What Auto chose, shown on the bar itself so it is never a mystery; the reasons are one tap away.
  const summary = auto ? ` · ${[state.complexity === 'hard' ? 'Hard' : 'Easy', state.think && 'Think first', state.research !== 'off' && (state.research === 'deep' ? 'Deep research' : 'Web'), auto.effort && `${auto.effort[0].toUpperCase()}${auto.effort.slice(1)} effort`].filter(Boolean).join(' · ')}` : ''
  const reasons: [string, AutoSettingsField][] = [['Difficulty', 'complexity'], ['Think first', 'think'], ['Search', 'research']]
  const note = status.kind === 'choosing' ? 'Choosing settings…'
    : status.kind === 'error' ? status.message
      : current === 'custom' ? 'Custom: you changed a setting. Pick a preset to start again.'
        : current === 'auto' ? auto ? 'Picked for you by Auto. Change any setting to take over.' : 'Conker chooses once you type your message.'
          : 'Presets only fill in the settings. Change any of them to take over.'
  return <Popover><PopoverTrigger render={<Button type="button" size="sm" variant="ghost" className={composerOutlined} disabled={disabled} aria-label={`Mode: ${modeLabel(current)}${summary}`} />}><Sparkles className="size-4 @max-[24rem]:hidden" />{modeLabel(current)}{status.kind === 'choosing' ? '…' : ''}{summary && <span className="font-normal text-muted-foreground @max-[40rem]:hidden">{summary}</span>}</PopoverTrigger>
    <PopoverContent align="start" className="max-h-(--available-height) w-80 space-y-4 overflow-y-auto">
      <RadioGroup value={current === 'custom' ? '' : current} onValueChange={value => choose(value as ComposerMode)} aria-label="Mode" className="gap-2">
        {composerModes.map(item => <Label key={item.id} className="flex items-start gap-2 font-normal"><RadioGroupItem value={item.id} className="mt-0.5" /><span className="space-y-0.5"><span className="block text-sm font-medium">{item.label}</span><span className="block text-xs text-muted-foreground">{item.description}</span></span></Label>)}
      </RadioGroup>
      {auto && <ul className="space-y-1 border-t pt-3 text-xs leading-5 text-muted-foreground">{reasons.map(([label, field]) => <li key={field}><span className="font-medium text-foreground">{label}:</span> {auto.reasons[field]}</li>)}{auto.effort && <li><span className="font-medium text-foreground">Effort {auto.effort}:</span> {auto.reasons.effort}</li>}</ul>}
      <p role="status" className="text-xs leading-5 text-muted-foreground">{note}</p>
    </PopoverContent></Popover>
}
