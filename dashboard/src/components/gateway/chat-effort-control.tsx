import { useEffect, useRef, useState } from 'react'
import { Gauge } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SegmentedControl, SegmentedControlItem } from '@/components/ui/segmented-control'
import type { GatewayControlClient } from '@/lib/gateway/control'
import type { ChatEffort, ChatOutput } from '@/lib/gateway/chat-names'
import { chatFeatureMessage } from '@/lib/gateway/chat-feature-errors'
import { GatewayError } from '@/lib/gateway/transport'
import { composerItem, useComposerValue } from '@/components/chat/composer-items'
import { ChatFeatureError } from '@/components/chat/chat-feature-error'

const stops: readonly (readonly [ChatEffort, string])[] = [['auto', 'Auto'], ['light', 'Light'], ['medium', 'Medium'], ['high', 'High'], ['max', 'Max']]
const labelOf = (effort: ChatEffort) => stops.find(([value]) => value === effort)?.[1] ?? effort

/** Says whether the models that may answer this chat use the effort; null means Pi only learns it from the provider, so it counts as available. */
function supportNote(support: ChatOutput['effortSupport']) {
  if (!support?.length) return null
  const ignoring = support.filter(row => row.applies === false).length
  if (ignoring === support.length) return 'Not used by this chat’s model: it ignores effort.'
  return ignoring ? `Not used by ${ignoring} of the ${support.length} models that may answer.` : null
}

/** Effort for this chat: how hard the answering model thinks, from Light to Max. It reaches only the answer, and higher costs more. */
export function ChatEffortControl({ control, sessionId, disabled }: { control: GatewayControlClient; sessionId: string; disabled: boolean }) {
  const [saved, setSaved] = useState<ChatOutput | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const latest = useRef(0)

  const load = async (keepError = '') => {
    const ticket = ++latest.current
    setError(keepError)
    try {
      const result = await control.chatNames.output(sessionId)
      if (ticket === latest.current) setSaved(result)
    } catch (failure) {
      if (ticket === latest.current) setError(chatFeatureMessage(failure))
    }
  }
  // The bar names the effort, so it is read when the chat opens, not when the popover does.
  useEffect(() => {
    let live = true
    control.chatNames.output(sessionId).then(result => { if (live) setSaved(result) }).catch(failure => { if (live) setError(chatFeatureMessage(failure)) })
    return () => { live = false }
  }, [control, sessionId])

  const choose = async (effort: ChatEffort) => {
    if (!saved) return
    setSaving(true)
    setError('')
    try {
      setSaved(await control.chatNames.saveOutput(sessionId, { ...saved.output, effort }, saved.revision))
    } catch (failure) {
      const message = chatFeatureMessage(failure)
      if (failure instanceof GatewayError && failure.code === 'revision_conflict') await load(message)
      else setError(message)
    } finally {
      setSaving(false)
    }
  }

  const effort = saved?.output.effort ?? 'auto'
  const named = effort === 'auto' ? null : `Effort: ${labelOf(effort)}`
  const note = supportNote(saved?.effortSupport)
  useComposerValue('effort', named)

  return <Popover onOpenChange={open => { if (open) void load() }}>
    <PopoverTrigger render={<Button variant={named ? 'secondary' : 'ghost'} size="sm" disabled={disabled} aria-label={named ?? 'Effort'} title={named ?? 'Effort'} className={named ? 'shrink-0 rounded-full' : 'shrink-0'} />}>
      <Gauge className="size-4" /><span data-label className="sr-only">{named ?? 'Effort'}</span>
    </PopoverTrigger>
    <PopoverContent align="start" side="top" className="w-72 max-w-[calc(100vw-1rem)]">
      <div className="space-y-3">
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Effort</span>
          <SegmentedControl size="sm" role="radiogroup" aria-label="Effort" className="w-full">
            {stops.map(([value, text]) => <SegmentedControlItem key={value} role="radio" aria-checked={effort === value} data-pressed={effort === value ? '' : undefined} disabled={saving || !saved} className="flex-1 px-1" onClick={() => { if (effort !== value) void choose(value) }}>{text}</SegmentedControlItem>)}
          </SegmentedControl>
          <p className="text-xs text-muted-foreground">How hard the answering model thinks. Higher effort is slower and costs more. Auto leaves it to the model.</p>
        </div>
        {note && <p role="status" className="text-xs text-muted-foreground">{note}</p>}
        {error && <ChatFeatureError text={error} />}
      </div>
    </PopoverContent>
  </Popover>
}
composerItem(ChatEffortControl, 'effort')
