import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { AutoMode, AutoSettings, AutoSettingsField, Research } from '@/lib/gateway/auto-settings'
import type { ChatEffort } from '@/lib/gateway/chat-names'
import type { ModelMenuLayout } from '@/lib/gateway/claude-models'
import { gatewayError } from '@/lib/gateway/transport'
import { useServerSetting } from '@/settings/server-setting'
import { composerModes, effectiveMode, modeLabel, offersModel, type ComposerMode, type ModeValues } from './composer-mode'
import { composerOutlined } from './composer-select'
import { effortLabel } from './use-chat-effort'

type Propose = (text: string, options: { sessionId?: string | null; harnessDisabled?: boolean; mode?: AutoMode; signal?: AbortSignal }) => Promise<AutoSettings>
type Props = {
  text: string
  think: boolean
  research: Research
  thinkAvailable: boolean
  harnessDisabled: boolean
  sessionId: string | null
  disabled: boolean
  /** The model chosen for the next message ('' is the default) and the way to choose another. */
  modelId: string
  setModel: (modelId: string) => void
  propose: Propose
  /** Writes think and research into the draft, where Pi saves them with the message. */
  apply: (values: { think: boolean; researchMode: Research }) => void
  children: ReactNode
}

/** What the model button tells the mode: the models on offer, the chat's effort and the way to set it. */
export type ModeBridge = { layout: ModelMenuLayout; effort: ChatEffort; ready: boolean; setEffort: (effort: ChatEffort) => void }

/** What the chips read: the values on screen, what Auto chose and why, and the one way back to Auto. */
export type ComposerModeState = {
  current: ComposerMode | 'custom'
  disabled: boolean
  /** Auto's proposal while Auto is in effect, else null: a chip tags itself "auto" and shows its reason from it. */
  auto: AutoSettings | null
  think: boolean
  research: Research
  effort: ChatEffort
  apply: Props['apply']
  choose: (mode: ComposerMode) => void
  /** The model button reports its models and effort here so a mode can set them. */
  connect: (bridge: ModeBridge | null) => void
  status: { kind: 'idle' | 'choosing' | 'error'; message?: string }
}
const ModeContext = createContext<ComposerModeState | null>(null)
/** Null outside a composer, so a chip then renders nothing. */
// eslint-disable-next-line react-refresh/only-export-components -- the hook belongs with its provider
export const useComposerMode = () => useContext(ModeContext)

/** One composer per chat; remount it per draft so a mode never leaks between chats. A mode sets the model, effort, thinking and search together. */
export function ComposerModeProvider({ text, think, research, thinkAvailable, harnessDisabled, sessionId, disabled, modelId, setModel, propose, apply, children }: Props) {
  // The owner's Mode for a new chat starts each composer; a later change waits for the next one.
  const startMode = useServerSetting<'auto' | 'fast' | 'balanced' | 'deep'>('chats.default_mode', 'auto')
  const [mode, setMode] = useState<ComposerMode>(startMode)
  const [bridge, setBridge] = useState<ModeBridge | null>(null)
  const [proposal, setProposal] = useState<(AutoSettings & { text: string }) | null>(null)
  const [status, setStatus] = useState<ComposerModeState['status']>({ kind: 'idle' })
  const effort = bridge?.effort ?? 'auto'
  const values: ModeValues = { think, research, effort, modelId }
  const layout = bridge?.layout ?? null
  const current = effectiveMode(mode, values, proposal, thinkAvailable, layout)
  const trimmed = text.trim()
  // Callbacks change identity on every parent render; only real input changes may restart a proposal.
  const latest = useRef({ propose, apply, setModel, thinkAvailable, bridge })
  useEffect(() => {
    latest.current = { propose, apply, setModel, thinkAvailable, bridge }
  })
  useEffect(() => {
    if (current === 'custom' || disabled || trimmed.length < 8 || proposal?.text === trimmed) return
    if (harnessDisabled) {
      queueMicrotask(() => setStatus({ kind: 'error', message: 'Conker needs helper models, which are off for this chat. Choose the settings yourself.' }))
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setStatus({ kind: 'choosing' })
      latest.current
        .propose(trimmed, { sessionId, harnessDisabled, mode, signal: controller.signal })
        .then(result => {
          if (controller.signal.aborted) return
          const now = latest.current
          setProposal({ ...result, text: trimmed })
          setStatus({ kind: 'idle' })
          now.apply({ think: result.think && now.thinkAvailable, researchMode: result.research })
          if (result.answerModelId && offersModel(now.bridge?.layout ?? null, result.answerModelId)) now.setModel(result.answerModelId)
          if (result.effort && now.bridge?.ready) now.bridge.setEffort(result.effort)
        })
        .catch(error => {
          if (!controller.signal.aborted) setStatus({ kind: 'error', message: gatewayError(error).message })
        })
    }, 900)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [mode, current, disabled, trimmed, proposal?.text, harnessDisabled, sessionId])
  const choose = (next: ComposerMode) => {
    setMode(next)
    setStatus({ kind: 'idle' })
    setProposal(null)
  }
  const auto = current === mode ? proposal : null
  return <ModeContext.Provider value={{ current, disabled, auto, think, research, effort, apply, choose, connect: setBridge, status }}>{children}</ModeContext.Provider>
}

