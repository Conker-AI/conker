import type { GatewayTask } from '@/lib/gateway/activity'
import type { OwnerRequest } from '@/lib/gateway/owner'
import type { Proposal } from '@/lib/gateway/proposals'
import type { RuntimeSession } from '@/lib/gateway/runtime'

export type TodaySnapshot = {
  waiting: OwnerRequest[]
  activeTasks: GatewayTask[]
  conversations: RuntimeSession[]
  completedTasks: GatewayTask[]
  suggestions: Proposal[]
}

const newest = (left: string, right: string) => Date.parse(right) - Date.parse(left)

/** Bounded, server-authored return reasons. No urgency or productivity score is inferred here. */
export function buildTodaySnapshot(input: {
  requests: OwnerRequest[]; tasks: GatewayTask[]; sessions: RuntimeSession[]; proposals: Proposal[]
}): TodaySnapshot {
  return {
    waiting: input.requests.filter(item => item.status === 'pending' && item.reviewable)
      .sort((left, right) => newest(left.updatedAt, right.updatedAt)).slice(0, 3),
    activeTasks: input.tasks.filter(item => item.contentStatus === 'available' && item.archivedAt === null && ['planned', 'in_progress', 'blocked'].includes(item.status))
      .sort((left, right) => newest(left.updatedAt, right.updatedAt)).slice(0, 4),
    conversations: input.sessions.filter(item => item.status !== 'closed' && item.status !== 'forgotten')
      .sort((left, right) => newest(left.createdAt, right.createdAt)).slice(0, 4),
    completedTasks: input.tasks.filter(item => item.contentStatus === 'available' && item.archivedAt === null && item.status === 'completed')
      .sort((left, right) => newest(left.updatedAt, right.updatedAt)).slice(0, 3),
    suggestions: input.proposals.filter(item => item.state === 'open').sort((left, right) => right.createdAt - left.createdAt).slice(0, 3),
  }
}
