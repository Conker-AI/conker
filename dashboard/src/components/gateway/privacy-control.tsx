import { useEffect, useRef, useState } from 'react'
import { VenetianMask } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { FormActions, OverlayBody, TaskDialogContent } from '@/components/design-system/overlays'
import type { GatewayControlClient, OwnerSessionSettings } from '@/lib/gateway/control'

/** Keyed by session; auth unmount cancels reads and queued verification. */
export function GatewayPrivacyControl({ client, sessionId, disabled, onPrivacy }: { client: GatewayControlClient; sessionId: string; disabled: boolean; onPrivacy: (sessionId: string, harnessDisabled: boolean) => void }) {
  const [saved, setSaved] = useState<OwnerSessionSettings | null>(null)
  const [draft, setDraft] = useState({ memoryDisabled: false, harnessDisabled: false })
  const [open, setOpen] = useState(false), [pending, setPending] = useState(true), [error, setError] = useState('')
  const lifetime = useRef<AbortController | null>(null)
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller
    client.sessionSettings(sessionId, controller.signal).then(value => {
      if (!controller.signal.aborted) { setSaved(value); setDraft(value.settings.privacy); onPrivacy(sessionId, value.settings.privacy.harnessDisabled) }
    }).catch(error => { if (!controller.signal.aborted) setError(error.message) }).finally(() => { if (!controller.signal.aborted) setPending(false) })
    return () => controller.abort()
  }, [client, sessionId, onPrivacy])
  async function reload() {
    setPending(true); setError('')
    try { const value = await client.sessionSettings(sessionId, lifetime.current?.signal); if (!lifetime.current?.signal.aborted) { setSaved(value); setDraft(value.settings.privacy); onPrivacy(sessionId, value.settings.privacy.harnessDisabled) } }
    catch (error) { if (!lifetime.current?.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load privacy settings.') }
    finally { if (!lifetime.current?.signal.aborted) setPending(false) }
  }
  async function save() {
    if (!saved || pending || disabled) return
    setPending(true); setError('')
    try {
      const value = await client.saveSessionSettings(sessionId, { ...saved, settings: { ...saved.settings, privacy: draft } }, lifetime.current?.signal)
      if (!lifetime.current?.signal.aborted) { setSaved(value); setDraft(value.settings.privacy); onPrivacy(sessionId, value.settings.privacy.harnessDisabled); setOpen(false) }
    } catch (error) { if (!lifetime.current?.signal.aborted) setError(error instanceof Error ? error.message : 'Could not save privacy settings.') }
    finally { if (!lifetime.current?.signal.aborted) setPending(false) }
  }
  const active = saved?.settings.privacy.memoryDisabled || saved?.settings.privacy.harnessDisabled
  return <>
    <Button size="icon" variant={active ? 'secondary' : 'ghost'} aria-label={active ? 'Incognito settings · active' : 'Incognito settings'} aria-pressed={Boolean(active)} onClick={() => { if (saved) setDraft(saved.settings.privacy); setOpen(true) }}><VenetianMask /></Button>
    <Dialog open={open} onOpenChange={value => { if (!pending) setOpen(value) }}><TaskDialogContent title="Incognito" description="Choose what participates in future turns in this conversation.">
      <OverlayBody><div className="space-y-5">
        <div className="flex items-start justify-between gap-4"><div><Label htmlFor="live-memory-disabled">Disable memory</Label><p className="mt-1 text-sm text-muted-foreground">Skip MemoryGate reads and new memory ingestion for these turns.</p></div><Switch id="live-memory-disabled" checked={draft.memoryDisabled} disabled={!saved || pending || disabled} onCheckedChange={value => setDraft(current => ({ ...current, memoryDisabled: value }))} /></div>
        <div className="flex items-start justify-between gap-4"><div><Label htmlFor="live-harness-disabled">Disable harness</Label><p className="mt-1 text-sm text-muted-foreground">Skip harness processing and automatic model routing. Choose an answer model manually.</p></div><Switch id="live-harness-disabled" checked={draft.harnessDisabled} disabled={!saved || pending || disabled} onCheckedChange={value => setDraft(current => ({ ...current, harnessDisabled: value }))} /></div>
        <p className="text-xs text-muted-foreground">Conversation history still persists locally. These controls do not erase earlier records.</p>
        {pending && <p role="status" className="text-sm">Checking settings…</p>}
        {error && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="outline" size="sm" disabled={pending} onClick={() => void reload()}>Reload saved settings</Button></div>}
      </div></OverlayBody><FormActions inset><Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button><Button disabled={!saved || pending || disabled} onClick={() => void save()}>Save privacy</Button></FormActions>
    </TaskDialogContent></Dialog>
  </>
}
