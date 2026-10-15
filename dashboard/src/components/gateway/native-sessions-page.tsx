import { useSearchParams } from 'react-router-dom'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { GatewayControlClient } from '@/lib/gateway/control'
import { WorkspaceChoice } from '@/components/design-system'
import { GatewayNativeSessionsWorkspace } from './native-sessions-workspace'
import { GatewayCodexSessionsWorkspace } from './codex-sessions-workspace'
import { useNativeProviderFocus } from './native-provider-focus'

export function GatewayNativeSessionsPage({ control, authStore }: { control: GatewayControlClient; authStore: GatewayAuthStore }) {
  const [params, setParams] = useSearchParams(), provider = params.get('provider') === 'codex' ? 'codex' : 'claude', archived = params.get('archived') === 'true'
  const focus = useNativeProviderFocus(control, authStore, provider)
  const providerControl = <WorkspaceChoice label="Native provider" value={provider} options={[{ value: 'claude', label: 'Claude Code' }, { value: 'codex', label: 'Codex' }]} onValueChange={value => { if (!focus.changing(value)) return; const next = new URLSearchParams(params); next.set('provider', value); next.delete('archived'); setParams(next) }} />
  return provider === 'claude' ? <GatewayNativeSessionsWorkspace key="claude" client={control.nativeSessions} authStore={authStore} providerControl={providerControl} /> : <GatewayCodexSessionsWorkspace key="codex" client={control.codexSessions} authStore={authStore} archived={archived} onArchived={value => { const next = new URLSearchParams(params); next.set('archived', String(value)); setParams(next) }} providerControl={providerControl} />
}
