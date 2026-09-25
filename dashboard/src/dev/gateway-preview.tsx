/**
 * Development-only: the live (gateway) workspace fed by an in-memory fake gateway, so the real
 * live screens can be seen and iterated on without a server or a sign-in. It is the default
 * in dev fixture mode; `?gateway-preview=0` shows the older fixture pages, `=1` brings it back.
 */
import { useState } from 'react'
import { createStore } from 'zustand/vanilla'
import { GatewayWorkspace } from '@/components/gateway/workspace'
import { createGatewayRuntimeWorkspaceState } from '@/components/gateway/runtime-state'
import { createGatewayActivityWorkspaceState } from '@/components/gateway/activity-state'
import { createGatewayOwnerState } from '@/components/gateway/owner-state'
import { createGatewaySourcePrivacyState } from '@/components/gateway/source-privacy'
import { createGatewayRuntimeClient } from '@/lib/gateway/runtime'
import { createGatewayActivityClient } from '@/lib/gateway/activity'
import { createGatewayOwnerClient } from '@/lib/gateway/owner'
import { createGatewayProposalClient } from '@/lib/gateway/proposals'
import { createGatewayControlClient } from '@/lib/gateway/control'
import type { GatewayAuthState } from '@/lib/gateway/auth-store'
import type { GatewayAuthClient } from '@/lib/gateway/auth'
import { createFakeGateway } from './fake-gateway'

function services() {
  const fake = createFakeGateway()
  const auth = { request: fake.request } as Pick<GatewayAuthClient, 'request'>
  const original = window.fetch.bind(window)
  window.fetch = (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, window.location.origin)
    const stream = url.pathname.match(/^\/api\/pi\/turn-submissions\/([^/]+)\/stream$/)
    return stream ? Promise.resolve(fake.streamResponse(stream[1])) : original(input, init)
  }
  const authStore = Object.assign(createStore<GatewayAuthState>(() => ({
    phase: 'authenticated', pending: false, error: null, logoutUnconfirmed: false,
    session: { authenticated: true, sessionId: 'preview', expiresAt: Date.now() / 1000 + 86400, unlockExpiresAt: null, setupRequired: false },
    bootstrap: async () => true, revalidate: async () => true, login: async () => true, logout: async () => false, lock: () => undefined,
  })), { dispose: () => undefined })
  return {
    authStore, runtime: createGatewayRuntimeClient(auth), activity: createGatewayActivityClient(auth), owner: createGatewayOwnerClient(auth),
    proposals: createGatewayProposalClient(auth), control: createGatewayControlClient(auth),
    conversationState: createGatewayRuntimeWorkspaceState(), activityState: createGatewayActivityWorkspaceState(),
    ownerState: createGatewayOwnerState(), sourcePrivacy: createGatewaySourcePrivacyState(),
  }
}

export default function GatewayPreview() {
  const [value] = useState(services)
  // Honest status: this is sample data, not a server.
  return <GatewayWorkspace {...value} badge={<a href="?gateway-preview=0" title="Sample data, no server. Opens the older design pages." className="truncate rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground">Demo</a>} />
}
