/**
 * Development-only preview data for Home's "Jump back in": unsent composer messages in Pi's draft
 * shape, and a record of chats opened in this browser so the row has recent chats on a fresh preview.
 * `conker-fake-resume` = 'empty' leaves both out.
 */
import { readOpenedChats, rememberOpenedChat } from '@/lib/recent-chats'

type Json = Record<string, unknown>

export function previewComposerDrafts(now: () => number, chats: { week: string; sky: string; coach: string }): [string, Json][] {
  if (globalThis.sessionStorage?.getItem('conker-fake-resume') === 'empty') return []
  if (!readOpenedChats().length) {
    // Oldest first, so the week plan ends up the most recently opened.
    const opened = Date.now()
    rememberOpenedChat(chats.coach, opened - 26 * 3600_000)
    rememberOpenedChat(chats.sky, opened - 5 * 3600_000)
    rememberOpenedChat(chats.week, opened - 12 * 60_000)
  }
  const draft = (key: string, text: string, age: number): [string, Json] => [key, { schemaVersion: 1, session_id: key === 'new' ? null : key, task_id: null, content_status: 'available',
    revision: 1, text, updated_at: now() - age, model_id: null, skill_ids: [], think: false, research_mode: 'off', ...(key === 'new' ? { title: '', agent_id: null, privacy: {} } : {}) }]
  return [
    draft('new', 'Ask coach whether Saturday sparring moves to the small hall', 3 * 60),
    draft(chats.sky, 'And why is the sunset red but the', 2 * 3600),
  ]
}
