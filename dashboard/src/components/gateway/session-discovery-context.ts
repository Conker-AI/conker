import { createContext, useContext } from 'react'
import { useStore } from 'zustand'
import type { SessionDiscovery } from './session-discovery'

export const SessionDiscoveryContext = createContext<SessionDiscovery | null>(null)

export function useSessionDiscovery() {
  const discovery = useContext(SessionDiscoveryContext)
  if (!discovery) throw new Error('Chat discovery needs the authenticated workspace provider')
  return { ...useStore(discovery.store), refresh: discovery.refresh }
}
