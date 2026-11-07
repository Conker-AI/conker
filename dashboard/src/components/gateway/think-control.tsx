import { Lightbulb } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { composerItem, useComposerValue } from '@/components/chat/composer-items'

export function ThinkControl({ checked, disabled, harnessDisabled, companion = true, onChange }: { checked: boolean; disabled: boolean; harnessDisabled: boolean; companion?: boolean; onChange: (checked: boolean) => void }) {
  const available = !harnessDisabled && companion
  const on = checked && available
  useComposerValue('think', on ? 'Think' : null)
  const label = !companion ? 'Think: available in Companion chats'
    : harnessDisabled ? 'Think: unavailable in No-harness mode'
      : on ? 'Think: on' : 'Think'
  return <Button type="button" size="sm" variant={on ? 'secondary' : 'ghost'} disabled={disabled || !available} aria-pressed={on} aria-label={label} title={!companion ? 'Background thinking is available in Companion chats.' : harnessDisabled ? 'Thinking is unavailable in No-harness mode.' : 'Ask the thinking model to analyze this message in the background.'} onClick={() => onChange(!checked)}><Lightbulb className="size-4" /><span data-label className="sr-only">{label}</span></Button>
}
composerItem(ThinkControl, 'think')
