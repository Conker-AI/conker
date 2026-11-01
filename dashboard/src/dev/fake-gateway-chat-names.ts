/** Development-only preview fixture for chat names and output settings. */
import { GatewayError } from '@/lib/gateway/transport'
import type { FakeChatStore } from './fake-gateway'

type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST' | 'PUT'; body?: Json }

// Store per-chat data for titles and output
const titleData = new Map<string, { revision: number; source: 'owner' | 'auto' | null; modelId: string | null }>()
const outputData = new Map<string, { revision: number; format: string; length: string; language: string }>()

export function createFakeChatNames(_now: () => number, fail: (status: number) => never, store: FakeChatStore) {
  // Initialize data for existing sessions
  for (const session of store.sessions) {
    if (!titleData.has(session.id)) {
      titleData.set(session.id, { revision: 0, source: null, modelId: null })
    }
    if (!outputData.has(session.id)) {
      outputData.set(session.id, { revision: 0, format: 'auto', length: 'auto', language: 'auto' })
    }
  }

  return function handle(path: string, method: 'GET' | 'POST' | 'PUT', options: Request): Json | undefined {
    const match = path.match(/^\/api\/control\/pi\/sessions\/(ses_[0-9a-f]{16})\/(title|output)(?:\/(auto))?$/)
    if (!match) return undefined

    const sessionId = match[1]
    const resource = match[2]
    const isAuto = match[3] === 'auto'

    // Find the session
    const session = store.sessions.find(s => s.id === sessionId)
    if (!session) fail(404)

    if (resource === 'title') {
      if (method === 'GET') {
        const data = titleData.get(sessionId)!
        const sessionTitle = session.title || ''
        return {
          revision: data.revision,
          title: sessionTitle,
          source: data.source,
          modelId: data.modelId,
        }
      }

      if (method === 'POST') {
        if (isAuto) {
          // Auto-name endpoint
          const body = options.body as { expected_revision?: number }
          const expectedRevision = body?.expected_revision ?? 0
          const data = titleData.get(sessionId)!

          if (expectedRevision !== data.revision) {
            throw new GatewayError('http', 409, undefined, 'revision_conflict')
          }

          // Check if chat has messages
          if (session.messages.length === 0) {
            throw new GatewayError('http', 409, undefined, 'empty')
          }

          // Generate name from first user message (first 6 words, max 60 chars)
          const firstUserMessage = session.messages.find(m => m.role === 'user')?.content || ''
          const words = firstUserMessage.split(/\s+/).slice(0, 6)
          const title = words.join(' ').substring(0, 60)

          // Update data
          const newData = { revision: data.revision + 1, source: 'auto' as const, modelId: 'preview-router' }
          titleData.set(sessionId, newData)
          session.title = title

          return {
            revision: newData.revision,
            title,
            source: newData.source,
            modelId: newData.modelId,
          }
        } else {
          // Rename endpoint
          const body = options.body as { expected_revision?: number; title?: string }
          const expectedRevision = body?.expected_revision ?? 0
          const title = body?.title ?? ''
          const data = titleData.get(sessionId)!

          if (expectedRevision !== data.revision) {
            throw new GatewayError('http', 409, undefined, 'revision_conflict')
          }

          const trimmed = title.trim()
          if (!trimmed || trimmed.length > 60 || Array.from(trimmed).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) {
            throw new GatewayError('http', 422, undefined, 'invalid_title')
          }

          // Update data
          const newData = { revision: data.revision + 1, source: 'owner' as const, modelId: null }
          titleData.set(sessionId, newData)
          session.title = trimmed

          return {
            revision: newData.revision,
            title: trimmed,
            source: newData.source,
            modelId: newData.modelId,
          }
        }
      }
    }

    if (resource === 'output') {
      if (method === 'GET') {
        const data = outputData.get(sessionId)!
        return {
          revision: data.revision,
          output: {
            format: data.format,
            length: data.length,
            language: data.language,
          },
        }
      }

      if (method === 'POST') {
        const body = options.body as { expected_revision?: number; output?: { format?: string; length?: string; language?: string } }
        const expectedRevision = body?.expected_revision ?? 0
        const output = body?.output ?? {}
        const data = outputData.get(sessionId)!

        if (expectedRevision !== data.revision) {
          throw new GatewayError('http', 409, undefined, 'revision_conflict')
        }

        // Validate language pattern
        const language = output.language ?? 'auto'
        const languagePattern = /^(auto|[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3})$/
        if (!languagePattern.test(language) || language.length > 35) {
          throw new GatewayError('http', 422, undefined, 'invalid_text')
        }

        // Update data
        const newData = {
          revision: data.revision + 1,
          format: output.format ?? 'auto',
          length: output.length ?? 'auto',
          language,
        }
        outputData.set(sessionId, newData)

        return {
          revision: newData.revision,
          output: {
            format: newData.format,
            length: newData.length,
            language: newData.language,
          },
        }
      }
    }

    return undefined
  }
}
