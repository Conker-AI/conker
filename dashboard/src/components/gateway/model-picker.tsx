import { useEffect, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { GatewayControlClient, OwnerModelsConfiguration } from '@/lib/gateway/control'

export function GatewayModelPicker({ client, value, onChange, disabled, manualRequired }: { client: GatewayControlClient; value: string; onChange: (value: string) => void; disabled: boolean; manualRequired: boolean }) {
  const [catalogue, setCatalogue] = useState<OwnerModelsConfiguration | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    client.models(controller.signal).then(result => { if (!controller.signal.aborted) setCatalogue(result.configuration) }).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [client])
  const models = catalogue?.models.filter(model => model.enabled && catalogue.providers.some(provider => provider.id === model.providerId && provider.enabled) && catalogue.roleSettings.roles.answer.eligibleModelIds.includes(model.id)) ?? []
  return <div className="space-y-1">
    <Select value={value || 'configured'} disabled={disabled || !catalogue} onValueChange={value => onChange(value === 'configured' ? '' : value)}>
      <SelectTrigger aria-label="Answer model" className="max-w-full w-64"><SelectValue placeholder="Loading models…" /></SelectTrigger><SelectContent>
        <SelectItem value="configured" disabled={manualRequired}>{manualRequired ? "Choose an answer model" : catalogue?.roleSettings.answerMode === 'router' ? 'Automatic · configured router' : 'Configured default model'}</SelectItem>
        {models.map(model => <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>)}
      </SelectContent>
    </Select>
    {error && <p role="alert" className="text-xs text-destructive">Model list unavailable. {error}</p>}
  </div>
}
