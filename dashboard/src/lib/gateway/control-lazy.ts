import type { GatewayAuthClient } from './auth'
import type { GatewayControlClient } from './control'
import { lazyClient } from './lazy-client'

type ControlAuth = Pick<GatewayAuthClient, 'request' | 'audio' | 'getSession' | 'download' | 'upload'>

/**
 * The owner control client with its code and wire schemas (and zod) out of the first bundle: the chat
 * list and chat need none of it to show. It loads on the first call, or earlier through `preload`.
 * Model listeners stay here, so subscribing never waits.
 */
export function createLazyGatewayControlClient(auth: ControlAuth, onCurrentSessionRevoked: () => void): { control: GatewayControlClient; preload: () => void } {
  const modelListeners = new Set<() => void>()
  const own = {
    subscribeModels(listener: () => void) {
      modelListeners.add(listener)
      return () => {
        modelListeners.delete(listener)
      }
    },
  }
  const { client, preload } = lazyClient<Omit<GatewayControlClient, 'subscribeModels'>, typeof own>(() => import('./control').then(module => module.createGatewayControlClient(auth, onCurrentSessionRevoked, modelListeners)), own)
  return { control: client, preload }
}
