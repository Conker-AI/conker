import { createContext, useContext, type ReactNode } from 'react'
import type { ConversationView } from './conversation-view-list'

export const ConnectedShellContext = createContext<{
  view: ConversationView | null; toggleView: (view: ConversationView) => void; showViews: boolean
  /** The open conversation view, shown in place under the chat bar. */
  panel: ReactNode
} | null>(null)

export function useConnectedShell() { return useContext(ConnectedShellContext) }
