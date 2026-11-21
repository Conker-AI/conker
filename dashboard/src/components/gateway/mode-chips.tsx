import type { ComponentType } from 'react'
import { Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SegmentedControl, SegmentedControlItem } from '@/components/ui/segmented-control'
import { composerItem, useComposerValue, type ComposerItemId } from '@/components/chat/composer-items'
import type { AutoSettingsField, Research } from '@/lib/gateway/auto-settings'
import { useComposerMode } from './mode-control'

/**
 * A composer chip for one value of the mode: a quiet icon while it is off, a pill with its value when set,
 * and an "auto" tag while Auto chose it. Its popover holds the choices, Auto's reason and the way back to Auto.
 */
export function ModeChip({ id, label, icon: Icon, value, defaultValue, options, field, hint, shownOn, unavailable, disabled, onPick }: {
  id: ComposerItemId; label: string; icon: ComponentType<{ className?: string }>; value: string; defaultValue: string
  options: readonly (readonly [string, string])[]; field: AutoSettingsField; hint: string
  /** What the pill says on the bar while the chip is set, when the value alone ("On") would not name it. */
  shownOn?: string
  /** Why the chip cannot be used right now; it then stays visible but off. */
  unavailable?: string; disabled?: boolean; onPick: (value: string) => void
}) {
  const mode = useComposerMode()
  const on = !unavailable && value !== defaultValue
  const text = options.find(([option]) => option === value)?.[1] ?? value
  const tag = on && mode?.auto ? ' (auto)' : ''
  const named = on ? `${label}: ${text}${tag}` : null
  useComposerValue(id, named)
  const reason = mode?.auto?.reasons[field]
  return <Popover>
    <PopoverTrigger render={<Button type="button" variant={on ? 'secondary' : 'ghost'} size="sm" disabled={disabled || mode?.disabled || Boolean(unavailable)} aria-label={unavailable ? `${label}: ${unavailable}` : named ?? label} title={unavailable ?? named ?? label} className={on ? 'shrink-0 rounded-full' : 'shrink-0'} />}>
      <Icon className="size-4" />
      {on && <span data-bar>{shownOn ?? text}</span>}{on && mode?.auto && <span data-bar className="text-xs font-normal text-muted-foreground">auto</span>}
      <span data-label className="sr-only">{unavailable ? `${label}: ${unavailable}` : named ?? label}</span>
    </PopoverTrigger>
    <PopoverContent align="start" side="top" className="w-72 max-w-[calc(100vw-1rem)]">
      <div className="space-y-3">
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <SegmentedControl size="sm" role="radiogroup" aria-label={label} className="w-full">
            {options.map(([option, optionLabel]) => <SegmentedControlItem key={option} role="radio" aria-checked={value === option} data-pressed={value === option ? '' : undefined} className="flex-1 px-1" onClick={() => { if (value !== option) onPick(option) }}>{optionLabel}</SegmentedControlItem>)}
          </SegmentedControl>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        {reason && <p role="status" className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Auto chose this:</span> {reason}</p>}
        {mode && mode.current !== 'auto' && <Button type="button" size="sm" variant="outline" onClick={() => mode.choose('auto')}>Back to Auto</Button>}
      </div>
    </PopoverContent>
  </Popover>
}

const searchOptions = [['off', 'Off'], ['web', 'Web'], ['deep', 'Deep']] as const
/** Search: whether the answer may look things up on the web, or run a deep research pass. */
export function SearchControl() {
  const mode = useComposerMode()
  if (!mode) return null
  return <ModeChip id="search" label="Search" icon={Globe} value={mode.research} defaultValue="off" options={searchOptions} field="research" hint="Web looks things up for this message. Deep runs a longer research pass." onPick={value => mode.apply({ think: mode.think, researchMode: value as Research })} />
}
composerItem(SearchControl, 'search')
