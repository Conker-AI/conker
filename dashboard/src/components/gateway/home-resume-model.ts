import type { GatewayTask } from '@/lib/gateway/activity'
import type { HistoryChat } from '@/lib/gateway/session-history'
import type { OpenedChat } from '@/lib/recent-chats'

/** At most this many cards in "Jump back in" (two rows of three on wide screens). */
export const RESUME_LIMIT = 6
/** Without a record of opened chats, this many of the newest chats stand in. */
export const RESUME_FALLBACK_CHATS = 3

export type ResumeKind = 'tool-draft' | 'workflow-draft' | 'message-draft' | 'chat' | 'task'
export type ResumeItem = { key: string; kind: ResumeKind; title: string; label: string; at: number; href: string }

/** An editor draft as ToolGate lists it, with the newest revision it published (null when never, undefined when unknown). */
export type ResumeEditorDraft = { id: string; name: string; kind: 'connector' | 'workflow'; revision: number; updatedAt: string; publishedRevision: number | null | undefined }
/** An unsent composer message: `sessionId` null is the new-chat composer. `updatedAt` is in seconds, as Pi stores it. */
export type ResumeMessageDraft = { sessionId: string | null; text: string; updatedAt: number | null }

export type ResumeInput = {
  editorDrafts: ResumeEditorDraft[]
  chats: HistoryChat[]
  opened: OpenedChat[]
  messageDrafts: ResumeMessageDraft[]
  tasks: GatewayTask[]
}

const parse = (value: string) => { const time = Date.parse(value); return Number.isFinite(time) ? time : 0 }
const chatTitle = (chat: HistoryChat) => chat.title ? `${chat.title}${chat.titleTruncated ? '…' : ''}` : 'Untitled chat'
const firstLine = (text: string) => { const line = text.trim().split('\n')[0].trim(); return line.length > 80 ? `${line.slice(0, 79)}…` : line }

/**
 * The chats "Jump back in" may offer: those opened in this browser that Pi still lists (newest
 * opened first), else the newest few. Forgotten, archived and trashed chats never come back.
 */
export function resumeChats(chats: HistoryChat[], opened: OpenedChat[]): { chat: HistoryChat; at: number }[] {
  const listed = new Map(chats.filter(chat => !chat.forgotten && !chat.archivedAt && !chat.trashedAt).map(chat => [chat.id, chat]))
  const known = opened.flatMap(item => listed.has(item.id) ? [{ chat: listed.get(item.id)!, at: item.at }] : [])
  if (known.length) return known.slice(0, RESUME_LIMIT)
  return [...listed.values()].sort((a, b) => parse(b.createdAt) - parse(a.createdAt)).slice(0, RESUME_FALLBACK_CHATS).map(chat => ({ chat, at: parse(chat.createdAt) }))
}

/**
 * One "where was I" list: unpublished tool and workflow edits, unsent messages, the last chats and
 * tasks still in progress, newest first. Built only from what the server returned; nothing is guessed.
 */
export function buildResume(input: ResumeInput, limit = RESUME_LIMIT): ResumeItem[] {
  const drafts: ResumeItem[] = input.editorDrafts
    .filter(draft => draft.publishedRevision === undefined || draft.publishedRevision === null || draft.publishedRevision < draft.revision)
    .map(draft => ({ key: `editor:${draft.id}`, kind: draft.kind === 'workflow' ? 'workflow-draft' as const : 'tool-draft' as const, title: draft.name,
      label: draft.kind === 'workflow' ? 'Workflow draft' : 'Tool draft', at: parse(draft.updatedAt), href: `/tools?draft=${encodeURIComponent(draft.id)}` }))
  const unsent = new Map(input.messageDrafts.filter(draft => draft.text.trim()).map(draft => [draft.sessionId, draft]))
  const chats: ResumeItem[] = resumeChats(input.chats, input.opened).map(({ chat, at }) => {
    const draft = unsent.get(chat.id), draftAt = draft?.updatedAt ? draft.updatedAt * 1000 : 0
    return { key: `chat:${chat.id}`, kind: draft ? 'message-draft' as const : 'chat' as const, title: chatTitle(chat), label: draft ? 'Unsent message' : 'Chat',
      at: Math.max(at, draftAt), href: `/chat?session=${encodeURIComponent(chat.id)}` }
  })
  const fresh = unsent.get(null)
  const newChat: ResumeItem[] = fresh ? [{ key: 'chat:new', kind: 'message-draft', title: firstLine(fresh.text), label: 'Unsent message',
    at: fresh.updatedAt ? fresh.updatedAt * 1000 : 0, href: '/chat' }] : []
  const tasks: ResumeItem[] = input.tasks
    .filter(task => task.contentStatus === 'available' && task.archivedAt === null && (task.status === 'in_progress' || task.status === 'blocked'))
    .map(task => ({ key: `task:${task.id}`, kind: 'task', title: task.outcome, label: task.status === 'blocked' ? 'Task · blocked' : 'Task in progress',
      at: parse(task.updatedAt), href: `/activity?tab=tasks&task=${encodeURIComponent(task.id)}` }))
  return [...drafts, ...newChat, ...chats, ...tasks].sort((a, b) => b.at - a.at || a.key.localeCompare(b.key)).slice(0, limit)
}

/** "Just now", "5 min ago", "3 h ago", "Yesterday", then the date. */
export function resumeAge(at: number, now = Date.now()): string {
  if (!at) return 'Earlier'
  const minutes = Math.floor((now - at) / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  if (at >= today.getTime()) return `${Math.floor(minutes / 60)} h ago`
  if (at >= today.getTime() - 86_400_000) return 'Yesterday'
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(at)
}
