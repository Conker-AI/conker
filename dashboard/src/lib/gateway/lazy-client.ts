import { GatewayError } from './transport'

/**
 * Every member is an async method, or a group of them. Only those can wait for their code to load,
 * so a client with a synchronous member does not type-check as lazy.
 */
export type AsyncMembers<T> = {
  [K in keyof T]: T[K] extends (...args: never[]) => infer R ? (R extends Promise<unknown> ? T[K] : never) : T[K] extends object ? AsyncMembers<T[K]> : never
}

/**
 * A client whose code (and the schemas it parses with) loads on its first call, out of the first
 * bundle. `client.a.b(x)` waits for `load()` once, then calls the loaded `a.b(x)`. Members are the same
 * function on every read, so they are safe as React dependencies. A failed load is the same "can't reach
 * your server" error a failed request gives (nothing was sent) and is tried again on the next call.
 * `own` members are returned as they are: the synchronous parts the loaded client is given.
 */
export function lazyClient<T extends AsyncMembers<T>, O extends object = Record<never, never>>(load: () => Promise<T>, own?: O) {
  let pending: Promise<T> | null = null
  const ready = () =>
    (pending ??= load().catch((error: unknown) => {
      pending = null
      throw error instanceof GatewayError ? error : new GatewayError('network')
    }))
  const nodes = new Map<string, unknown>()
  const node = (path: readonly string[]): unknown => {
    const key = path.join('\u0000')
    const known = nodes.get(key)
    if (known) return known
    const member = new Proxy(() => undefined, {
      get(_target, name) {
        // Never a thenable: `await client` must not wait for a call.
        if (typeof name !== 'string' || name === 'then') return undefined
        if (path.length === 0 && own && Object.hasOwn(own, name)) return (own as Record<string, unknown>)[name]
        return node([...path, name])
      },
      apply(_target, _self, args: unknown[]) {
        return ready().then(client => {
          const owner = path.slice(0, -1).reduce<Record<string, unknown>>((value, name) => value[name] as Record<string, unknown>, client as Record<string, unknown>)
          return (owner[path[path.length - 1]] as (...values: unknown[]) => unknown).apply(owner, args)
        })
      },
    })
    nodes.set(key, member)
    return member
  }
  return {
    client: node([]) as T & O,
    /** Starts loading now (for the next likely tap); a failure here waits for the first call. */
    preload: () => {
      void ready().catch(() => undefined)
    },
  }
}
