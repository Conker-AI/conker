import type { Client } from 'openapi-fetch'
import type { z } from 'zod'
import type { paths } from '../api/generated/pi'
import type { GatewayAuthClient } from './auth'
import { GatewayError, type GatewayRequest } from './transport'

/**
 * A typed client for Pi's routes, generated from Pi's OpenAPI (src/lib/api/generated/pi.d.ts) by
 * openapi-fetch. Paths, path parameters, query and body are checked against Pi at compile time.
 *
 * Nothing leaves through openapi-fetch's own fetch: one middleware hands every call to the signed-in
 * auth client (auth.request), so the CSRF header, same-origin credentials, the password step, the
 * route allowlist, the size limits and GatewayError are exactly those of every other gateway call.
 * openapi-fetch itself loads on the first call, so it stays out of the first screen's bundle.
 */
export type PiClient = Pick<Client<paths>, 'GET' | 'POST' | 'PUT'>

// Every Pi id in a path: a letter or digit first, so a value can never be '.', '..' or a path.
const segment = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/

function refuse(): never {
  throw new GatewayError('validation')
}

/** Pydantic always sends fields with defaults, though the generator marks them optional; strict wire schemas may also leave fields optional. */
type Sent<T> = T extends readonly (infer U)[] ? Sent<U>[] : T extends object ? { [K in keyof T]-?: Sent<Exclude<T[K], undefined>> } : T
/** Each side accepts the other: Pi's reply fits the dashboard schema and nothing the schema needs is missing from Pi. */
export type Same<A, B> = [Sent<A>] extends [Sent<B>] ? ([Sent<B>] extends [Sent<A>] ? true : false) : false

/** openapi-fetch's Request, keeping the caller's own signal (or none) to hand on unchanged. */
class PiRequest extends Request {
  readonly callerSignal: AbortSignal | undefined
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(input, init)
    this.callerSignal = init?.signal ?? undefined
  }
}

/** `prefix` is where the gateway serves Pi's routes to the browser: the owner's control routes by default. */
export function createPiClient(auth: Pick<GatewayAuthClient, 'request'>, prefix: '/api/control/pi' | '/api/pi' = '/api/control/pi'): PiClient {
  let loaded: Promise<Client<paths>> | undefined
  // A chunk that cannot load means the server could not be reached; nothing was sent.
  const load = () =>
    (loaded ??= import('openapi-fetch').then(
      module => build(module.default, auth, prefix),
      () => Promise.reject(new GatewayError('network')),
    ))
  // Each method is openapi-fetch's own, typed by it, called once the module is in.
  const forward = <M extends keyof PiClient>(method: M) => ((url: string, init?: object) => load().then(client => (client[method] as (url: string, init?: object) => Promise<unknown>)(url, init))) as unknown as PiClient[M]
  return { GET: forward('GET'), POST: forward('POST'), PUT: forward('PUT') }
}

function build(createClient: typeof import('openapi-fetch').default, auth: Pick<GatewayAuthClient, 'request'>, prefix: string): Client<paths> {
  // The origin is only there so openapi-fetch can build its Request; that Request is never sent.
  const client = createClient<paths>({ baseUrl: 'https://pi.invalid', fetch: refuse, Request: PiRequest })
  client.use({
    async onRequest({ request, schemaPath, params }) {
      if (params.header !== undefined || params.cookie !== undefined) refuse()
      const path =
        prefix +
        schemaPath.replace(/\{([^{}]+)\}/g, (_, name: string) => {
          const value = params.path?.[name]
          return typeof value === 'string' && segment.test(value) ? value : refuse()
        })
      const method = request.method
      if (method !== 'GET' && method !== 'POST' && method !== 'PUT') refuse()
      // The gateway takes a JSON object on every write; a Pi route without a body gets an empty one.
      const text = method === 'GET' ? '' : await request.text()
      const body = method === 'GET' ? undefined : text ? (JSON.parse(text) as Record<string, unknown>) : {}
      // Query values go to the transport as the caller typed them; it checks every key and value.
      const query = params.query as GatewayRequest['query']
      const value = await auth.request(path, {
        ...(method === 'GET' ? {} : { method }),
        ...(query === undefined ? {} : { query }),
        ...(body === undefined ? {} : { body }),
        signal: request instanceof PiRequest ? request.callerSignal : refuse(),
      })
      return new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } })
    },
  })
  return client
}

/**
 * The data of a Pi call, checked by the dashboard's strict schema. The schema must accept exactly what
 * Pi's OpenAPI says the route sends (compile error otherwise); routes Pi types as `unknown` take any.
 * The binding is on the schema's input, what Pi sends, so a schema that fills defaults still binds.
 */
export async function piData<D, S extends z.ZodType>(call: Promise<{ data?: D; error?: unknown }>, schema: S & (unknown extends D ? unknown : Same<z.input<S>, D> extends true ? unknown : never)): Promise<z.output<S>> {
  const { data, error } = await call
  if (error !== undefined) throw new GatewayError('invalid-response')
  const result = schema.safeParse(data)
  if (!result.success) throw new GatewayError('invalid-response')
  return result.data
}
