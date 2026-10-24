import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import type { AutoSettings, AutoSettingsField, Complexity, Research } from '@/lib/gateway/auto-settings'
import { gatewayError } from '@/lib/gateway/transport'
import { complexityHints, composerModes, effectiveMode, modeLabel, modePresets, type ComposerMode, type ModeValues } from './composer-mode'

type Propose = (text: string, options: { sessionId?: string | null; harnessDisabled?: boolean; signal?: AbortSignal }) => Promise<AutoSettings>
type Props = {
  text: string; think: boolean; research: Research; thinkAvailable: boolean; harnessDisabled: boolean; sessionId: string | null; disabled: boolean
  propose: Propose
  /** Writes think and research into the draft, where Pi saves them with the message. */
  apply: (values: { think: boolean; researchMode: Research }) => void
  /** Complexity is sent with the turn; the workspace reads it at send time. */
  onHints: (hints: { isAnalysis?: true }) => void
}

const options = <T extends string>(values: readonly T[], labels: Record<T, string>) => values.map(value => ({ value, label: labels[value] }))
const complexityOptions = options(['easy', 'hard'] as const, { easy: 'Easy', hard: 'Hard' })
const researchOptions = options(['off', 'web', 'deep'] as const, { off: 'Off', web: 'Web', deep: 'Deep' })

/** One composer per chat; remount it per draft so a mode never leaks between chats. */
export function ModeControl({ text, think, research, thinkAvailable, harnessDisabled, sessionId, disabled, propose, apply, onHints }: Props) {
  const [mode, setMode] = useState<ComposerMode>('auto')
  const [complexity, setComplexity] = useState<Complexity>('easy')
  const [proposal, setProposal] = useState<(AutoSettings & { text: string }) | null>(null)
  const [status, setStatus] = useState<{ kind: 'idle' | 'choosing' | 'error'; message?: string }>({ kind: 'idle' })
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
  const reason = (field: AutoSettingsField) => mode === 'auto' && current === 'auto' && proposal ? <p className="text-xs leading-5 text-muted-foreground">{proposal.reasons[field]}</p> : null
  const note = status.kind === 'choosing' ? 'Jev is choosing settings…'
    : status.kind === 'error' ? status.message
      : current === 'custom' ? 'Custom: your choices are used. Pick a mode to reset them.'
        : mode === 'auto' ? proposal ? `Chosen by Jev (${proposal.modelId}). Change any value to customize.` : 'Jev chooses once you type your message.'
          : 'Change any value to customize.'
  return <Popover><PopoverTrigger render={<Button type="button" size="sm" variant="ghost" disabled={disabled} aria-label={`Mode: ${modeLabel(current)}`} />}><Sparkles className="size-4" />{modeLabel(current)}{status.kind === 'choosing' ? '…' : ''}</PopoverTrigger>
    <PopoverContent align="start" className="max-h-(--available-height) w-80 space-y-4 overflow-y-auto">
      <RadioGroup value={mode} onValueChange={value => choose(value as ComposerMode)} aria-label="Mode" className="gap-2">
        {composerModes.map(item => <Label key={item.id} className="flex items-start gap-2 font-normal"><RadioGroupItem value={item.id} className="mt-0.5" /><span className="space-y-0.5"><span className="block text-sm font-medium">{item.label}</span><span className="block text-xs text-muted-foreground">{item.description}</span></span></Label>)}
      </RadioGroup>
      <div className="space-y-3 border-t pt-3">
        <Setting label="Complexity" value={complexity} options={complexityOptions} onChange={setComplexity} disabled={disabled} />{reason('complexity')}
        <div className="flex items-center justify-between gap-3"><Label htmlFor="mode-think" className="text-sm">Think</Label><Switch id="mode-think" checked={think} disabled={disabled || !thinkAvailable} onCheckedChange={checked => apply({ think: checked, researchMode: research })} /></div>{reason('think')}
        <Setting label="Research" value={research} options={researchOptions} onChange={value => apply({ think, researchMode: value })} disabled={disabled} />{reason('research')}
      </div>
      <p role="status" className="text-xs leading-5 text-muted-foreground">{note}</p>
    </PopoverContent></Popover>
}

function Setting<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; disabled: boolean }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-sm">{label}</span><div role="group" aria-label={label} className="flex gap-1">
    {options.map(option => <Button key={option.value} type="button" size="sm" variant={value === option.value ? 'secondary' : 'ghost'} aria-pressed={value === option.value} disabled={disabled} onClick={() => onChange(option.value)}>{option.label}</Button>)}
  </div></div>
}
