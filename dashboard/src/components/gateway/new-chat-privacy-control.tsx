import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { AnimatedIconButton } from '@/components/icons/animated/animated-icon'
import { EyeOffIcon } from '@/components/icons/animated/icons'

export type NewChatPrivacy = { memoryDisabled: boolean; harnessDisabled: boolean }

export function NewChatPrivacyControl({ value, disabled, onChange }: { value: NewChatPrivacy; disabled: boolean; onChange: (value: NewChatPrivacy) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const active = value.memoryDisabled || value.harnessDisabled
  return <Popover open={open} onOpenChange={next => { setOpen(next); if (next) setDraft(value) }}>
    <PopoverTrigger asChild><AnimatedIconButton icon={EyeOffIcon} iconSize={17} type="button" variant={active ? 'secondary' : 'ghost'} size="icon" className="size-7 text-muted-foreground hover:text-foreground" aria-label={active ? 'Incognito, custom settings active' : 'Incognito'} title="Incognito" aria-pressed={active} disabled={disabled} /></PopoverTrigger>
    <PopoverContent align="end" sideOffset={8} className="w-[min(20rem,calc(100vw-1rem))] space-y-3 p-3">
      <div><p className="text-sm font-medium">Chat privacy</p><p className="mt-0.5 text-xs text-muted-foreground">Choose what Conker can use in this chat.</p></div>
      <div className="flex items-center justify-between gap-4"><Label htmlFor="new-use-memory" className="min-w-0"><span className="block text-sm">Use memory</span><span className="mt-0.5 block text-xs font-normal leading-4 text-muted-foreground">Recall and learn useful details.</span></Label><Switch id="new-use-memory" checked={!draft.memoryDisabled} onCheckedChange={checked => setDraft(current => ({ ...current, memoryDisabled: !checked }))} /></div>
      <div className="flex items-center justify-between gap-4"><Label htmlFor="new-use-assistant" className="min-w-0"><span className="block text-sm">Use assistant tools</span><span className="mt-0.5 block text-xs font-normal leading-4 text-muted-foreground">Route models and prepare tool actions.</span></Label><Switch id="new-use-assistant" checked={!draft.harnessDisabled} onCheckedChange={checked => setDraft(current => ({ ...current, harnessDisabled: !checked }))} /></div>
      <p className="text-xs text-muted-foreground">Messages still stay in chat history.</p>
      <Button className="w-full" size="sm" onClick={() => { onChange(draft); setOpen(false) }}>Apply</Button>
    </PopoverContent>
  </Popover>
}
