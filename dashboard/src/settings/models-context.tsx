import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { GatewayControlClient, OwnerModelSettings } from '@/lib/gateway/control'
import { gatewayError } from '@/lib/gateway/transport'
import { toastManager } from '@/components/ui/toast'
import { notifyDone } from '@/components/resilience/notify'
import { ModelsContext } from './models'

type Configuration = NonNullable<OwnerModelSettings['configuration']>

/** One read of the model configuration for every model row on the Settings screen. */
export function ModelsProvider({ client, children }: { client: GatewayControlClient; children: ReactNode }) {
  const [value, setValue] = useState<OwnerModelSettings | null>(null)
  const [error, setError] = useState(''), [pending, setPending] = useState(false), [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    client.models(controller.signal).then(next => { if (!controller.signal.aborted) { setValue(next); setError('') } })
      .catch(cause => { if (!controller.signal.aborted) setError(gatewayError(cause).message) })
    return () => controller.abort()
  }, [client, retry])
  const save = useCallback(async (next: Configuration) => {
    if (!value) return
    const before = value.configuration
    setPending(true); setError('')
    try {
      const result = await client.saveModels(next, value.revision)
      setValue(result)
      // Undo saves the configuration from before this save against the revision it produced.
      const undo = async () => {
        if (!before) return
        setPending(true); setError('')
        try { setValue(await client.saveModels(before, result.revision)); notifyDone('Change undone') }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not undo the change.') }
        finally { setPending(false) }
      }
      toastManager.add({ type: 'success', title: 'Saved', timeout: 4000, actionProps: { children: 'Undo', onClick: () => void undo() } })
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save model settings.') }
    finally { setPending(false) }
  }, [client, value])
  const saved = value?.configuration
  const enabled = saved ? saved.models.filter(model => model.enabled && model.providerId !== 'decisions' && saved.providers.some(provider => provider.id === model.providerId && provider.enabled)) : []
  return <ModelsContext.Provider value={{ value, error, pending, enabled, save, reload: () => setRetry(count => count + 1) }}>{children}</ModelsContext.Provider>
}
