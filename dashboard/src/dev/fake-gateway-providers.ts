import { GatewayError } from '@/lib/gateway/transport'

type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST'; body?: Json; onDispatch?: () => void }

/** Preview-only provider credential status; scenarios come from sessionStorage, nothing leaves the browser. */
export function createFakeProviderCredentials() {
  const credentialStatus = { schemaVersion: 1, available: true, secretsIncluded: false, paidAllowed: false, policyRecoveryRequired: false, providers: ['openrouter', 'openai', 'anthropic'].map(id => ({ id, configured: false, activeRevision: null, activeAt: null, stagedRevision: null as string | null, stagedAt: null, verificationStatus: null as string | null, verificationBasis: null, verifiedAt: null, verificationStale: false, activationPending: false, revokedRevisions: [], secretIncluded: false })) }
  return async function handle(method: string, options: Request, fail: (status: number) => never): Promise<Json> {
    const scenario = globalThis.sessionStorage?.getItem('conker-fake-credentials')
    if (scenario) {
      if (method === 'GET' && scenario === 'read-failure') return fail(503)
      if (method === 'GET' && scenario === 'read-timeout') return new Promise<Json>(() => { /* Isolated read deadline, no external provider. */ })
      if (method === 'GET' && scenario === 'slow-read') await new Promise(resolve => setTimeout(resolve, 2000))
      if (method === 'POST') {
        options.onDispatch?.()
        if (scenario === 'operation-timeout') return new Promise<Json>(() => { /* Isolated dispatch deadline. */ })
        if (options.body?.operation === 'paid-policy') credentialStatus.paidAllowed = options.body.enabled === true
        if (options.body?.operation === 'stage') {
          const record = credentialStatus.providers.find(row => row.id === options.body?.provider)
          if (record) { record.stagedRevision = `credential_${'a'.repeat(32)}`; record.verificationStatus = 'unverified' }
        }
        if (scenario === 'lost-response') return fail(503)
      }
      return structuredClone(credentialStatus)
    }
    if (method !== 'GET') throw new GatewayError('dependency', 503)
    return { schemaVersion: 1, available: false, secretsIncluded: false, paidAllowed: null, policyRecoveryRequired: false, providers: [] }
  }
}
