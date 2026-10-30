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
import { createGatewayVerificationStore, describeGatewayOperation } from '@/lib/gateway/verification'
import { GatewayError, snapshotGatewayOperation } from '@/lib/gateway/transport'
import { isImportSave } from '@/lib/gateway/file-transfer'
import { GATEWAY_REACHABILITY_EVENT } from '@/lib/connection-store'
import { GatewayOperationVerification } from '@/components/auth/gateway-verification'
import { createFakeGateway } from './fake-gateway'
import { createFakeFiles } from './fake-gateway-files'

type PreviewFailure = 'network' | 'dependency' | 'partial' | null

/**
 * Failure states for checking the UI: `?preview-failure=network|dependency|partial`, or at runtime
 * `window.conkerPreview.fail('network')` and `fail(null)` to recover. `?preview-delay=MS` slows every
 * answer, to check loading states.
 */
const failure = (() => {
  const requested = new URLSearchParams(window.location.search).get('preview-failure')
  // One state for the page: React may build the preview services twice in development.
  const state = { mode: (requested === 'network' || requested === 'dependency' || requested === 'partial' ? requested : null) as PreviewFailure }
  Object.assign(window, { conkerPreview: { fail: (mode: PreviewFailure) => { state.mode = mode } } })
  return state
})()

function failIfAsked(path: string) {
  const report = (reachable: boolean) => window.dispatchEvent(new CustomEvent(GATEWAY_REACHABILITY_EVENT, { detail: reachable }))
  if (failure.mode === 'network') { report(false); throw new GatewayError('network') }
  report(true)
  if (failure.mode === 'dependency' || failure.mode === 'partial' && /^\/api\/(owner|pi\/proposals)/.test(path)) throw new GatewayError('dependency', 503)
}

function services() {
  const requestedSetup = new URLSearchParams(window.location.search).get('preview-setup')
  const setupStep = requestedSetup === 'model' || requestedSetup === 'memory' || requestedSetup === 'capabilities' || requestedSetup === 'protection' || requestedSetup === 'rehearsal' ? requestedSetup : undefined
  const fake = createFakeGateway({ setupStep }), files = createFakeFiles()
  const verification = createGatewayVerificationStore()
  const delay = Math.min(Number(new URLSearchParams(window.location.search).get('preview-delay')) || 0, 30_000)
  // `?preview-password` shows the password prompt for imports (any password is accepted here).
  const askPassword = new URLSearchParams(window.location.search).has('preview-password')
  const auth = { request: async (path, options = {}) => {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay))
    failIfAsked(path)
    if (options.method === 'POST' && (fake.subscriptionVerificationEnabled(path) || fake.credentialVerificationEnabled(path) || fake.nativeSessionVerificationEnabled(path) || fake.correctionVerificationEnabled(path))) {
      await verification.request(describeGatewayOperation(snapshotGatewayOperation(path, options.body)), async () => 'preview-only', options.signal)
    }
    return files.handles(path) ? files.request(path, options) : fake.request(path, options)
  }, download: async (path, query) => {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay))
    failIfAsked(path)
    return files.download(path, query)
  }, upload: async (path, body, signal) => {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay))
    failIfAsked(path)
    // Importing (not previewing) asks for the password, as the real gateway does.
    if (askPassword && isImportSave(path)) await verification.request(describeGatewayOperation({ method: 'POST', path, body: {} }), async () => 'preview-only', signal)
    return files.upload(path, body)
  }, getSession: () => null, lock: () => undefined, audio: async () => { throw new Error('Speech is not configured in preview.') } } as Pick<GatewayAuthClient, 'request' | 'audio' | 'getSession' | 'lock' | 'download' | 'upload'>
  const authStore = Object.assign(createStore<GatewayAuthState>(() => ({
    phase: 'authenticated', pending: false, error: null, logoutUnconfirmed: false,
    session: { authenticated: true, sessionId: 'preview', expiresAt: Date.now() / 1000 + 86400, unlockExpiresAt: (askPassword || fake.subscriptionVerificationEnabled('/api/host/chatgpt') || fake.credentialVerificationEnabled('/api/host/providers') || fake.nativeSessionVerificationEnabled('/api/host/claude/sessions/preview/stop') || fake.correctionVerificationEnabled('/api/control/pi/memory/corrections')) ? Date.now() / 1000 + 86400 : null, setupRequired: false },
    bootstrap: async () => true, revalidate: async () => true, login: async () => true, logout: async () => false, lock: () => undefined, confirmSessionRevoked: () => undefined,
  })), { dispose: () => undefined })
  return { fake, verification, workspace: {
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
  return <><GatewayWorkspace {...value.workspace} badge={<span title="Sample data, no server." className="truncate rounded-full border px-2 py-0.5 text-xs text-muted-foreground">Preview</span>} /><GatewayOperationVerification store={value.verification} authStore={value.workspace.authStore} /></>
}
