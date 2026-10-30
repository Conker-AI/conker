import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { ChatAccess } from '@/lib/gateway/access'
import { CHAT_ACCESS } from './access-labels'
import type { GatewayControlClient, OwnerSessionSettings } from '@/lib/gateway/control'
import { gatewayError } from '@/lib/gateway/transport'
import { belongsBehindMore, useComposerMoreValue } from '@/components/chat/composer-more'
import { cn } from '@/lib/utils'

/** This chat's access switch over the agent's and tools' settings. Sits behind the composer's More; loads fresh on open. */
export function GatewaySessionAccessControl({ client, sessionId, disabled }: { client: GatewayControlClient; sessionId: string; disabled: boolean }) {
  const [open, setOpen] = useState(false), [saved, setSaved] = useState<OwnerSessionSettings | null>(null)
  const [draft, setDraft] = useState<ChatAccess>('default'), [delegate, setDelegate] = useState<boolean | null>(null)
  const [pending, setPending] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    client.sessionSettings(sessionId, controller.signal).then(value => { if (!controller.signal.aborted) { setSaved(value); setDraft(value.settings.access ?? 'default') } }).catch(() => {})
    return () => controller.abort()
  }, [client, sessionId])
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    Promise.all([client.sessionSettings(sessionId, controller.signal), client.access.state(controller.signal).catch(() => null)]).then(([value, state]) => {
      if (controller.signal.aborted) return
      setSaved(value); setDraft(value.settings.access ?? 'default'); setDelegate(state ? state.delegate : null)
    }).catch(cause => { if (!controller.signal.aborted) setError(gatewayError(cause).message) })
      .finally(() => { if (!controller.signal.aborted) setPending(false) })
    return () => controller.abort()
  }, [client, open, sessionId])
  async function save() {
    if (!saved || pending || disabled) return
    if (draft === (saved.settings.access ?? 'default')) { setOpen(false); return }
    setPending(true); setError('')
    try { const value = await client.saveSessionSettings(sessionId, { ...saved, settings: { ...saved.settings, access: draft } }); setSaved(value); setOpen(false) }
    catch (cause) { setError(gatewayError(cause).message) }
    finally { setPending(false) }
  }
  const current = saved?.settings.access ?? 'default', label = CHAT_ACCESS.find(item => item.value === current)!.label
  useComposerMoreValue('access', current === 'default' ? null : `Access: ${label}`)
  return <Popover open={open} onOpenChange={value => { if (!pending) { setOpen(value); if (value) { setPending(true); setError('') } } }}>
    <PopoverTrigger render={<Button type="button" size="sm" className={cn('font-normal', current === 'default' && 'text-muted-foreground')} variant={current === 'default' ? 'ghost' : 'secondary'} disabled={disabled} />}><ShieldCheck className="size-4" />Access: {label}</PopoverTrigger>
    <PopoverContent align="start" sideOffset={8} className="w-[min(22rem,calc(100vw-1rem))] space-y-3 p-3">
      <div><p className="text-sm font-medium">Access in this chat</p><p className="mt-0.5 text-xs text-muted-foreground">What Conker may do without asking you, from the next message.</p></div>
      <RadioGroup value={draft} onValueChange={value => setDraft(value as ChatAccess)} disabled={!saved || pending || disabled} aria-label="Access in this chat" className="gap-2">
        {CHAT_ACCESS.map(item => <Label key={item.value} htmlFor={`chat-access-${item.value}`} className="flex cursor-pointer items-start gap-3 rounded-lg border p-2.5 has-data-checked:border-primary has-data-checked:bg-muted">
          <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.label}</span><span className="mt-0.5 block text-xs font-normal leading-4 text-muted-foreground">{item.hint}</span></span>
          <RadioGroupItem id={`chat-access-${item.value}`} value={item.value} />
        </Label>)}
      </RadioGroup>
      <p className="text-xs leading-5 text-muted-foreground">Sensitive tools always ask you. After this chat reads outside content (a web page, an email, someone’s message), it is one step stricter.</p>
      {delegate === false && <p className="text-xs leading-5">Conker can’t decide for your tools yet. <Link className="font-medium underline underline-offset-4" to="/settings?tab=access">Turn it on in Settings, Access</Link>.</p>}
      {pending && <p role="status" className="text-xs text-muted-foreground">Checking settings…</p>}
      {error && <p role="alert" className="text-xs text-destructive-foreground">{error}</p>}
      <Button className="w-full" size="sm" disabled={!saved || pending || disabled} onClick={() => void save()}>Save</Button>
    </PopoverContent>
  </Popover>
}
belongsBehindMore(GatewaySessionAccessControl)
