import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
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
  const saved = value?.configuration
  const previousValue = useRef<Configuration | null>(null)
  const save = useCallback(async (next: Configuration) => {
    if (!value) return
    previousValue.current = saved || null
    setPending(true); setError('')
    try {
      const result = await client.saveModels(next, value.revision)
      setValue(result)

      // Show success toast with undo
      toastManager.add({
        type: 'success',
        title: 'Saved',
        timeout: 4000,
        actionProps: {
          children: 'Undo',
          onClick: () => {
            if (previousValue.current) {
              // Save the previous configuration against the new revision
              client.saveModels(previousValue.current, result.revision)
                .then(() => {
                  setValue({ ...result, configuration: previousValue.current })
                  notifyDone('Change undone')
                })
                .catch(() => {
                  // If undo fails, just show a notification
                  notifyDone('Could not undo change')
                })
            }
          }
        }
      })
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save model settings.') }
    finally { setPending(false) }
  }, [client, value, saved])
  const enabled = saved ? saved.models.filter(model => model.enabled && model.providerId !== 'decisions' && saved.providers.some(provider => provider.id === model.providerId && provider.enabled)) : []
  return <ModelsContext.Provider value={{ value, error, pending, enabled, save, reload: () => setRetry(count => count + 1) }}>{children}</ModelsContext.Provider>
}
