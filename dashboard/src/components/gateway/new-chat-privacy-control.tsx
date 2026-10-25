import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { HatGlasses } from 'lucide-react'

export type NewChatPrivacy = { memoryDisabled: boolean; harnessDisabled: boolean }

export function NewChatPrivacyControl({ value, disabled, onChange, revisionKey }: { value: NewChatPrivacy; disabled: boolean; revisionKey?: string; onChange: (value: NewChatPrivacy, reviewed?: string) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const [openedWith, setOpenedWith] = useState({ value, revisionKey })
  const changed = openedWith.value.memoryDisabled !== value.memoryDisabled || openedWith.value.harnessDisabled !== value.harnessDisabled || openedWith.revisionKey !== revisionKey
  const active = value.memoryDisabled || value.harnessDisabled
  return <Popover open={open} onOpenChange={next => { setOpen(next); if (next) { setDraft(value); setOpenedWith({ value, revisionKey }) } }}>
    <PopoverTrigger render={<Button type="button" variant={active ? 'secondary' : 'ghost'} size="icon" className="size-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground" aria-label={active ? 'Incognito, custom settings active' : 'Incognito'} title="Incognito" aria-pressed={active} disabled={disabled} />}><HatGlasses /></PopoverTrigger>
    <PopoverContent align="end" sideOffset={8} className="w-[min(20rem,calc(100vw-1rem))] space-y-3 p-3">
      <div><p className="text-sm font-medium">Chat privacy</p><p className="mt-0.5 text-xs text-muted-foreground">Choose what Conker can use in this chat.</p></div>
      <div className="flex items-center justify-between gap-4"><Label htmlFor="new-use-memory" className="min-w-0 flex-col items-start gap-0"><span className="block text-sm">Use memory</span><span className="mt-0.5 block text-xs font-normal leading-4 text-muted-foreground">Recall and learn useful details.</span></Label><Switch id="new-use-memory" checked={!draft.memoryDisabled} onCheckedChange={checked => setDraft(current => ({ ...current, memoryDisabled: !checked }))} /></div>
      <div className="flex items-center justify-between gap-4"><Label htmlFor="new-use-assistant" className="min-w-0 flex-col items-start gap-0"><span className="block text-sm">Use assistant tools</span><span className="mt-0.5 block text-xs font-normal leading-4 text-muted-foreground">Route models and prepare tool actions.</span></Label><Switch id="new-use-assistant" checked={!draft.harnessDisabled} onCheckedChange={checked => setDraft(current => ({ ...current, harnessDisabled: !checked }))} /></div>
      <p className="text-xs text-muted-foreground">Setup defaults still apply when no restriction is selected. Messages and drafts stay on this server.</p>
      {changed && <p role="alert" className="text-xs text-destructive-foreground">Privacy changed while this menu was open. Close and reopen it to review the saved settings.</p>}
      <Button className="w-full" size="sm" disabled={disabled || changed} onClick={() => { if (changed || disabled) return; onChange(draft, openedWith.revisionKey); setOpen(false) }}>Apply</Button>
    </PopoverContent>
  </Popover>
}
