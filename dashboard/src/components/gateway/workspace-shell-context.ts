import { createContext, useContext } from 'react'
import type { ConversationView } from './conversation-view-list'

export const ConnectedShellContext = createContext<{
  tabsOpen: boolean; toggleTabs: () => void; openViewCount: number
  view: ConversationView | null; toggleView: (view: ConversationView) => void; showViews: boolean
} | null>(null)

export function useConnectedShell() { return useContext(ConnectedShellContext) }
