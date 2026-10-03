import { useEffect, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { GatewayControlClient, OwnerModelsConfiguration } from '@/lib/gateway/control'
import { AnimatedIconGlyph } from '@/components/icons/animated/animated-icon'
import { useAnimatedIconController } from '@/components/icons/animated/use-animated-icon-controller'
import { BrainIcon } from '@/components/icons/animated/icons'
import { ComposerSelectField, ComposerSelectTrigger } from './composer-select'

export function GatewayModelPicker({ client, value, onChange, disabled, manualRequired, compact = false, iconOnlyOnMobile = false }: { client: GatewayControlClient; value: string; onChange: (value: string) => void; disabled: boolean; manualRequired: boolean; compact?: boolean; iconOnlyOnMobile?: boolean }) {
  const [catalogue, setCatalogue] = useState<OwnerModelsConfiguration | null>(null)
  const [error, setError] = useState('')
  const { iconRef, animationProps } = useAnimatedIconController()
  useEffect(() => {
    const controller = new AbortController()
    client.models(controller.signal).then(result => { if (!controller.signal.aborted) setCatalogue(result.configuration) }).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [client])
  const models = catalogue?.models.filter(model => model.enabled && catalogue.providers.some(provider => provider.id === model.providerId && provider.enabled) && catalogue.roleSettings.roles.answer.eligibleModelIds.includes(model.id)) ?? []
  const select = <Select value={value || 'configured'} disabled={disabled || !catalogue} onValueChange={value => onChange(value === 'configured' ? '' : value)}>
    {compact ? <ComposerSelectTrigger aria-label="Answer model" className={iconOnlyOnMobile ? "w-9 px-0 sm:w-auto sm:max-w-48 sm:px-2 [&>svg:last-child]:hidden sm:[&>svg:last-child]:block" : "w-auto max-w-48"} {...animationProps}>{iconOnlyOnMobile && <span className="sm:hidden"><AnimatedIconGlyph icon={BrainIcon} iconRef={iconRef} size={16} /></span>}<span className={iconOnlyOnMobile ? "sr-only sm:not-sr-only" : undefined}><SelectValue placeholder="Loading models…" /></span></ComposerSelectTrigger>
      : <SelectTrigger aria-label="Answer model" className="w-64 max-w-full"><SelectValue placeholder="Loading models…" /></SelectTrigger>}
    <SelectContent>
      <SelectItem value="configured" disabled={manualRequired}>{manualRequired ? "Choose an answer model" : catalogue?.roleSettings.answerMode === 'router' ? (compact ? 'Automatic' : 'Automatic · configured router') : (compact ? 'Default model' : 'Configured default model')}</SelectItem>
      {models.map(model => <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>)}
    </SelectContent>
  </Select>
  if (compact) return <ComposerSelectField error={error ? `Model list unavailable. ${error}` : undefined}>{select}</ComposerSelectField>
  return <div className="space-y-1">
    {select}
    {error && <p role="alert" className="text-xs text-destructive">Model list unavailable. {error}</p>}
  </div>
}
