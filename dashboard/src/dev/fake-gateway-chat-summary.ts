/** Development-only preview fixture for chat summaries, compaction and summary forks. */
import { GatewayError } from '@/lib/gateway/transport'
import type { FakeChatStore } from './fake-gateway'

type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST' | 'PUT'; body?: Json }

interface SummaryState {
  versions: Array<{
    revision: number
    summary: string | null
    sourceSessionId: string | null
    createdAt: number
    restoredFrom: number | null
  }>
  compaction: {
    summaryRevision: number
    covered: string[]
    folded: string[]
  }
}

export function createFakeChatSummary(now: () => number, fail: (status: number) => never, store: FakeChatStore) {
  const summaries = new Map<string, SummaryState>()

  return function handle(path: string, method: 'GET' | 'POST' | 'PUT', options: Request): Json | undefined {
    const match = path.match(/^\/api\/control\/pi\/context\/(ses_[0-9a-f]{16})(\/.*)?$/)
    if (!match) return undefined

    const sessionId = match[1]
    const subPath = match[2] || ''
    const session = store.sessions.find(s => s.id === sessionId)
    if (!session) fail(404)

    // Initialize summary state if needed
    if (!summaries.has(sessionId)) {
      summaries.set(sessionId, {
        versions: [],
        compaction: { summaryRevision: 0, covered: [], folded: [] }
      })
    }
    const state = summaries.get(sessionId)!

    // GET /context/{sid} - for policy revision
    if (subPath === '' && method === 'GET') {
      const context = store.contexts.get(sessionId)
      if (!context) {
        return { revision: 0, policy: null }
      }
      return { revision: context.revision, policy: context.policy }
    }

    // GET /context/{sid}/summary
    if (subPath === '/summary' && method === 'GET') {
      const latest = state.versions[0]
      return {
        revision: latest?.revision ?? 0,
        summary: latest?.summary ?? null,
        sourceSessionId: latest?.sourceSessionId ?? null,
        versions: [...state.versions] // Already newest first due to unshift
      }
    }

    // POST /context/{sid}/summary
    if (subPath === '/summary' && method === 'POST') {
      const body = options.body as { expected_revision?: number; summary?: string }
      const expectedRevision = body?.expected_revision
      const summary = body?.summary ?? ''

      if (typeof expectedRevision !== 'number' || expectedRevision < 0) {
        throw new GatewayError('http', 422)
      }

      const currentRevision = state.versions[0]?.revision ?? 0
      if (expectedRevision !== currentRevision) {
        throw new GatewayError('http', 409, undefined, 'revision_conflict')
      }

      const newRevision = currentRevision + 1
      const newVersion = {
        revision: newRevision,
        summary,
        sourceSessionId: null,
        createdAt: now(),
        restoredFrom: null
      }

      state.versions.unshift(newVersion)
      return {
        revision: newRevision,
        summary,
        sourceSessionId: null,
        versions: [...state.versions] // Already newest first due to unshift
      }
    }

    // POST /context/{sid}/summary/restore
    if (subPath === '/summary/restore' && method === 'POST') {
      const body = options.body as { expected_revision?: number; revision?: number }
      const expectedRevision = body?.expected_revision
      const restoreRevision = body?.revision

      if (typeof expectedRevision !== 'number' || expectedRevision < 0 ||
          typeof restoreRevision !== 'number' || restoreRevision < 0) {
        throw new GatewayError('http', 422)
      }

      const currentRevision = state.versions[0]?.revision ?? 0
      if (expectedRevision !== currentRevision) {
        throw new GatewayError('http', 409, undefined, 'revision_conflict')
      }

      const versionToRestore = state.versions.find(v => v.revision === restoreRevision)
      if (!versionToRestore) {
        throw new GatewayError('http', 409, undefined, 'missing_revision')
      }

      const newRevision = currentRevision + 1
      const newVersion = {
        revision: newRevision,
        summary: versionToRestore.summary,
        sourceSessionId: versionToRestore.sourceSessionId,
        createdAt: now(),
        restoredFrom: restoreRevision
      }

      state.versions.unshift(newVersion)
      return {
        revision: newRevision,
        summary: versionToRestore.summary,
        sourceSessionId: versionToRestore.sourceSessionId,
        versions: [...state.versions] // Already newest first due to unshift
      }
    }

    // POST /context/{sid}/summary/draft
    if (subPath === '/summary/draft' && method === 'POST') {
      const body = options.body as { focus?: string }
      const focus = body?.focus ?? ''

      if (typeof focus !== 'string' || focus.length > 500) {
        throw new GatewayError('http', 422)
      }

      if (session.messages.length < 3) {
        throw new GatewayError('http', 409, undefined, 'empty')
      }

      // Take first words of each message except last two
      const messagesToSummarize = session.messages.slice(0, -2)
      const messageIds = messagesToSummarize.map(m => m.id)
      const summary = 'Preview summary: ' + messagesToSummarize
        .map(m => (m.content as string).split(' ').slice(0, 5).join(' '))
        .join(' ')

      return {
        summary,
        messageIds,
        truncated: false,
        earlierSummaryIncluded: false,
        summaryRevision: state.versions[0]?.revision ?? 0,
        modelId: 'preview-summary',
        configurationRevision: 1
      }
    }

    // GET /context/{sid}/compaction
    if (subPath === '/compaction' && method === 'GET') {
      return state.compaction
    }

    // POST /context/{sid}/compact
    if (subPath === '/compact' && method === 'POST') {
      const body = options.body as {
        expected_policy_revision?: number;
        expected_summary_revision?: number;
        summary?: string;
        covers?: string[]
      }
      const expectedPolicyRevision = body?.expected_policy_revision
      const expectedSummaryRevision = body?.expected_summary_revision
      const summary = body?.summary
      const covers = body?.covers

      if (typeof expectedPolicyRevision !== 'number' || expectedPolicyRevision < 1 ||
          typeof expectedSummaryRevision !== 'number' || expectedSummaryRevision < 0 ||
          typeof summary !== 'string' || summary.length < 1 || summary.length > 16000 ||
          !Array.isArray(covers) || covers.length < 1 || covers.length > 10000) {
        throw new GatewayError('http', 422)
      }

      const context = store.contexts.get(sessionId)
      if (!context) {
        throw new GatewayError('http', 409, undefined, 'no_settings')
      }

      const currentPolicyRevision = context.revision
      const currentSummaryRevision = state.versions[0]?.revision ?? 0

      if (expectedPolicyRevision !== currentPolicyRevision ||
          expectedSummaryRevision !== currentSummaryRevision) {
        throw new GatewayError('http', 409, undefined, 'revision_conflict')
      }

      // Check that all covers are messages of this chat
      const messageIds = new Set(session.messages.map(m => m.id))
      for (const cover of covers) {
        if (!messageIds.has(cover)) {
          throw new GatewayError('http', 422, undefined, 'outside_boundary')
        }
      }

      // Update policy: set covered messages without rule to 'allow-summary'
      const updatedPolicy = { ...context.policy }
      if (!updatedPolicy.messagePolicies) {
        updatedPolicy.messagePolicies = {}
      }

      const folded: string[] = []
      for (const cover of covers) {
        if (!updatedPolicy.messagePolicies[cover]) {
          updatedPolicy.messagePolicies[cover] = 'allow-summary'
          folded.push(cover)
        }
      }

      // Update policy revision
      store.contexts.set(sessionId, {
        revision: currentPolicyRevision + 1,
        policy: updatedPolicy
      })

      // Save new summary version
      const newSummaryRevision = currentSummaryRevision + 1
      state.versions.unshift({
        revision: newSummaryRevision,
        summary,
        sourceSessionId: null,
        createdAt: now(),
        restoredFrom: null
      })

      // Update compaction record
      state.compaction = {
        summaryRevision: newSummaryRevision,
        covered: [...covers].sort(),
        folded: folded.sort()
      }

      return {
        policyRevision: currentPolicyRevision + 1,
        summaryRevision: newSummaryRevision,
        covered: covers.sort(),
        folded: folded.sort()
      }
    }

    // POST /context/{sid}/fork
    if (subPath === '/fork' && method === 'POST') {
      const body = options.body as {
        expected_revision?: number;
        expected_last_message_id?: string;
        summary?: string;
        request_id?: string
      }
      const expectedRevision = body?.expected_revision
      const expectedLastMessageId = body?.expected_last_message_id
      const summary = body?.summary
      const requestId = body?.request_id

      if (typeof expectedRevision !== 'number' || expectedRevision < 1 ||
          typeof summary !== 'string' || summary.length > 16000 ||
          typeof requestId !== 'string' || requestId.length < 16 || requestId.length > 128) {
        throw new GatewayError('http', 422)
      }

      const context = store.contexts.get(sessionId)
      if (!context) {
        throw new GatewayError('http', 409, undefined, 'revision_conflict')
      }

      if (expectedRevision !== context.revision) {
        throw new GatewayError('http', 409, undefined, 'revision_conflict')
      }

      // Check last message ID
      const actualLastMessageId = session.messages.length > 0
        ? session.messages[session.messages.length - 1].id
        : null

      if (expectedLastMessageId !== actualLastMessageId) {
        throw new GatewayError('http', 409, undefined, 'boundary_changed')
      }

      // Create new session
      const newSessionId = store.nextId('ses')
      const newSession = {
        id: newSessionId,
        title: session.title + ' (continued)',
        created_at: now(),
        messages: [],
        turns: []
      }
      store.sessions.push(newSession)

      // Set initial summary for new session
      summaries.set(newSessionId, {
        versions: [{
          revision: 1,
          summary,
          sourceSessionId: sessionId,
          createdAt: now(),
          restoredFrom: null
        }],
        compaction: { summaryRevision: 0, covered: [], folded: [] }
      })

      return {
        sessionId: newSessionId,
        parentId: sessionId,
        replayed: false
      }
    }

    return undefined
  }
}
