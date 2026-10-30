import { useEffect, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { GatewayControlClient, OwnerModelsConfiguration } from '@/lib/gateway/control'
import { AnimatedIconGlyph } from '@/components/icons/animated/animated-icon'
import { useAnimatedIconController } from '@/components/icons/animated/use-animated-icon-controller'
import { BrainIcon } from '@/components/icons/animated/icons'
import { ComposerSelectField, ComposerSelectTrigger } from './composer-select'
import { useServerSetting } from '@/settings/server-setting'
import { PlanUsageRing } from './plan-usage-ring'
import { useComposerMoreValue } from '@/components/chat/composer-more'

export function GatewayModelPicker({ client, value, onChange, disabled, manualRequired, compact = false, iconOnlyOnMobile = false }: { client: GatewayControlClient; value: string; onChange: (value: string) => void; disabled: boolean; manualRequired: boolean; compact?: boolean; iconOnlyOnMobile?: boolean }) {
  const [catalogue, setCatalogue] = useState<OwnerModelsConfiguration | null>(null)
  const [error, setError] = useState('')
  const { iconRef, animationProps } = useAnimatedIconController()
  // Settings > Home > Plan usage ring: in the message box, on Home, both or off.
  const ring = useServerSetting<'home' | 'composer' | 'both' | 'off'>('home.plan_ring', 'both')
  useEffect(() => {
    let controller: AbortController
    const load = () => {
      controller?.abort()
      const request = new AbortController()
      controller = request
      setCatalogue(null); setError('')
      client.models(request.signal).then(result => { if (!request.signal.aborted) setCatalogue(result.configuration) }).catch(error => { if (!request.signal.aborted) setError(error.message) })
    }
    load()
    const unsubscribe = client.subscribeModels?.(load)
    window.addEventListener('focus', load)
    return () => { controller.abort(); unsubscribe?.(); window.removeEventListener('focus', load) }
  }, [client])
  const models = catalogue?.models.filter(model => model.providerId !== 'decisions' && model.enabled && catalogue.providers.some(provider => provider.id === model.providerId && provider.enabled) && catalogue.roleSettings.roles.answer.eligibleModelIds.includes(model.id)) ?? []

  // Determine plan provider for selected model
  const selectedModelId = value || catalogue?.roleSettings.roles.answer.modelId || ''
  const selectedModel = models.find(model => model.id === selectedModelId)
  let planProvider: 'claude' | 'chatgpt' | null = null
  if (selectedModel?.providerId === 'claude-code') planProvider = 'claude'
  else if (selectedModel?.providerId === 'chatgpt') planProvider = 'chatgpt'
  // In the composer, More names a chosen model, or that one must be chosen; the configured default needs no mention.
  useComposerMoreValue('model', value ? models.find(model => model.id === value)?.name ?? (catalogue ? 'Model unavailable' : value) : manualRequired ? 'Choose a model' : null)

  const select = <Select value={value || 'configured'} disabled={disabled || !catalogue} onValueChange={value => { if (value !== null) onChange(value === 'configured' ? '' : value) }} items={[{ value: "configured", label: manualRequired ? "Choose an answer model" : catalogue?.roleSettings.answerMode === 'router' ? (compact ? 'Automatic' : 'Automatic · configured router') : (compact ? 'Default model' : 'Configured default model') }, ...models.map((model) => ({ value: model.id, label: model.name })), ...(value && !models.some(model => model.id === value) ? [{ value: value, label: "Selected model unavailable" }] : [])]}>
    {compact ? <ComposerSelectTrigger aria-label="Answer model" className={iconOnlyOnMobile ? "w-9 px-0 sm:w-auto sm:max-w-48 sm:px-2 [&>svg:last-child]:hidden sm:[&>svg:last-child]:block" : "w-auto max-w-48"} {...animationProps}>{iconOnlyOnMobile && <span className="sm:hidden"><AnimatedIconGlyph icon={BrainIcon} iconRef={iconRef} size={16} /></span>}<span className={iconOnlyOnMobile ? "sr-only sm:not-sr-only" : undefined}><SelectValue placeholder="Loading models…" /></span></ComposerSelectTrigger>
      : <SelectTrigger aria-label="Answer model" className="w-64 max-w-full"><SelectValue placeholder="Loading models…" /></SelectTrigger>}
    <SelectContent>
      <SelectItem value="configured" disabled={manualRequired}>{manualRequired ? "Choose an answer model" : catalogue?.roleSettings.answerMode === 'router' ? (compact ? 'Automatic' : 'Automatic · configured router') : (compact ? 'Default model' : 'Configured default model')}</SelectItem>
      {models.map(model => <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>)}
      {value && !models.some(model => model.id === value) && <SelectItem value={value} disabled>Selected model unavailable</SelectItem>}
    </SelectContent>
  </Select>
  if (compact) return <ComposerSelectField error={error ? `Model list unavailable. ${error}` : undefined}>
    <div className="flex items-center gap-1">
      {select}
      {planProvider && (ring === 'composer' || ring === 'both') && <PlanUsageRing client={client} provider={planProvider} />}
    </div>
  </ComposerSelectField>
  return <div className="space-y-1">
    {select}
    {error && <p role="alert" className="text-xs text-destructive-foreground">Model list unavailable. {error}</p>}
  </div>
}
