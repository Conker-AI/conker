import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

/** Things Conker noticed and offers to take on. Deciding records a preference; nothing runs. */
export type ProposalDecision = 'accept' | 'decline' | 'never'
export type ProposalState = 'open' | 'accepted' | 'declined' | 'never'
export type ProposalEvidence =
  | { messageId: string; available: true; sessionId: string; excerpt: string; createdAt: number }
  | { messageId: string; available: false }
export type Proposal = {
  id: string; title: string; noticed: string; suggestion: string; ifApproved: string
  evidence: ProposalEvidence[]; state: ProposalState; createdAt: number; decidedAt: number | null
}

const fail = (): never => { throw new GatewayError('invalid-response') }
const ids = /^[A-Za-z0-9_-]{1,200}$/
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail()
const text = (value: unknown, max: number): string => typeof value === 'string' && value.length <= max ? value : fail()
const id = (value: unknown): string => typeof value === 'string' && ids.test(value) ? value : fail()
const time = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fail()
const states = new Set<ProposalState>(['open', 'accepted', 'declined', 'never'])

function evidence(value: unknown): ProposalEvidence {
  const row = record(value)
  if (row.available === false) return { messageId: id(row.messageId), available: false }
  if (row.available !== true) return fail()
  return { messageId: id(row.messageId), available: true, sessionId: id(row.sessionId), excerpt: text(row.excerpt, 400), createdAt: time(row.createdAt) }
}

export function parseProposal(value: unknown): Proposal {
  const row = record(value)
  if (row.grantsExecutionAuthority !== false) return fail()
  const state = row.state
  if (typeof state !== 'string' || !states.has(state as ProposalState)) return fail()
  if (!Array.isArray(row.evidence) || !row.evidence.length || row.evidence.length > 10) return fail()
  return {
    id: id(row.id), title: text(row.title, 200), noticed: text(row.noticed, 1000), suggestion: text(row.suggestion, 1000),
    ifApproved: text(row.ifApproved, 1000), evidence: row.evidence.map(evidence), state: state as ProposalState,
    createdAt: time(row.createdAt), decidedAt: row.decidedAt === null ? null : time(row.decidedAt),
  }
}

export function createGatewayProposalClient(auth: Pick<GatewayAuthClient, 'request'>) {
  return {
    async list(options: { signal?: AbortSignal } = {}): Promise<Proposal[]> {
      const response = record(await auth.request('/api/pi/proposals', { query: { state: 'open', limit: 50 }, signal: options.signal }))
      if (!Array.isArray(response.proposals) || response.proposals.length > 50) return fail()
      return response.proposals.map(parseProposal)
    },
    async decide(proposalId: string, decision: ProposalDecision): Promise<Proposal> {
      if (!ids.test(proposalId) || !['accept', 'decline', 'never'].includes(decision)) throw new GatewayError('validation')
      const result = parseProposal(await auth.request(`/api/pi/proposals/${proposalId}/decision`, { method: 'POST', body: { decision } }))
      if (result.id !== proposalId || result.state === 'open') return fail()
      return result
    },
  }
}
export type GatewayProposalClient = ReturnType<typeof createGatewayProposalClient>
