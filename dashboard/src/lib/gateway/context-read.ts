import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

export type MessagePolicy = 'exclude' | 'keep-exact' | 'allow-summary' | 'retrieve'

export type ContextSettings = {
  revision: number
  policy: { sessionInstructions: string; messagePolicies: Record<string, MessagePolicy>; budget: { contextWindowTokens: number; outputReserveTokens: number; otherInputTokens: number } } | null
  summary: { text: string | null; versions: number }
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const messagePolicies: readonly MessagePolicy[] = ['exclude', 'keep-exact', 'allow-summary', 'retrieve']

function safeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new GatewayError('validation')
  return value
}

function text(value: unknown, max = 16000): string {
  if (typeof value !== 'string' || value.length > max) throw new GatewayError('validation')
  return value
}

function messagePolicy(value: unknown): MessagePolicy {
  if (typeof value !== 'string' || !messagePolicies.includes(value as MessagePolicy)) throw new GatewayError('validation')
  return value as MessagePolicy
}

export function parseContextPolicy(value: unknown): Pick<ContextSettings, 'revision' | 'policy'> {
  if (!record(value)) throw new GatewayError('validation')
  const { revision, policy } = value as Record<string, unknown>

  const revisionNum = safeInteger(revision)

  if (policy === null) {
    return { revision: revisionNum, policy: null }
  }
  
  if (!record(policy)) throw new GatewayError('validation')
  const { sessionInstructions, messagePolicies: msgPolicies, budget } = policy as Record<string, unknown>
  
  if (typeof sessionInstructions !== 'string' || sessionInstructions.length > 16000) throw new GatewayError('validation')
  
  if (!record(msgPolicies)) throw new GatewayError('validation')
  const parsedMessagePolicies: Record<string, MessagePolicy> = {}
  for (const [key, val] of Object.entries(msgPolicies)) {
    parsedMessagePolicies[key] = messagePolicy(val)
  }
  
  if (!record(budget)) throw new GatewayError('validation')
  const { contextWindowTokens, outputReserveTokens, otherInputTokens } = budget as Record<string, unknown>
  
  return {
    revision: revisionNum,
    policy: {
      sessionInstructions,
      messagePolicies: parsedMessagePolicies,
      budget: {
        contextWindowTokens: safeInteger(contextWindowTokens),
        outputReserveTokens: safeInteger(outputReserveTokens),
        otherInputTokens: safeInteger(otherInputTokens),
      }
    }
  }
}

export function parseContextSummary(value: unknown): ContextSettings['summary'] {
  if (!record(value)) throw new GatewayError('validation')
  const { revision, summary, versions } = value as Record<string, unknown>

  safeInteger(revision)

  if (!Array.isArray(versions)) throw new GatewayError('validation')

  return {
    text: summary === null ? null : text(summary),
    versions: versions.length
  }
}

export function createContextReadClient(auth: Pick<GatewayAuthClient, 'request'>) {
  return {
    async read(sessionId: string, options?: { signal?: AbortSignal }): Promise<ContextSettings> {
      if (typeof sessionId !== 'string' || !sessionId) throw new GatewayError('validation')
      
      const encodedId = encodeURIComponent(sessionId)
      const [policyResponse, summaryResponse] = await Promise.all([
        auth.request(`/api/control/pi/context/${encodedId}`, options),
        auth.request(`/api/control/pi/context/${encodedId}/summary`, options)
      ])
      
      const policy = parseContextPolicy(policyResponse)
      const summary = parseContextSummary(summaryResponse)
      
      return {
        revision: policy.revision,
        policy: policy.policy,
        summary
      }
    }
  }
}