import { useEffect, useMemo } from 'react'
import { useStore } from 'zustand'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { GatewaySearchClient } from '@/lib/gateway/search'
import type { GatewayRuntimeWorkspaceState } from './runtime-state'
import type { GatewaySourcePrivacyState } from './source-privacy'
import { createUniversalSearch } from './universal-search-state'

export function useUniversalSearch(client: GatewaySearchClient, auth: GatewayAuthStore, workspace: GatewayRuntimeWorkspaceState, privacy: GatewaySourcePrivacyState) {
  const search = useMemo(() => createUniversalSearch({ client, auth, workspace, privacy }), [client, auth, workspace, privacy])
  useEffect(() => { search.start(); return () => search.stop() }, [search])
  return { ...useStore(search.store), search }
}
