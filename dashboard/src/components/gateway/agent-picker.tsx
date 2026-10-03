import { useEffect, useMemo, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { AgentProfile, GatewayControlClient } from '@/lib/gateway/control'
import { ComposerSelectField, ComposerSelectTrigger } from './composer-select'

export function GatewayAgentPicker({ client, value, onChange, disabled, compact = false }: { client: GatewayControlClient; value: string; onChange: (value: string) => void; disabled: boolean; compact?: boolean }) {
  const [profiles, setProfiles] = useState<AgentProfile[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    client.agents(controller.signal).then(result => {
      if (!controller.signal.aborted) { setProfiles(result); setError('') }
    }).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [client])
  const agents = useMemo(() => profiles?.filter(agent => agent.archived_at === null) ?? [], [profiles])
  const selected = agents.find(agent => agent.id === value)
  if (compact) return <ComposerSelectField error={error ? `Agent list unavailable. ${error}` : undefined}>
    <Select value={selected?.id ?? value} disabled={disabled || !profiles || agents.length === 0} onValueChange={onChange}>
      <ComposerSelectTrigger aria-label="Conversation agent" className="max-w-40">
        <SelectValue placeholder="Loading agents…">{selected?.configuration.name}</SelectValue>
      </ComposerSelectTrigger>
      <SelectContent>
        {agents.map(agent => <SelectItem key={agent.id} value={agent.id}>{agent.configuration.name}</SelectItem>)}
      </SelectContent>
    </Select>
  </ComposerSelectField>
  return <div className="space-y-1">
    <Select value={selected?.id ?? value} disabled={disabled || !profiles || agents.length === 0} onValueChange={onChange}>
      <SelectTrigger aria-label="Conversation agent" className="w-64 max-w-full">
        <SelectValue placeholder="Loading agents…">{selected?.configuration.name}</SelectValue>
      </SelectTrigger>
      <SelectContent>{agents.map(agent => <SelectItem key={agent.id} value={agent.id}>{agent.configuration.name}</SelectItem>)}</SelectContent>
    </Select>
    {error && <p role="alert" className="text-xs text-destructive">Agent list unavailable. {error}</p>}
  </div>
}
