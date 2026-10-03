import { useEffect, useRef, useState } from 'react'
import { HatGlasses } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
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
  return <Popover open={open} onOpenChange={value => { if (!pending) { setOpen(value); if (value && saved) setDraft(saved.settings.privacy) } }}>
    <PopoverTrigger asChild><Button type="button" size="icon" className="size-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground" variant={active ? 'secondary' : 'ghost'} aria-label={active ? 'Incognito, custom settings active' : 'Incognito'} title="Incognito" aria-pressed={Boolean(active)}><HatGlasses /></Button></PopoverTrigger>
    <PopoverContent align="end" sideOffset={8} className="w-[min(20rem,calc(100vw-1rem))] space-y-3 p-3">
      <div><p className="text-sm font-medium">Chat privacy</p><p className="mt-0.5 text-xs text-muted-foreground">Controls future messages in this chat.</p></div>
      <div className="flex items-center justify-between gap-4"><Label htmlFor="live-use-memory" className="min-w-0 flex-col items-start gap-0"><span className="block text-sm">Use memory</span><span className="mt-0.5 block text-xs font-normal leading-4 text-muted-foreground">Recall and learn useful details.</span></Label><Switch id="live-use-memory" checked={!draft.memoryDisabled} disabled={!saved || pending || disabled} onCheckedChange={value => setDraft(current => ({ ...current, memoryDisabled: !value }))} /></div>
      <div className="flex items-center justify-between gap-4"><Label htmlFor="live-use-assistant" className="min-w-0 flex-col items-start gap-0"><span className="block text-sm">Use assistant tools</span><span className="mt-0.5 block text-xs font-normal leading-4 text-muted-foreground">Route models and prepare tool actions.</span></Label><Switch id="live-use-assistant" checked={!draft.harnessDisabled} disabled={!saved || pending || disabled} onCheckedChange={value => setDraft(current => ({ ...current, harnessDisabled: !value }))} /></div>
      <p className="text-xs text-muted-foreground">Messages still stay in chat history.</p>
      {pending && <p role="status" className="text-xs text-muted-foreground">Checking settings…</p>}
      {error && <div className="space-y-2"><p role="alert" className="text-xs text-destructive">{error}</p><Button variant="outline" size="sm" disabled={pending} onClick={() => void reload()}>Try again</Button></div>}
      <Button className="w-full" size="sm" disabled={!saved || pending || disabled} onClick={() => void save()}>Save</Button>
    </PopoverContent>
  </Popover>
}
