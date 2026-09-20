import type { GatewayActivityClient, GatewayTask } from '@/lib/gateway/activity'
import type { GatewayRuntimeClient, RuntimeSessionDetail } from '@/lib/gateway/runtime'
import { hasActiveRuntimeTurn } from './runtime-state'

export type TaskSubmissionBinding = { taskId: string; taskExpectedRevision: number }
export type PreparedTaskDispatch = TaskSubmissionBinding & { sessionId: string; requestId: string; text: string; outcome: string; criteria: string[] }
export type TaskDispatchIntent = { taskId: string; sessionId: string; open: boolean; prepared?: PreparedTaskDispatch }

/** Known tombstones hide retained input during render, before effect-based cache cleanup. */
export function visibleTaskDispatchIntent(intent: TaskDispatchIntent | null, forgottenIds: readonly string[]): TaskDispatchIntent | null {
  return intent && (forgottenIds.includes(intent.sessionId) || !!intent.prepared && forgottenIds.includes(intent.prepared.sessionId)) ? null : intent
}

/** Propagate each canonical tombstone before a later read can fail or remain pending. */
export async function readTaskDispatchSources(taskId: string, activity: Pick<GatewayActivityClient, 'getTask'>, runtime: Pick<GatewayRuntimeClient, 'getSession'>, onForgotten: (sessionId: string) => void, signal: AbortSignal) {
  const task = await activity.getTask(taskId, { signal })
  if (task.contentStatus === 'forgotten') {
    onForgotten(task.sessionId)
    throw new Error('This task’s source was forgotten. Its input cannot be sent.')
  }
  const session = await runtime.getSession(task.sessionId, { signal })
  if (session.status === 'forgotten') {
    onForgotten(session.id)
    throw new Error('This task’s source was forgotten. Its input cannot be sent.')
  }
  return { task, session }
}

export function taskDispatchProblem(task: GatewayTask, session: RuntimeSessionDetail, expectedRevision?: number): string | null {
  if (task.contentStatus !== 'available' || session.status === 'forgotten') return 'This task’s source was forgotten. Its input cannot be sent.'
  if (task.sessionId !== session.id) return 'The task and conversation do not match. Reload the saved task.'
  if (expectedRevision !== undefined && task.revision !== expectedRevision) return 'This task changed after your review. Reload the task and review its current objective before sending.'
  if (task.archivedAt || task.status === 'completed' || task.status === 'cancelled') return 'Restore and reopen task tracking before requesting more work.'
  if (session.status !== 'open') return 'This task’s conversation is closed. Create a task in an open conversation to continue.'
  if (task.runIds.length >= 100) return 'This task already links 100 runs. Create a follow-up task before requesting more work.'
  if (hasActiveRuntimeTurn(session)) return 'This conversation has unresolved work. Review its saved turn before starting another request.'
  return null
}

export function prepareTaskDispatch(task: GatewayTask, session: RuntimeSessionDetail, requestId: string): PreparedTaskDispatch {
  const problem = taskDispatchProblem(task, session)
  if (problem) throw new Error(problem)
  const text = `Work on this saved task (${task.id}, revision ${task.revision}).\n\nDesired outcome:\n${task.outcome}\n\nCompletion criteria:\n${task.criteria.map((item, index) => `${index + 1}. ${item.text}`).join('\n')}\n\nReport what you completed, supporting evidence, and anything still unresolved. Task tracking remains owner-reviewed.`
  if ([...text].length > 16_000) throw new Error('The task input exceeds the conversation limit. Shorten the saved objective or criteria first.')
  return { taskId: task.id, taskExpectedRevision: task.revision, sessionId: task.sessionId, requestId, text, outcome: task.outcome, criteria: task.criteria.map(item => item.text) }
}
