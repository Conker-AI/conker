/**
 * Development-only: the live (gateway) workspace fed by an in-memory fake gateway, so the real
 * live screens can be seen and iterated on without a server or a sign-in. The legacy fixture
 * workspace is available only in a separately started development build.
 */
import { useEffect, useState } from 'react'
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
  const requestedSetup = new URLSearchParams(window.location.search).get('preview-setup')
  const setupStep = requestedSetup === 'model' || requestedSetup === 'memory' || requestedSetup === 'capabilities' || requestedSetup === 'protection' || requestedSetup === 'rehearsal' ? requestedSetup : undefined
  const fake = createFakeGateway({ setupStep })
  const auth = { request: fake.request, getSession: () => null, lock: () => undefined, audio: async () => { throw new Error('Speech is not configured in preview.') } } as Pick<GatewayAuthClient, 'request' | 'audio' | 'getSession' | 'lock'>
  const authStore = Object.assign(createStore<GatewayAuthState>(() => ({
    phase: 'authenticated', pending: false, error: null, logoutUnconfirmed: false,
    session: { authenticated: true, sessionId: 'preview', expiresAt: Date.now() / 1000 + 86400, unlockExpiresAt: null, setupRequired: false },
    bootstrap: async () => true, revalidate: async () => true, login: async () => true, logout: async () => false, lock: () => undefined, confirmSessionRevoked: () => undefined,
  })), { dispose: () => undefined })
  return { fake, workspace: {
    authStore, runtime: createGatewayRuntimeClient(auth), activity: createGatewayActivityClient(auth), owner: createGatewayOwnerClient(auth),
    proposals: createGatewayProposalClient(auth), control: createGatewayControlClient(auth, () => undefined),
    conversationState: createGatewayRuntimeWorkspaceState(), activityState: createGatewayActivityWorkspaceState(),
    ownerState: createGatewayOwnerState(), sourcePrivacy: createGatewaySourcePrivacyState(),
  } }
}

export default function GatewayPreview() {
  const [value] = useState(services)
  useEffect(() => {
    const original = window.fetch.bind(window)
    const previewFetch: typeof window.fetch = (input, init) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, window.location.origin)
      const stream = url.pathname.match(/^\/api\/pi\/turn-submissions\/([^/]+)\/stream$/)
      return stream ? Promise.resolve(value.fake.streamResponse(stream[1])) : original(input, init)
    }
    window.fetch = previewFetch
    return () => { if (window.fetch === previewFetch) window.fetch = original }
  }, [value.fake])
  // Honest status: this is sample data, not a server.
  return <GatewayWorkspace {...value.workspace} badge={<span title="Sample data, no server." className="truncate rounded-full border px-2 py-0.5 text-xs text-muted-foreground">Preview</span>} />
}
