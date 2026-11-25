// Where a change request is, without its wire schemas: the sidebar's Inbox count reads it in the first bundle.
import type { ChangeRequest, ToolDraftRequest } from './change-requests'

export type ToolDraftStatus = 'drafting' | 'ready' | 'failed' | 'needs_detail'

/** Where a tool request is: Conker drafting it, asking him something, a draft ready to review, or a failed attempt. */
export function toolDraftStatus(request: ToolDraftRequest): ToolDraftStatus {
  const status = request.payload.status
  return status === 'drafting' || status === 'failed' || status === 'needs_detail' ? status : 'ready'
}

/** The drafter's question, when it asked one: it waits for his answer. */
export const isAsking = (request: ChangeRequest) => request.kind === 'tool_draft' && toolDraftStatus(request) === 'needs_detail'

/** Conker is still working on it: nothing to decide yet. */
export const isDrafting = (request: ChangeRequest) => request.kind === 'tool_draft' && toolDraftStatus(request) === 'drafting'
