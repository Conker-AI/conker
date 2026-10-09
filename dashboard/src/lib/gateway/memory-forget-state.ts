import { gatewayError } from './transport'

/** Fixed operation guidance; server error text never becomes product copy. */
export function memoryForgetFailure(error: unknown) {
  const problem = gatewayError(error)
  const reset = problem.code === 'revision_conflict' || problem.code === 'not_found'
  const messages = {
    work_active: 'Wait for the current reply or preparation to finish, then try again. Nothing was forgotten.',
    forget_in_progress: 'This forget request is already being checked. Wait for it to finish, then check the same request.',
    forget_pending: 'A previous forget request needs confirmation. Check it in the recovery notice above before forgetting another memory.',
    request_conflict: 'This request does not match the saved forget operation or its memory configuration. Check the previous request with its original configuration.',
    revision_conflict: 'This memory changed since you reviewed it. Review its current version before forgetting.',
    not_found: 'This memory is no longer available. Refresh the memory list.',
    not_configured: 'Memory forgetting is not configured on this server. Restore the original memory connection before checking a previous request.',
    unavailable: 'The memory service declined the request. Check the connection and access settings before trying again.',
    outcome_unknown: 'The forget outcome is not confirmed. Check the same request; memory recall stays paused until it is resolved.',
    invalid_receipt: 'The server could not confirm the forget receipt. Check the same request; memory recall stays paused until it is resolved.',
  }
  const message = problem.code && problem.code in messages ? messages[problem.code as keyof typeof messages]
    : ['network', 'aborted', 'invalid-response', 'dependency'].includes(problem.kind)
      ? 'The forget outcome is not confirmed. Check the same request before starting another deletion.' : problem.message
  return { message, reset, privateUnavailable: ['browser-expired', 'session-changed', 'upstream-denied'].includes(problem.kind) }
}
