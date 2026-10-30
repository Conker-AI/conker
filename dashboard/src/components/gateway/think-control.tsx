import { Lightbulb } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useComposerMoreValue } from '@/components/chat/composer-more'
import { cn } from '@/lib/utils'

export function ThinkControl({ checked, disabled, harnessDisabled, companion = true, onChange }: { checked: boolean; disabled: boolean; harnessDisabled: boolean; companion?: boolean; onChange: (checked: boolean) => void }) {
  const available = !harnessDisabled && companion
  useComposerMoreValue('think', checked && available ? 'Think' : null)
  return <Button type="button" size="sm" variant={checked && available ? 'secondary' : 'ghost'} className={cn('font-normal', !(checked && available) && 'text-muted-foreground')} disabled={disabled || !available} aria-pressed={checked && available} title={!companion ? 'Background thinking is available in Companion chats.' : harnessDisabled ? 'Thinking is unavailable in No-harness mode.' : 'Ask the thinking model to analyze this message in the background.'} onClick={() => onChange(!checked)}><Lightbulb className="size-4" />{checked && available ? 'Think with this message' : 'Think'}</Button>
}
