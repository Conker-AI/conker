/**
 * Why a job's run failed, in plain words, from the outcome code Pi keeps with the run. A failed run
 * that has no code (the job started and did not finish) gets the general line. Never raw codes.
 */
const reasons: Record<string, string> = {
  SOURCE_HIDDEN: 'The chat this job was made in is in the Trash or was forgotten, so the job did not run.',
  HELD_BACK: 'Your limits for what Conker may do on its own held this run back.',
  POLICY_DENIED: 'Your rules do not let this job do what it asked for.',
  APPROVAL_INVALID: 'The approval for this run no longer applied, so nothing ran.',
  LOCKED_DOWN: 'Conker is locked down, so nothing ran.',
  AGENT_REVOKED: 'The agent that runs this job lost its tool access, so nothing ran.',
  PUBLICATION_REQUIRED: 'The tool this job uses has no published version, so nothing ran.',
  PUBLICATION_MISMATCH: 'The tool this job uses changed since the job was saved, so nothing ran.',
  TOOL_UNAVAILABLE: 'The tool this job uses did not answer.',
  VALIDATION_ERROR: 'The tool refused the job’s settings, so nothing ran.',
}

export function failedRunReason(code: string | null): string {
  return (code && reasons[code]) || 'The job started but did not finish.'
}
