import { createContext, useContext } from 'react'

export const ConnectedShellContext = createContext<{
  tabsOpen: boolean; toggleTabs: () => void; openViewCount: number
  contextOpen: boolean; toggleContext: () => void; showContext: boolean
} | null>(null)

export function useConnectedShell() { return useContext(ConnectedShellContext) }
