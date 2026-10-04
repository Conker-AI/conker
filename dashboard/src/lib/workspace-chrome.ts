import { createContext, useContext, type Dispatch, type SetStateAction } from 'react'

type Chrome = {
  actions: HTMLDivElement | null; setActions: (node: HTMLDivElement | null) => void
  search: HTMLDivElement | null; setSearch: (node: HTMLDivElement | null) => void
  searchOwner: string | null; setSearchOwner: Dispatch<SetStateAction<string | null>>
  compactSearch: boolean; setCompactSearch: (compact: boolean) => void
}
export const WorkspaceChromeContext = createContext<Chrome | null>(null)
export function useWorkspaceChrome() { return useContext(WorkspaceChromeContext) }
export const UniversalSearchContext = createContext<((query?: string, opener?: HTMLElement | null) => void) | null>(null)
