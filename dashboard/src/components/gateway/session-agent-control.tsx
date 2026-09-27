import { useEffect, useState } from 'react'
import { Bot, Check } from 'lucide-react'
import { FormActions, OverlayBody, TaskDialogContent } from '@/components/design-system/overlays'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { AgentProfile, GatewayControlClient, OwnerSessionSettings } from '@/lib/gateway/control'
import { gatewayError } from '@/lib/gateway/transport'

export function GatewaySessionAgentControl({ client, sessionId, activeAgentId, activeAgentName, disabled, onSaved }: { client: GatewayControlClient; sessionId: string; activeAgentId: string; activeAgentName: string; disabled: boolean; onSaved: (agentId: string) => void }) {
  const [open, setOpen] = useState(false)
  const [profiles, setProfiles] = useState<AgentProfile[]>([])
  const [settings, setSettings] = useState<OwnerSessionSettings | null>(null)
  const [selected, setSelected] = useState(activeAgentId)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    Promise.all([client.agents(controller.signal), client.sessionSettings(sessionId, controller.signal)]).then(([agents, saved]) => {
      if (!controller.signal.aborted) { setProfiles(agents.filter(agent => agent.archived_at === null)); setSettings(saved); setSelected(saved.settings.agentId) }
    }).catch(error => { if (!controller.signal.aborted) setError(gatewayError(error).message) })
      .finally(() => { if (!controller.signal.aborted) setPending(false) })
    return () => controller.abort()
  }, [client, open, sessionId])
  async function save() {
    if (!settings || pending || disabled || !profiles.some(agent => agent.id === selected)) return
    if (selected === settings.settings.agentId) { setOpen(false); return }
    setPending(true); setError('')
    try {
      const saved = await client.saveSessionSettings(sessionId, { ...settings, settings: { ...settings.settings, agentId: selected } })
      setSettings(saved); onSaved(saved.settings.agentId); setOpen(false)
    } catch (error) { setError(gatewayError(error).message) }
    finally { setPending(false) }
  }
  return <>
    <Button size="icon" variant="ghost" aria-label={`Conversation agent: ${activeAgentName}`} title={`Conversation agent: ${activeAgentName}`} disabled={disabled} onClick={() => { setPending(true); setError(''); setOpen(true) }}><Bot /></Button>
    <Dialog open={open} onOpenChange={value => { if (!pending) setOpen(value) }}><TaskDialogContent title="Hand off this chat" description="Choose who handles the next turn. Earlier replies keep their original author.">
      <OverlayBody><div className="space-y-4">
        <RadioGroup value={selected} onValueChange={setSelected} disabled={pending || disabled} aria-label="Conversation agent" className="gap-2">
          {profiles.map(agent => <Label key={agent.id} htmlFor={`live-agent-${agent.id}`} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-muted">
            <Bot className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{agent.configuration.name}</span><span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">{agent.configuration.role}</span></span>
            <RadioGroupItem id={`live-agent-${agent.id}`} value={agent.id} />
          </Label>)}
        </RadioGroup>
        {pending && <p role="status" className="text-sm text-muted-foreground">Loading saved agent…</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div></OverlayBody>
      <FormActions inset><Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button><Button disabled={pending || disabled || !settings || !profiles.some(agent => agent.id === selected)} onClick={() => void save()}>{selected === settings?.settings.agentId ? <><Check />Done</> : 'Hand off'}</Button></FormActions>
    </TaskDialogContent></Dialog>
  </>
}
