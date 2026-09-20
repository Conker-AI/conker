import { createStore } from 'zustand/vanilla'
import type { GatewayActivityEvent, GatewayActivityRun, GatewayTask, GatewayTaskCreate, GatewayTaskStatus } from '@/lib/gateway/activity'

export type TaskDraft = { outcome: string; criteria: string; sessionId: string; parentTaskId: string; runIds: string[]; revision?: number; requestId?: string }
export type ReviewDraft = { taskId: string; sessionId: string; status: GatewayTaskStatus; revision: number; note: string; checked: string[] }
export type ActivityMutation = { key: string; kind: 'create' | 'edit' | 'review' | 'archive'; phase: 'pending' | 'unknown' | 'conflict'; taskId?: string; requestId?: string; revision?: number; input?: GatewayTaskCreate; checked?: boolean; notFound?: boolean }
export type ActivityDialog = { kind: 'create' } | { kind: 'edit'; taskId: string } | { kind: 'review'; taskId: string; status: GatewayTaskStatus }
export type ReferenceRunsState = { sessionId: string | null; runs: GatewayActivityRun[]; cursor: string | null; pending: boolean; error: string | null }
/** Rows, pagination and errors all belong to one source; changing source hides the old response immediately. */
export function visibleReferenceRuns(state: ReferenceRunsState, sessionId: string | undefined): ReferenceRunsState {
  return sessionId && state.sessionId === sessionId ? state : { sessionId: sessionId ?? null, runs: [], cursor: null, pending: !!sessionId, error: null }
}

export function createGatewayActivityWorkspaceState() {
  return createStore<{
    epoch: number; drafts: Record<string, TaskDraft>; reviews: Record<string, ReviewDraft>; dialog: ActivityDialog | null
    mutation: ActivityMutation | null; error: string | null; notice: string | null; reset: () => void
  }>((set, get) => ({ epoch: 0, drafts: {}, reviews: {}, dialog: null, mutation: null, error: null, notice: null,
    reset: () => set({ epoch: get().epoch + 1, drafts: {}, reviews: {}, dialog: null, mutation: null, error: null, notice: null }),
  }))
}
export type GatewayActivityWorkspaceState = ReturnType<typeof createGatewayActivityWorkspaceState>
export const taskStatusLabels: Record<GatewayTaskStatus, string> = { planned: 'Planned', in_progress: 'In progress', blocked: 'Blocked', completed: 'Completed', cancelled: 'Cancelled' }
export const activityLabel = (value: string) => value.replaceAll('_', ' ')
export const eventLabel = (event: GatewayActivityEvent) => activityLabel(event.kind)
export const isTerminalTask = (task: GatewayTask) => task.status === 'completed' || task.status === 'cancelled'
export const taskTitle = (task: GatewayTask) => task.contentStatus === 'forgotten' ? 'Forgotten task' : task.outcome
export const taskDraftKey = (taskId?: string) => taskId ? `edit:${taskId}` : 'create'
export const reviewDraftKey = (taskId: string, status: GatewayTaskStatus) => `${taskId}:${status}`
export function draftFromTask(task: GatewayTask): TaskDraft {
  return { outcome: task.outcome, criteria: task.criteria.map(item => item.text).join('\n'), sessionId: task.sessionId, parentTaskId: task.parentTaskId ?? '', runIds: [...task.runIds], revision: task.revision }
}
export function validateTaskDraft(draft: TaskDraft): string | null {
  const criteria = draft.criteria.split('\n').map(value => value.trim()).filter(Boolean)
  if (!draft.outcome.trim() || [...draft.outcome].length > 1000) return 'Add a desired outcome of 1–1,000 characters.'
  if (!criteria.length || criteria.length > 20 || criteria.some(value => [...value].length > 500) || new Set(criteria.map(value => value.toLocaleLowerCase())).size !== criteria.length) return 'Add 1–20 distinct criteria, up to 500 characters each.'
  if (!draft.sessionId) return 'Choose an open conversation for this task.'
  return null
}
export function eligibleTaskParents(tasks: GatewayTask[], sessionId: string, taskId?: string): GatewayTask[] {
  return tasks.filter(candidate => {
    if (candidate.id === taskId || candidate.sessionId !== sessionId || candidate.archivedAt || isTerminalTask(candidate) || candidate.contentStatus !== 'available') return false
    const seen = new Set<string>(); let current: GatewayTask | undefined = candidate
    while (current) {
      if (current.id === taskId || seen.has(current.id)) return false
      seen.add(current.id)
      current = tasks.find(item => item.id === current?.parentTaskId)
    }
    return true
  })
}
/** Privacy updates discard local text as soon as the canonical source is known forgotten. */
export function forgetActivityDrafts(store: GatewayActivityWorkspaceState, sessionIds: Set<string>, taskIds: Set<string>) {
  store.setState(state => ({
    drafts: Object.fromEntries(Object.entries(state.drafts).filter(([key, value]) => !sessionIds.has(value.sessionId) && !taskIds.has(key.replace(/^edit:/, '')))),
    reviews: Object.fromEntries(Object.entries(state.reviews).filter(([, value]) => !taskIds.has(value.taskId) && !sessionIds.has(value.sessionId))),
    mutation: state.mutation?.input && sessionIds.has(state.mutation.input.sessionId) ? { ...state.mutation, input: undefined } : state.mutation,
    dialog: state.dialog?.kind === 'create' && state.drafts.create && sessionIds.has(state.drafts.create.sessionId) || state.dialog && state.dialog.kind !== 'create' && taskIds.has(state.dialog.taskId) ? null : state.dialog,
  }))
}
export function maskForgottenTask(task: GatewayTask): GatewayTask {
  return { ...task, contentStatus: 'forgotten', outcome: '', criteria: [], statusNote: '', completedCriterionIds: [], changes: task.changes.map(event => ({ ...event, contentStatus: 'forgotten' })) }
}
