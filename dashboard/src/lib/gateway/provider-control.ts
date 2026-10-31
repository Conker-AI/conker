import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

const providerId = z.enum(['openrouter', 'openai', 'anthropic', 'gemini', 'xai', 'mistral', 'deepseek', 'groq'])
// Every release reports these three; the direct providers only once its Pi reads their keys.
const firstProviders = ['openrouter', 'openai', 'anthropic'] as const
const revision = z.string().regex(/^credential_[0-9a-f]{32}$/)
const record = z.object({
  id: providerId, configured: z.boolean(), activeRevision: revision.nullable(), activeAt: z.string().max(64).nullable(),
  stagedRevision: revision.nullable(), stagedAt: z.string().max(64).nullable(),
  verificationStatus: z.enum(['unverified', 'verified', 'rejected', 'unavailable']).nullable(),
  verificationBasis: z.string().max(128).nullable(), verifiedAt: z.string().max(64).nullable(),
  verificationStale: z.boolean(), activationPending: z.boolean(), revokedRevisions: z.array(revision).max(100), secretIncluded: z.literal(false),
}).strict()
const status = z.object({ schemaVersion: z.literal(1), available: z.boolean(), secretsIncluded: z.literal(false), paidAllowed: z.boolean().nullable(), policyRecoveryRequired: z.boolean(), providers: z.array(record).max(providerId.options.length) }).strict().refine(value => {
  if (!value.available) return value.providers.length === 0 && value.paidAllowed === null
  const ids = new Set(value.providers.map(item => item.id))
  return value.paidAllowed !== null && ids.size === value.providers.length && firstProviders.every(id => ids.has(id))
})
const operation = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('stage'), provider: providerId, secret: z.string().min(8).max(4096).regex(/^[!-~]+$/), activeRevision: revision.nullable(), stagedRevision: revision.nullable() }).strict(),
  z.object({ operation: z.enum(['verify', 'activate', 'recover', 'discard']), provider: providerId, revision }).strict(),
  z.object({ operation: z.literal('record-revoked'), provider: providerId, revision, issuerConfirmed: z.literal(true) }).strict(),
  z.object({ operation: z.literal('paid-policy'), enabled: z.boolean(), expectedAllowed: z.boolean() }).strict(),
  z.object({ operation: z.literal('recover-paid-policy') }).strict(),
])
export type HostedProviderId = z.infer<typeof providerId>
export type ProviderCredential = z.infer<typeof record>
export type ProviderCredentialsStatus = z.infer<typeof status>
export type ProviderCredentialOperation = z.infer<typeof operation>

export function createProviderControlClient(auth: Pick<GatewayAuthClient, 'request'>) {
  function parse(value: unknown): ProviderCredentialsStatus {
    const parsed = status.safeParse(value)
    if (!parsed.success) throw new GatewayError('invalid-response')
    return parsed.data
  }
  return {
    async status(signal?: AbortSignal) { return parse(await auth.request('/api/host/providers', { signal })) },
    async apply(value: ProviderCredentialOperation, signal?: AbortSignal, onDispatch?: () => void) {
      const body = operation.safeParse(value)
      if (!body.success) throw new GatewayError('validation')
      return parse(await auth.request('/api/host/providers', { method: 'POST', body: body.data, signal, onDispatch }))
    },
  }
}
