/** Development-only preview fixture for answer reviews (judge, votes, fact checks). Answers in Pi's shapes. */
import type { FakeChatStore } from './fake-gateway'
import { GatewayError, type ChatFeatureErrorCode } from '@/lib/gateway/transport'

type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST' | 'PUT'; body?: Json }
type Vote = 'up' | 'down' | 'winner'

const session = '(ses_[0-9a-f]{16})', message = '(msg_[0-9a-f]{16})'
const base = `^/api/control/pi/sessions/${session}`
const routes = {
  judge: new RegExp(`${base}/response-families/${message}/judge$`),
  judgements: new RegExp(`${base}/response-families/${message}/judgements$`),
  vote: new RegExp(`${base}/response-families/${message}/vote$`),
  votes: new RegExp(`${base}/response-families/${message}/votes$`),
  factCheck: new RegExp(`${base}/messages/${message}/fact-check$`),
  factChecks: new RegExp(`${base}/messages/${message}/fact-checks$`),
}
const requestIdPattern = /^[A-Za-z0-9_-]{16,128}$/
const refusal = (status: number, code: ChatFeatureErrorCode) => new GatewayError('http', status, undefined, code)

export function createFakeChatReviews(now: () => number, fail: (status: number) => never, store: FakeChatStore) {
  const judgementsByFamily = new Map<string, Json[]>()
  const votesByFamily = new Map<string, Record<string, Vote>>()
  const factChecksByMessage = new Map<string, Json[]>()

  seedRetriedAnswer()

  /** Preview data: one chat gets an answer that was retried twice, so the vote, judge and fact-check controls have something to act on. */
  function seedRetriedAnswer() {
    if (store.sessions.some(chat => chat.messages.some(item => item.response_family))) return
    const chat = store.sessions.find(item => {
      const last = item.messages[item.messages.length - 1]
      return last?.role === 'assistant' && last.content.length >= 40
    })
    if (!chat) return
    const root = chat.messages[chat.messages.length - 1]
    const retries = [
      'Short version: air scatters short wavelengths of sunlight the most, and blue is the shortest wavelength we see clearly. So the sky looks blue from every direction.',
      'Sunlight is white, but it is a mix of colours. Air molecules scatter blue light far more than red. That scattered blue light reaches your eyes from all over the sky. At sunset the light crosses more air, so the blue is gone and red is left.',
    ].map((content, index) => ({ ...root, id: store.nextId('msg'), seq: root.seq + index + 1, content, created_at: root.created_at + (index + 1) * 60 }))
    const versions = [root, ...retries]
    const selected = versions[versions.length - 1].id
    versions.forEach((item, index) => { item.response_family = { root_message_id: root.id, retry_of: index === 0 ? null : versions[index - 1].id, selected_message_id: selected, revision: index + 1 } })
    chat.messages.push(...retries)
  }

  function chatOf(sessionId: string) {
    const chat = store.sessions.find(item => item.id === sessionId)
    return chat ?? fail(404)
  }
  /** The answer's versions in order; an unknown family is a 404. */
  function familyOf(sessionId: string, rootId: string) {
    const family = chatOf(sessionId).messages.filter(item => (item.response_family as Json | undefined)?.root_message_id === rootId)
    if (family.length === 0) fail(404)
    return [...family].sort((a, b) => a.seq - b.seq)
  }
  /** Pi's request models reject unknown fields and wrong types with one plain 422. */
  function body(options: Request, allowed: Record<string, (value: unknown) => boolean>): Json {
    const value = options.body
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(422)
    for (const [key, item] of Object.entries(value)) if (!allowed[key] || !allowed[key](item)) return fail(422)
    if (!requestIdPattern.test(String(value.request_id))) return fail(422)
    return value
  }
  const isModel = (value: unknown) => value === null || (typeof value === 'string' && value.length >= 1 && value.length <= 200)

  /** Same request id and same body replays the stored answer; the same id with other values is refused. */
  function remember(list: Json[], request: Json, make: () => Json): Json {
    const same = list.find(item => item.request_id === request.request_id)
    if (same) {
      if (JSON.stringify(same.__body) !== JSON.stringify(request)) throw refusal(409, 'request_conflict')
      return { ...strip(same), replayed: true }
    }
    const made = { ...make(), __body: request }
    list.unshift(made)
    if (list.length > 20) list.pop()
    return { ...strip(made), replayed: false }
  }
  const strip = (value: Json): Json => {
    const { __body: _body, ...rest } = value
    void _body
    return rest
  }

  function judge(sessionId: string, rootId: string, options: Request): Json {
    const request = body(options, { request_id: () => true, model_id: isModel, rubric: value => typeof value === 'string' && [...value].length <= 2000 })
    const family = familyOf(sessionId, rootId)
    if (family.length < 2) throw refusal(409, 'too_few')
    const key = `${sessionId}:${rootId}`, list = judgementsByFamily.get(key) ?? []
    judgementsByFamily.set(key, list)
    return remember(list, request, () => {
      const scores = family.map((item, index) => ({
        message_id: item.id,
        score: Math.max(1, Math.min(10, 3 + Math.floor(item.content.length / 40))),
        reason: index === 0 ? 'Clear, but short on detail.' : 'Covers the question with more detail.',
      }))
      const winner = scores.reduce((best, item) => item.score > best.score ? item : best)
      return {
        request_id: request.request_id, judgeModelId: typeof request.model_id === 'string' ? request.model_id : 'preview-judge', rubric: request.rubric ?? '',
        scores, winner: winner.message_id, excluded: [], created_at: now() / 1000,
      }
    })
  }

  function vote(sessionId: string, rootId: string, options: Request): Json {
    const value = options.body
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => key !== 'message_id' && key !== 'vote')
      || typeof value.message_id !== 'string' || value.message_id.length < 1 || value.message_id.length > 128
      || !['up', 'down', 'winner', 'clear'].includes(String(value.vote))) return fail(422)
    const family = familyOf(sessionId, rootId)
    if (!family.some(item => item.id === value.message_id)) throw refusal(422, 'not_a_version')
    const key = `${sessionId}:${rootId}`, votes = votesByFamily.get(key) ?? {}
    votesByFamily.set(key, votes)
    if (value.vote === 'clear') delete votes[value.message_id]
    else {
      if (value.vote === 'winner') for (const id of Object.keys(votes)) if (votes[id] === 'winner') votes[id] = 'up'
      votes[value.message_id] = value.vote as Vote
    }
    return { root_message_id: rootId, votes: { ...votes } }
  }

  function factCheck(sessionId: string, messageId: string, options: Request): Json {
    const request = body(options, { request_id: () => true, model_id: isModel })
    const answer = chatOf(sessionId).messages.find(item => item.id === messageId)
    if (!answer || answer.role !== 'assistant') return fail(404)
    if (answer.content.length < 40) throw refusal(409, 'no_sources')
    const key = `${sessionId}:${messageId}`, list = factChecksByMessage.get(key) ?? []
    factChecksByMessage.set(key, list)
    return remember(list, request, () => {
      const sentences = answer.content.split(/(?<=[.!?])\s+/).map(item => item.trim()).filter(item => item.length > 0)
      const marks = ['supported', 'no-source', 'contradicted'] as const
      const claims = (sentences.length > 0 ? sentences : [answer.content]).slice(0, 3).map((sentence, index) => {
        const mark = marks[index % marks.length]
        return {
          claim: sentence.slice(0, 300), mark, sources: mark === 'no-source' ? [] : ['cite:preview-1'],
          note: mark === 'supported' ? 'The source says the same.' : mark === 'contradicted' ? 'The source says something different.' : 'No source covers this.',
        }
      })
      const counts = { supported: 0, contradicted: 0, 'no-source': 0 }
      for (const claim of claims) counts[claim.mark]++
      return {
        request_id: request.request_id, message_id: messageId, modelId: typeof request.model_id === 'string' ? request.model_id : 'preview-checker', claims, counts,
        sources: claims.some(claim => claim.sources.length > 0) ? [{ id: 'cite:preview-1', title: 'Preview source', url: 'https://example.com/' }] : [],
        sourcesTruncated: false, created_at: now() / 1000,
      }
    })
  }

  return function handle(path: string, method: 'GET' | 'POST' | 'PUT', options: Request): Json | undefined {
    let match: RegExpMatchArray | null
    if ((match = path.match(routes.judge))) return method === 'POST' ? judge(match[1], match[2], options) : undefined
    if ((match = path.match(routes.judgements))) {
      if (method !== 'GET') return undefined
      familyOf(match[1], match[2])
      return { results: (judgementsByFamily.get(`${match[1]}:${match[2]}`) ?? []).map(strip) }
    }
    if ((match = path.match(routes.vote))) return method === 'POST' ? vote(match[1], match[2], options) : undefined
    if ((match = path.match(routes.votes))) {
      if (method !== 'GET') return undefined
      familyOf(match[1], match[2])
      return { root_message_id: match[2], votes: { ...votesByFamily.get(`${match[1]}:${match[2]}`) } }
    }
    if ((match = path.match(routes.factCheck))) return method === 'POST' ? factCheck(match[1], match[2], options) : undefined
    if ((match = path.match(routes.factChecks))) {
      if (method !== 'GET') return undefined
      const answer = chatOf(match[1]).messages.find(item => item.id === match![2])
      if (!answer || answer.role !== 'assistant') return fail(404)
      return { results: (factChecksByMessage.get(`${match[1]}:${match[2]}`) ?? []).map(strip) }
    }
    return undefined
  }
}
