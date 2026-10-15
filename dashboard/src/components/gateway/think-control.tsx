import { Lightbulb } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ThinkControl({ checked, disabled, harnessDisabled, companion = true, onChange }: { checked: boolean; disabled: boolean; harnessDisabled: boolean; companion?: boolean; onChange: (checked: boolean) => void }) {
  const available = !harnessDisabled && companion
  return <Button type="button" size="sm" variant={checked && available ? 'secondary' : 'ghost'} disabled={disabled || !available} aria-pressed={checked && available} title={!companion ? 'Background thinking is available in Companion chats.' : harnessDisabled ? 'Thinking is unavailable in No-harness mode.' : 'Ask the thinking model to analyze this message in the background.'} onClick={() => onChange(!checked)}><Lightbulb className="size-4" />{checked && available ? 'Think with this message' : 'Think'}</Button>
}
