import { createContext, useContext } from 'react'

type Chrome = { actions: HTMLDivElement | null; setActions: (node: HTMLDivElement | null) => void }
export const WorkspaceChromeContext = createContext<Chrome | null>(null)
export function useWorkspaceChrome() { return useContext(WorkspaceChromeContext) }
