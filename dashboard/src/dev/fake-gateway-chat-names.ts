/** Development-only preview fixture for chat names and output settings. Answers in Pi's exact shapes. */
import { GatewayError } from '@/lib/gateway/transport'
import type { FakeChatStore } from './fake-gateway'

type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST' | 'PUT'; body?: Json }
type TitleRecord = { revision: number; source: 'owner' | 'auto' | null; modelId: string | null }
type OutputRecord = { revision: number; format: string; length: string; language: string }

const FORMATS = ['auto', 'text', 'list', 'table', 'document', 'code', 'json']
const LENGTHS = ['auto', 'short', 'medium', 'long']
const LANGUAGE = /^(auto|[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3})$/

const refuse = (status: number, code?: ConstructorParameters<typeof GatewayError>[3]) => new GatewayError('http', status, undefined, code)

/** Pi counts characters as sent after stripping; control characters are refused. */
function validTitle(text: string) {
  const characters = [...text]
  return characters.length >= 1 && characters.length <= 60 && !characters.some(character => { const code = character.charCodeAt(0); return code < 32 || code === 127 })
}

export function createFakeChatNames(_now: () => number, fail: (status: number) => never, store: FakeChatStore) {
  const titles = new Map<string, TitleRecord>()
  const outputs = new Map<string, OutputRecord>()
  const titleOf = (id: string) => titles.get(id) ?? titles.set(id, { revision: 0, source: null, modelId: null }).get(id)!
  const outputOf = (id: string) => outputs.get(id) ?? outputs.set(id, { revision: 0, format: 'auto', length: 'auto', language: 'auto' }).get(id)!
  const titleBody = (title: string, record: TitleRecord) => ({ revision: record.revision, title, source: record.source, modelId: record.modelId })
  const outputBody = (record: OutputRecord) => ({ revision: record.revision, output: { format: record.format, length: record.length, language: record.language } })

  return function handle(path: string, method: 'GET' | 'POST' | 'PUT', options: Request): Json | undefined {
    const match = path.match(/^\/api\/control\/pi\/sessions\/(ses_[0-9a-f]{16})\/(title\/auto|title|output)$/)
    if (!match) return undefined
    const [, id, resource] = match
    const session = store.sessions.find(item => item.id === id)
    if (!session) return fail(404)
    const body = (options.body ?? {}) as Json

    if (resource === 'title' && method === 'GET') return titleBody(session.title ?? '', titleOf(id))

    if (resource === 'title' && method === 'POST') {
      const record = titleOf(id)
      if (body.expected_revision !== record.revision) throw refuse(409, 'revision_conflict')
      const title = typeof body.title === 'string' ? body.title.trim() : ''
      if (!validTitle(title)) throw refuse(422, 'invalid_title')
      const next: TitleRecord = { revision: record.revision + 1, source: 'owner', modelId: null }
      titles.set(id, next)
      session.title = title
      return titleBody(title, next)
    }

    if (resource === 'title/auto' && method === 'POST') {
      const record = titleOf(id)
      if (session.messages.length === 0) throw refuse(409, 'empty')
      const first = session.messages.find(message => message.role === 'user')
      const title = [...(first && typeof first.content === 'string' ? first.content.trim().split(/\s+/).slice(0, 6).join(' ') : '')].slice(0, 60).join('')
      if (!title) throw refuse(503, 'unavailable')
      if (body.expected_revision !== record.revision) throw refuse(409, 'revision_conflict')
      const next: TitleRecord = { revision: record.revision + 1, source: 'auto', modelId: 'preview-router' }
      titles.set(id, next)
      session.title = title
      return titleBody(title, next)
    }

    if (resource === 'output' && method === 'GET') return outputBody(outputOf(id))

    if (resource === 'output' && method === 'POST') {
      const record = outputOf(id)
      const output = body.output as { format?: unknown; length?: unknown; language?: unknown } | undefined
      const format = output?.format ?? 'auto', length = output?.length ?? 'auto', language = output?.language ?? 'auto'
      // Pi's request model is strict: a bad value is its generic 422, which carries no code.
      if (!output || typeof output !== 'object' || typeof body.expected_revision !== 'number'
        || typeof format !== 'string' || !FORMATS.includes(format) || typeof length !== 'string' || !LENGTHS.includes(length)
        || typeof language !== 'string' || language.length > 35 || !LANGUAGE.test(language)) throw refuse(422)
      if (body.expected_revision !== record.revision) throw refuse(409, 'revision_conflict')
      const next: OutputRecord = { revision: record.revision + 1, format, length, language }
      outputs.set(id, next)
      return outputBody(next)
    }

    return undefined
  }
}
