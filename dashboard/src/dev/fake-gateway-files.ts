/**
 * Development-only: owner downloads and ChatGPT/Claude imports for the preview gateway. Downloads
 * are tiny stand-in files; an import reads the chosen conversations.json in the browser and counts
 * it roughly the way Pi does, so every screen state can be seen without a server.
 * `?preview-export=<Pi refusal code>` (for example export_page_cells) makes every export refuse;
 * `?preview-imports=seeded` starts with three imported chats.
 */
import { GatewayRefusal, gatewayFileTypes, gatewayRefusalCodes, type GatewayDownload, type GatewayFileFormat, type GatewayRefusalCode } from '@/lib/gateway/file-transfer'
import { GatewayError } from '@/lib/gateway/transport'

type Json = Record<string, unknown>
type Source = 'chatgpt' | 'claude'
type Row = { author: 'user' | 'assistant'; text: string; createdAt: number | null }
type Chat = { id: string; exportId: string; source: Source; title: string; startedAt: number | null; updatedAt: number | null; importedAt: number; messages: Row[] }
type Read = Omit<Chat, 'id' | 'source' | 'importedAt'>

const hex = (length: number) => Array.from(crypto.getRandomValues(new Uint8Array(length / 2)), byte => byte.toString(16).padStart(2, '0')).join('')
const time = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? Date.parse(value) / 1000 : null
const object = (value: unknown): value is Json => !!value && typeof value === 'object' && !Array.isArray(value)

function readChat(source: Source, item: unknown): Read | null {
  if (!object(item)) return null
  if (source === 'chatgpt') {
    if (!object(item.mapping)) return null
    const messages = Object.values(item.mapping).flatMap(node => {
      const message = object(node) && object(node.message) ? node.message : null, role = object(message?.author) ? message.author.role : null
      const parts = object(message?.content) && Array.isArray(message.content.parts) ? message.content.parts.filter((part): part is string => typeof part === 'string') : []
      return message && (role === 'user' || role === 'assistant') && parts.join('').trim() ? [{ author: role, text: parts.join('\n'), createdAt: time(message.create_time) } as Row] : []
    }).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
    return { exportId: String(item.conversation_id ?? item.id ?? item.title), title: String(item.title || 'Untitled chat'), startedAt: time(item.create_time), updatedAt: time(item.update_time), messages }
  }
  if (!Array.isArray(item.chat_messages)) return null
  const messages = item.chat_messages.flatMap(message => object(message) && typeof message.text === 'string' && message.text.trim() ? [{ author: message.sender === 'human' ? 'user' : 'assistant', text: message.text, createdAt: time(message.created_at) } as Row] : [])
  return { exportId: String(item.uuid ?? item.name), title: String(item.name || 'Untitled chat'), startedAt: time(item.created_at), updatedAt: time(item.updated_at), messages }
}

const day = 86400, start = Date.now() / 1000 - 400 * day
const sample = [
  { title: 'Judo grading checklist', create_time: start, update_time: start + 600, mapping: { a: { message: { author: { role: 'user' }, content: { parts: ['What do I need for my orange belt grading?'] }, create_time: start } }, b: { message: { author: { role: 'assistant' }, content: { parts: ['You will usually be asked to show two throws, one hold-down and the basic falls. Bring your licence book.'] }, create_time: start + 30 } } } },
  { title: 'Physics: speed and velocity', create_time: start + 40 * day, update_time: start + 40 * day, mapping: { a: { message: { author: { role: 'user' }, content: { parts: ['Is speed the same as velocity?'] }, create_time: start + 40 * day } }, b: { message: { author: { role: 'assistant' }, content: { parts: ['Not quite: velocity also has a direction. 5 m/s north is a velocity; 5 m/s is a speed.'] }, create_time: start + 40 * day + 20 } } } },
  { title: 'Birthday present ideas for mum', create_time: start + 200 * day, update_time: start + 201 * day, mapping: { a: { message: { author: { role: 'user' }, content: { parts: ['Ideas for a birthday present for my mum, under 30 euros?'] }, create_time: start + 200 * day } }, b: { message: { author: { role: 'assistant' }, content: { parts: ['A framed photo from a trip you took together, a plant for her kitchen, or a voucher for a class she has mentioned.'] }, create_time: start + 200 * day + 15 } } } },
]

