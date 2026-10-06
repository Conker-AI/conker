export const plainStatus = (value: string) => ({
  ok: 'Ready',
  ready: 'Ready',
  busy: 'Busy',
  pending: 'Waiting',
  not_configured: 'Not set up',
  unavailable: 'Unavailable',
  degraded: 'Needs attention',
  error: 'Needs attention',
  failed: 'Failed',
  completed: 'Completed',
  skipped: 'Skipped',
  in_progress: 'In progress',
  awaiting_approval: 'Waiting for your OK',
  acted_no_reply: 'Done, reply missing',
  action_in_progress: 'Action in progress',
  outcome_unknown: 'Result unknown',
  interrupted: 'Interrupted',
  forgotten: 'Source removed',
  preparation_failed: 'Did not start',
  preparation_interrupted: 'Did not start',
  preparing: 'Getting ready',
  approved: 'Approved',
  rejected: 'Declined',
  expired: 'Expired',
  CONFIRMATION_REQUIRED: 'Waiting for your OK',
  OUTCOME_UNKNOWN: 'Result unknown',
  IN_PROGRESS: 'In progress',
  OK: 'Completed',
} as Record<string, string>)[value] ?? value.replaceAll('_', ' ').replaceAll('-', ' ')

export function memoryRetrievalSummary(retrieval: NonNullable<RuntimeMemory['retrieval']>): string {
  const count = `${retrieval.records} ${retrieval.records === 1 ? 'record' : 'records'} supplied`
  return retrieval.status === 'ok' ? `Memory · ${count}` : `Memory · ${plainStatus(retrieval.status)} · ${count}`
}
import type { RuntimeMemory } from '@/lib/gateway/runtime'