/** The modes: each one is a bias for Conker's own decision; changing a setting afterwards shows Custom. */
export function ModePresetControl() {
  const state = useComposerMode()
  if (!state) return null
  const { current, auto, status, disabled, choose } = state
  // What Auto chose, shown on the bar itself so it is never a mystery; the reasons are one tap away.
  const summary = auto ? ` · ${[state.think && 'Think first', state.research !== 'off' && (state.research === 'deep' ? 'Deep research' : 'Web'), auto.effort && `${effortLabel(auto.effort)} effort`].filter(Boolean).join(' · ')}` : ''
  const reasons: [string, AutoSettingsField][] = [
    ['Think first', 'think'],
    ['Search', 'research'],
  ]
  const note =
    status.kind === 'choosing'
      ? 'Choosing settings…'
      : status.kind === 'error'
        ? status.message
        : current === 'custom'
          ? 'Custom: you changed a setting. Pick a mode to let Conker decide again.'
          : auto
            ? 'Decided for you from your message. Change any setting to take over.'
            : 'Conker decides once you type your message.'
  return (
    <Popover>
      <PopoverTrigger render={<Button type="button" size="sm" variant="ghost" className={composerOutlined} disabled={disabled} aria-label={`Mode: ${modeLabel(current)}${summary}`} />}>
        <Sparkles className="size-4 @max-[24rem]:hidden" />
        {modeLabel(current)}
        {status.kind === 'choosing' ? '…' : ''}
        {summary && <span className="font-normal text-muted-foreground @max-[40rem]:hidden">{summary}</span>}
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-(--available-height) w-80 space-y-4 overflow-y-auto">
        <RadioGroup value={current === 'custom' ? '' : current} onValueChange={value => choose(value as ComposerMode)} aria-label="Mode" className="gap-2">
          {composerModes.map(item => (
            <Label key={item.id} className="flex items-start gap-2 font-normal">
              <RadioGroupItem value={item.id} className="mt-0.5" />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">{item.label}</span>
                <span className="block text-xs text-muted-foreground">{item.description}</span>
              </span>
            </Label>
          ))}
        </RadioGroup>
        {auto && (
          <ul className="space-y-1 border-t pt-3 text-xs leading-5 text-muted-foreground">
            {reasons.map(([label, field]) => (
              <li key={field}>
                <span className="font-medium text-foreground">{label}:</span> {auto.reasons[field]}
              </li>
            ))}
            {auto.effort && (
              <li>
                <span className="font-medium text-foreground">Effort {auto.effort}:</span> {auto.reasons.effort}
              </li>
            )}
            {auto.reasons.model && (
              <li>
                <span className="font-medium text-foreground">Model:</span> {auto.reasons.model}
              </li>
            )}
          </ul>
        )}
        <p role="status" className="text-xs leading-5 text-muted-foreground">
          {note}
        </p>
      </PopoverContent>
    </Popover>
  )
}