export function createFakeFiles() {
  const params = new URLSearchParams(window.location.search)
  const refuse = gatewayRefusalCodes.find(code => code === params.get('preview-export')) as GatewayRefusalCode | undefined
  const chats: Chat[] = [], batches: Json[] = []
  const offered = () => chats.reduce((total, chat) => total + chat.messages.filter(row => row.author === 'user').length, 0)
  const view = (chat: Chat) => ({ id: chat.id, source: chat.source, label: `Imported from ${chat.source === 'claude' ? 'Claude' : 'ChatGPT'}`, title: chat.title, exportId: chat.exportId, startedAt: chat.startedAt, updatedAt: chat.updatedAt, importedAt: chat.importedAt, messageCount: chat.messages.length, archived: true, readOnly: true })
  const memory = { on: true, reason: null, configured: true }
  function plan(source: Source, items: unknown[]) {
    const read = items.map(item => readChat(source, item)).filter((item): item is Read => !!item && item.messages.length > 0)
    if (!read.length) {
      const other: Source = source === 'chatgpt' ? 'claude' : 'chatgpt', looks = items.some(item => readChat(other, item))
      throw new GatewayRefusal('wrong_format', 422, looks ? other : undefined)
    }
    return read.map(item => ({ item, known: chats.find(chat => chat.source === source && chat.exportId === item.exportId) }))
  }
  function save(source: Source, read: ReturnType<typeof plan>) {
    for (const { item, known } of read) {
      if (known) Object.assign(known, { title: item.title, updatedAt: item.updatedAt, messages: item.messages })
      else chats.push({ ...item, id: `imp_${hex(32)}`, source, importedAt: Date.now() / 1000 })
    }
    chats.sort((a, b) => (b.updatedAt ?? b.startedAt ?? 0) - (a.updatedAt ?? a.startedAt ?? 0))
  }
  if (params.get('preview-imports') === 'seeded') save('chatgpt', plan('chatgpt', sample))
  return {
    handles: (path: string) => path === '/api/control/pi/imports' || path.startsWith('/api/control/pi/imports/'),
    request(path: string, options: { query?: Record<string, string | number | boolean> } = {}): Json {
      if (path === '/api/control/pi/imports') return { schemaVersion: 1, imports: batches, memory: { configured: true, waiting: offered(), offered: 0, refused: 0, problem: null } }
      const query = options.query ?? {}, limit = Number(query.limit ?? 50)
      if (path === '/api/control/pi/imports/chats') {
        const rows = chats.filter(chat => !query.source || chat.source === query.source), offset = Number(query.offset ?? 0), page = rows.slice(offset, offset + limit)
        return { schemaVersion: 1, total: rows.length, chats: page.map(view), nextOffset: offset + page.length < rows.length ? offset + page.length : null }
      }
      const chat = chats.find(row => path.endsWith(`/${row.id}`))
      if (!chat) throw new GatewayRefusal('not_found', 404)
      const after = Number(query.after ?? 0), rows = chat.messages.map((row, index) => ({ ...row, seq: index + 1 })).filter(row => row.seq > after), page = rows.slice(0, limit)
      return { schemaVersion: 1, ...view(chat), messages: page.map(row => ({ id: `impmsg_${row.seq.toString(16).padStart(32, '0')}`, seq: row.seq, author: row.author, text: row.text, createdAt: row.createdAt, shortened: false, exportId: String(row.seq), memory: row.author === 'user' ? 'offering' : null })), nextAfter: rows.length > limit ? page.at(-1)!.seq : null }
    },
    async upload(path: string, body: Blob): Promise<Json> {
      const [, source, tail] = path.match(/^\/api\/control\/pi\/imports\/(chatgpt|claude)\/(preview|[0-9a-f]{64})$/) ?? []
      if (!source) throw new GatewayError('validation')
      const bytes = await body.arrayBuffer(), digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('')
      let items: unknown
      try { items = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch { throw new GatewayRefusal('not_json', 422) }
      if (!Array.isArray(items)) throw new GatewayRefusal('not_a_list', 422)
      const read = plan(source as Source, items), fresh = read.filter(({ item, known }) => !known || item.messages.length > known.messages.length)
      const added = fresh.reduce((total, { item, known }) => total + item.messages.length - (known?.messages.length ?? 0), 0)
      const yours = fresh.reduce((total, { item, known }) => total + item.messages.slice(known?.messages.length ?? 0).filter(row => row.author === 'user').length, 0)
      const chatCounts = { new: read.filter(entry => !entry.known).length, updated: fresh.filter(entry => entry.known).length, unchanged: read.length - fresh.length }
      if (tail === 'preview') {
        const times = read.flatMap(({ item }) => [item.startedAt, item.updatedAt, ...item.messages.map(row => row.createdAt)]).filter((value): value is number => value !== null)
        return { schemaVersion: 1, source, label: '', digest, bytes: body.size, chats: { inFile: read.length, ...chatCounts }, messages: { inFile: read.reduce((total, { item }) => total + item.messages.length, 0), new: added, yours, offeredToMemory: yours },
          firstAt: times.length ? Math.min(...times) : null, lastAt: times.length ? Math.max(...times) : null, sampleTitles: fresh.slice(0, 5).map(({ item }) => item.title), skipped: { emptyChats: items.length - read.length }, memory, limits: {} }
      }
      if (tail !== digest) throw new GatewayRefusal('file_changed', 409)
      save(source as Source, read)
      const result = { schemaVersion: 1, batchId: `impb_${hex(32)}`, source, label: '', digest, importedAt: Date.now() / 1000, chats: chatCounts, messages: { added, offeredToMemory: yours }, skipped: {}, memory }
      batches.unshift(result)
      return result
    },
    async download(path: string, query: { format: GatewayFileFormat }): Promise<GatewayDownload> {
      if (refuse) throw new GatewayRefusal(refuse, refuse === 'export_busy' || refuse === 'export_unavailable' ? 503 : 422)
      const name = path.includes('/messages/') ? 'Conker-answer' : 'Artifact'
      return { blob: new Blob(['Preview export: sample data, no server.'], { type: gatewayFileTypes[query.format] }), filename: `${name}.${query.format}` }
    },
  }
}
