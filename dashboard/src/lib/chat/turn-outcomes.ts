import type { RuntimeTurn } from '@/lib/gateway/runtime'
import type { TurnCheck } from '@/components/gateway/runtime-state'

const unfinished = new Set(['awaiting_approval', 'awaiting_budget', 'acted_no_reply', 'action_in_progress', 'outcome_unknown'])
const terminal = new Set(['failed', 'interrupted', 'cancelled', 'canceled'])
const uncertainActions = new Set(['dispatching', 'in_progress', 'outcome_unknown', 'unknown'])
export type TurnDestination = 'run' | 'approval' | 'models' | 'tools'
/** Pi has parked this turn and waits for the owner or for a result. */
export const parkedTurn = (status: string) => unfinished.has(status)

/** Latest failure remains visible; older completed attempts don't compete with newer replies. */
export function visibleTurnOutcomes(turns: readonly RuntimeTurn[], answering = false): RuntimeTurn[] {
  const ordered = [...turns].sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id))
  const latest = ordered.at(-1)
  return ordered.filter(turn => unfinished.has(turn.status) || uncertainActions.has(turn.action?.state ?? '') || turn.status === 'interrupted' && turn.acted || !answering && turn === latest && terminal.has(turn.status))
}

/** Fixed public guidance, never arbitrary provider exceptions or request text. */
export function turnOutcomeCopy(turn: RuntimeTurn) {
  const uncertain = ['outcome_unknown', 'action_in_progress'].includes(turn.status) || uncertainActions.has(turn.action?.state ?? '')
  const consequence = uncertain ? 'The tool outcome is not confirmed. Sending the request again could repeat work.'
    : turn.acted ? turn.status === 'acted_no_reply' ? 'A tool action was recorded. Asking only for the reply will not repeat it.' : 'A tool action was recorded. Review its outcome before sending this request again.'
    : turn.action ? 'An action record exists. Review its saved status before repeating the request.'
    : 'No tool action is recorded for this turn. Your message is kept in this chat.'
  const modelUnavailable = turn.status === 'failed' && turn.detail === 'No configured eligible model could answer; no unapproved substitute was used.'
  const toolUnavailable = turn.status === 'failed' && ['model requested unavailable tool', 'The model requested an unavailable tool. This request was not executed.'].includes(turn.detail ?? '')
  const description = turn.status === 'awaiting_approval' ? 'Review the exact requested action, then continue after approving it.'
    : turn.status === 'awaiting_budget' ? 'Tool work is paused on a spending decision. Review the saved action before continuing.'
    : turn.status === 'acted_no_reply' ? turn.acted ? 'The turn has no completed reply. You can check its saved status or ask for the missing reply.' : 'The turn reports a missing reply, but its action record is incomplete. Check saved history before continuing.'
    : turn.status === 'action_in_progress' ? 'Conker is still waiting for the action’s result. Check what happened asks your tools about it without sending it again.'
    : turn.status === 'outcome_unknown' ? 'This action was running when something stopped, so its result was never confirmed. Check what happened asks your tools about it without sending it again.'
    : turn.status === 'interrupted' ? 'Work was interrupted before the turn finished. Check the saved outcome before continuing.'
    : ['cancelled', 'canceled'].includes(turn.status) ? 'Generation was stopped. Any messages and recorded work remain in this chat.'
    : modelUnavailable ? 'The configured model could not answer. Review model availability, or choose another answer model before sending a new request.'
    : toolUnavailable ? 'The model requested a tool that is unavailable in this chat. Review enabled tools or revise your request.'
    : 'Conker stopped before completing a reply. Check the saved outcome before sending a new request.'
  const title = ({ failed: 'Conker couldn’t finish the reply', interrupted: 'This turn was interrupted', cancelled: 'Response stopped', canceled: 'Response stopped', awaiting_approval: 'Waiting for your approval', awaiting_budget: 'Waiting for a spending decision', acted_no_reply: 'The reply is missing', action_in_progress: 'Action still in progress', outcome_unknown: 'Action outcome is unconfirmed' } as Record<string, string>)[turn.status]
  return { title, description, consequence, modelUnavailable, toolUnavailable }
}

export function sameTurnOutcome(a: RuntimeTurn, b: RuntimeTurn) {
  return a.id === b.id && a.status === b.status && a.acted === b.acted && a.endedAt === b.endedAt && a.approvalRequestId === b.approvalRequestId && a.action?.id === b.action?.id && a.action?.state === b.action?.state
}

/** Plain words for each step of checking an unconfirmed action; after the check, the saved turn's new status picks them. */
export function turnCheckCopy(check: TurnCheck): { title: string; description: string; status: string } {
  const description = `Conker ${check.phase === 'checking' ? 'is asking' : 'asked'} your tools what became of an action whose result was never confirmed.`
  if (check.phase === 'checking') return { title: 'Checking what happened', description, status: 'Checking with your tools… The action is not sent again.' }
  if (check.phase === 'failed') return { title: 'Couldn’t check what happened', description, status: `${check.reason} The action was not sent again.` }
  const status = ({
    complete: 'Done. Your tools had the result, and the reply about it is above. The action was not sent again.',
    acted_no_reply: 'Done, but the reply is missing. The action finished; ask only for the reply and it won’t run again.',
    outcome_unknown: 'Still unknown. Your tools have no final result for this action yet. Nothing was sent again; try again later, or review the saved action.',
    action_in_progress: 'Still running. Your tools say this action hasn’t finished yet. Nothing was sent again; check again in a minute.',
    awaiting_approval: 'Checked. This action needs your approval again before it can run.',
  } as Record<string, string>)[check.status ?? ''] ?? `Checked. This turn is now ${(check.status ?? 'saved').replaceAll('_', ' ')}.`
  return { title: 'Checked what happened', description, status }
}
