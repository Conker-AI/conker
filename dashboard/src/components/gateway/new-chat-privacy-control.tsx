import { useState } from 'react'
import { VenetianMask } from 'lucide-react'
import { FormActions, OverlayBody, TaskDialogContent } from '@/components/design-system/overlays'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

export type NewChatPrivacy = { memoryDisabled: boolean; harnessDisabled: boolean }

export function NewChatPrivacyControl({ value, disabled, onChange }: { value: NewChatPrivacy; disabled: boolean; onChange: (value: NewChatPrivacy) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const active = value.memoryDisabled || value.harnessDisabled
  return <>
    <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 px-0 text-muted-foreground hover:bg-transparent hover:text-foreground" aria-label={active ? 'First-message privacy · active' : 'First-message privacy'} aria-pressed={active} disabled={disabled} onClick={() => { setDraft(value); setOpen(true) }}><VenetianMask className="size-4" />{active ? 'Incognito on' : 'Incognito'}</Button>
    <Dialog open={open} onOpenChange={next => setOpen(next)}><TaskDialogContent title="Start incognito" description="Add restrictions before this conversation and its first turn are created.">
      <OverlayBody><div className="space-y-5">
        <div className="flex items-start justify-between gap-4"><div><Label htmlFor="new-memory-disabled">Do not use memory</Label><p className="mt-1 text-sm text-muted-foreground">Skip memory reads and new memory ingestion from the first message.</p></div><Switch id="new-memory-disabled" checked={draft.memoryDisabled} onCheckedChange={checked => setDraft(current => ({ ...current, memoryDisabled: checked }))} /></div>
        <div className="flex items-start justify-between gap-4"><div><Label htmlFor="new-harness-disabled">Do not use the harness</Label><p className="mt-1 text-sm text-muted-foreground">Skip harness processing and automatic routing. You must choose an answer model.</p></div><Switch id="new-harness-disabled" checked={draft.harnessDisabled} onCheckedChange={checked => setDraft(current => ({ ...current, harnessDisabled: checked }))} /></div>
        <p className="text-xs leading-5 text-muted-foreground">A switch left off keeps your setup default. Conversation history still persists locally.</p>
      </div></OverlayBody>
      <FormActions inset><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => { onChange(draft); setOpen(false) }}>Apply</Button></FormActions>
    </TaskDialogContent></Dialog>
  </>
}
