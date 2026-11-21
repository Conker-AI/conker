import { createStore } from 'zustand/vanilla'

/**
 * What the app shows of "Refresh everything", kept apart from the logic (refresh-store.ts) so the
 * small readers in the shell can follow it without loading the logic in the first download.
 */
export type RefreshStatus = 'idle' | 'refreshing' | 'done' | 'error'
/** What a finished refresh could not do, in words the button can show: never an error by itself. */
export type RefreshNote = 'none' | 'update-unchecked' | 'update-slow'

export type RefreshState = {
  /** Keys the routed screens: a change remounts them, so they read again. */
  epoch: number
  /** Goes up on every run that should nudge the shell readers (Inbox count, look, setup, chat). */
  reads: number
  status: RefreshStatus
  /** The last manual refresh that read everything; never moves on a failed one. */
  lastDoneAt: number | null
  note: RefreshNote
  /** The release Pi offered after the last check, if any. */
  updateFound: string | null
  /** The server serves a newer dashboard than this window is running. */
  newBuild: boolean
}

export const initialRefreshState: RefreshState = { epoch: 0, reads: 0, status: 'idle', lastDoneAt: null, note: 'none', updateFound: null, newBuild: false }
export const createRefreshState = () => createStore<RefreshState>(() => ({ ...initialRefreshState }))
export const refreshState = createRefreshState()
