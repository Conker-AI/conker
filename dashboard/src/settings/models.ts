import { createContext, useContext } from 'react'
import type { OwnerModelSettings } from '@/lib/gateway/control'

type Configuration = NonNullable<OwnerModelSettings['configuration']>
export type ModelsState = {
  value: OwnerModelSettings | null; error: string; pending: boolean
  /** Models that are on, with their provider on: what a role may use. */
  enabled: Configuration['models']
  save: (next: Configuration) => Promise<void>
  reload: () => void
}

export const ModelsContext = createContext<ModelsState | null>(null)

export function useModels(): ModelsState {
  const state = useContext(ModelsContext)
  if (!state) throw new Error('useModels needs a ModelsProvider')
  return state
}
