import { createStore } from 'zustand/vanilla'
import { GatewayError, gatewayError } from './transport'
import type { GatewayOperationReview } from './operation-review'

export type { GatewayOperationReview } from './operation-review'
export type GatewayVerificationState = { challenge: (GatewayOperationReview & { id: number }) | null; pending: boolean; error: GatewayError | null; submit: (password: string) => Promise<boolean>; cancel: () => void }
type Challenge = { id: number; review: GatewayOperationReview; verify: (password: string, signal: AbortSignal) => Promise<string>; controller: AbortController; resolve: (token: string) => void; reject: (error: GatewayError) => void; detach: () => void }
export type GatewayVerificationPrompt = { request: (review: GatewayOperationReview, verify: Challenge['verify'], signal?: AbortSignal) => Promise<string>; cancelAll: () => void }

export function createGatewayVerificationStore() {
  let nextId = 0
  let current: Challenge | null = null
  const queue: Challenge[] = []
  const store = createStore<GatewayVerificationState>(() => ({ challenge: null, pending: false, error: null,
    submit: async password => {
      const challenge = current
      if (!challenge || store.getState().pending) return false
      if (typeof password !== 'string' || !password.length || [...password].length > 1024) { store.setState({ error: new GatewayError('validation') }); return false }
      store.setState({ pending: true, error: null })
      try {
        const token = await challenge.verify(password, challenge.controller.signal)
        if (current !== challenge || challenge.controller.signal.aborted) return false
        challenge.detach(); current = null; challenge.resolve(token); showNext()
        return true
      } catch (error) {
        if (current === challenge) store.setState({ pending: false, error: gatewayError(error) })
        return false
      }
    },
    cancel: () => { if (current) cancel(current) },
  }))
  function showNext() {
    current = queue.shift() ?? null
    store.setState({ challenge: current ? { ...current.review, details: [...current.review.details], id: current.id } : null, pending: false, error: null })
  }
  function cancel(challenge: Challenge) {
    challenge.controller.abort(); challenge.detach(); challenge.reject(new GatewayError('verification-cancelled'))
    if (current === challenge) { current = null; showNext() }
    else { const index = queue.indexOf(challenge); if (index >= 0) queue.splice(index, 1) }
  }
  const prompt: GatewayVerificationPrompt = {
    request(review, verify, signal) {
      if (signal?.aborted) return Promise.reject(new GatewayError('verification-cancelled'))
      return new Promise((resolve, reject) => {
        const challenge: Challenge = { id: ++nextId, review, verify, controller: new AbortController(), resolve, reject, detach: () => signal?.removeEventListener('abort', abort) }
        const abort = () => cancel(challenge)
        signal?.addEventListener('abort', abort, { once: true })
        queue.push(challenge); if (!current) showNext()
      })
    },
    cancelAll() {
      const pending = [...queue]; queue.length = 0
      if (current) pending.unshift(current)
      current = null
      for (const challenge of pending) { challenge.controller.abort(); challenge.detach(); challenge.reject(new GatewayError('verification-cancelled')) }
      store.setState({ challenge: null, pending: false, error: null })
    },
  }
  return Object.assign(store, prompt)
}
export type GatewayVerificationStore = ReturnType<typeof createGatewayVerificationStore>
