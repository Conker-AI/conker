import { Lightbulb } from 'lucide-react'
import { composerItem } from '@/components/chat/composer-items'
import { ModeChip } from './mode-chips'

const thinkOptions = [['off', 'Off'], ['on', 'On']] as const

/** Thinking: ask the thinking model to analyze this message in the background. Only Companion chats with helpers on have it. */
export function ThinkControl({ checked, disabled, harnessDisabled, companion = true, onChange }: { checked: boolean; disabled: boolean; harnessDisabled: boolean; companion?: boolean; onChange: (checked: boolean) => void }) {
  const unavailable = !companion ? 'available in Companion chats' : harnessDisabled ? 'unavailable in No-harness mode' : undefined
  return <ModeChip id="think" label="Thinking" icon={Lightbulb} value={checked && !unavailable ? 'on' : 'off'} defaultValue="off" options={thinkOptions} field="think" shownOn="Thinking" hint="The thinking model analyzes this message in the background before the answer." unavailable={unavailable} disabled={disabled} onPick={value => onChange(value === 'on')} />
}
composerItem(ThinkControl, 'think')
