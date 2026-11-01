/** Development-only preview fixture for answer reviews (judge, votes, fact checks). */
import type { FakeChatStore } from './fake-gateway'
import { GatewayError } from '@/lib/gateway/transport'

type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST' | 'PUT'; body?: Json }

interface StoredJudgement {
  requestId: string
  judgeModelId: string
  rubric: string
  scores: { messageId: string; score: number; reason: string }[]
  winner: string
  excluded: string[]
  createdAt: number
}

interface StoredVotes {
  rootMessageId: string
  votes: Record<string, 'up' | 'down' | 'winner'>
}

interface StoredFactCheck {
  requestId: string
  messageId: string
  modelId: string
  claims: { claim: string; mark: 'supported' | 'contradicted' | 'no-source'; sources: string[]; note: string }[]
  counts: { supported: number; contradicted: number; noSource: number }
  sources: { id: string; title: string; url: string }[]
  sourcesTruncated: boolean
  createdAt: number
}

export function createFakeChatReviews(now: () => number, fail: (status: number) => never, store: FakeChatStore) {
  const judgementsByFamily = new Map<string, StoredJudgement[]>()
  const votesByFamily = new Map<string, StoredVotes>()
  const factChecksByMessage = new Map<string, StoredFactCheck[]>()

  const messageId = /^msg_[0-9a-f]{16}$/
  const requestId = /^[A-Za-z0-9_-]{16,128}$/

  function findFamily(sessionId: string, rootId: string) {
    store.sessions.find(s => s.id === sessionId)
    const family = store.sessions.flatMap(s => s.messages).filter(m =>
      m.response_family?.root_message_id === rootId
    )
    if (family.length === 0) fail(404)

    return { family }
  }

  function findMessage(sessionId: string, messageId: string) {
    store.sessions.find(s => s.id === sessionId)
    const message = store.sessions.flatMap(s => s.messages).find(m => m.id === messageId)
    if (!message) fail(404)

    if (message.role !== 'assistant') fail(404)

    return { message }
  }

  return function handle(path: string, method: 'GET' | 'POST' | 'PUT', options: Request): Json | undefined {
    const judgeMatch = path.match(/^\/api\/control\/pi\/sessions\/(ses_[0-9a-f]{16})\/response-families\/(msg_[0-9a-f]{16})\/judge$/)
    const judgementsMatch = path.match(/^\/api\/control\/pi\/sessions\/(ses_[0-9a-f]{16})\/response-families\/(msg_[0-9a-f]{16})\/judgements$/)
    const voteMatch = path.match(/^\/api\/control\/pi\/sessions\/(ses_[0-9a-f]{16})\/response-families\/(msg_[0-9a-f]{16})\/vote$/)
    const votesMatch = path.match(/^\/api\/control\/pi\/sessions\/(ses_[0-9a-f]{16})\/response-families\/(msg_[0-9a-f]{16})\/votes$/)
    const factCheckMatch = path.match(/^\/api\/control\/pi\/sessions\/(ses_[0-9a-f]{16})\/messages\/(msg_[0-9a-f]{16})\/fact-check$/)
    const factChecksMatch = path.match(/^\/api\/control\/pi\/sessions\/(ses_[0-9a-f]{16})\/messages\/(msg_[0-9a-f]{16})\/fact-checks$/)

    if (judgeMatch && method === 'POST') {
      const [, sid, rid] = judgeMatch
      const { family } = findFamily(sid, rid)

      if (family.length < 2) {
        throw new GatewayError('http', 409, undefined, 'too_few')
      }

      const body = options.body as Record<string, unknown>
      if (!body || typeof body.request_id !== 'string' || !requestId.test(body.request_id)) {
        fail(422)
      }

      const familyKey = `${sid}:${rid}`
      const existing = judgementsByFamily.get(familyKey) || []
      const replayed = existing.find(j => j.requestId === body.request_id)

      if (replayed) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { requestId: _, ...response } = replayed
        return { ...response, replayed: true }
      }

      // Generate deterministic scores based on content length
      const scores = family.map((msg, index) => {
        const contentLength = msg.content.length
        const score = Math.max(1, Math.min(10, (contentLength % 10) + 1))
        return {
          messageId: msg.id,
          score,
          reason: `Version ${index + 1} analysis based on content structure.`,
        }
      })

      const winner = scores.reduce((best, current) =>
        current.score > best.score ? current : best
      ).messageId

      const judgement: StoredJudgement = {
        requestId: body.request_id,
        judgeModelId: 'fake-judge-model',
        rubric: body.rubric || '',
        scores,
        winner,
        excluded: [],
        createdAt: now(),
      }

      existing.unshift(judgement)
      if (existing.length > 20) existing.pop()
      judgementsByFamily.set(familyKey, existing)

      const { requestId, ...response } = judgement
      return { ...response, replayed: false }
    }

    if (judgementsMatch && method === 'GET') {
      const [, sid, rid] = judgementsMatch
      findFamily(sid, rid) // Validate family exists

      const familyKey = `${sid}:${rid}`
      const results = judgementsByFamily.get(familyKey) || []
      return { results }
    }

    if (voteMatch && method === 'POST') {
      const [, sid, rid] = voteMatch
      const { family } = findFamily(sid, rid)

      const body = options.body as Record<string, unknown>
      if (!body || typeof body.message_id !== 'string' || !messageId.test(body.message_id) ||
          !['up', 'down', 'winner', 'clear'].includes(body.vote)) {
        fail(422)
      }

      const messageExists = family.some(m => m.id === body.message_id)
      if (!messageExists) {
        throw new GatewayError('http', 422, undefined, 'not_a_version')
      }

      const familyKey = `${sid}:${rid}`
      let votes = votesByFamily.get(familyKey)

      if (!votes) {
        votes = { rootMessageId: rid, votes: {} }
        votesByFamily.set(familyKey, votes)
      }

      if (body.vote === 'clear') {
        delete votes.votes[body.message_id]
      } else {
        // If voting winner, demote any previous winner to 'up'
        if (body.vote === 'winner') {
          Object.entries(votes.votes).forEach(([id, vote]) => {
            if (vote === 'winner') votes.votes[id] = 'up'
          })
        }
        votes.votes[body.message_id] = body.vote
      }

      return votes
    }

    if (votesMatch && method === 'GET') {
      const [, sid, rid] = votesMatch
      findFamily(sid, rid) // Validate family exists

      const familyKey = `${sid}:${rid}`
      return votesByFamily.get(familyKey) || { rootMessageId: rid, votes: {} }
    }

    if (factCheckMatch && method === 'POST') {
      const [, sid, mid] = factCheckMatch
      const { message } = findMessage(sid, mid)

      if (message.content.length < 40) {
        throw new GatewayError('http', 409, undefined, 'no_sources')
      }

      const body = options.body as Record<string, unknown>
      if (!body || typeof body.request_id !== 'string' || !requestId.test(body.request_id)) {
        fail(422)
      }

      const messageKey = `${sid}:${mid}`
      const existing = factChecksByMessage.get(messageKey) || []
      const replayed = existing.find(fc => fc.requestId === body.request_id)

      if (replayed) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { requestId: _, ...response } = replayed
        return { ...response, replayed: true }
      }

      // Generate up to 3 claims from sentences
      const sentences = message.content.split('.').filter(s => s.trim().length > 10)
      const claims = sentences.slice(0, 3).map((sentence, index) => {
        const marks: ('supported' | 'contradicted' | 'no-source')[] = ['supported', 'no-source', 'contradicted']
        const mark = marks[index % marks.length]

        return {
          claim: sentence.trim() + '.',
          mark,
          sources: mark === 'no-source' ? [] : [`cite:preview-${index + 1}`],
          note: `Analysis of claim ${index + 1}.`,
        }
      })

      const counts = claims.reduce((acc, claim) => {
        if (claim.mark === 'supported') acc.supported++
        else if (claim.mark === 'contradicted') acc.contradicted++
        else acc.noSource++
        return acc
      }, { supported: 0, contradicted: 0, noSource: 0 })

      const sources = claims.flatMap(claim =>
        claim.sources.map(sourceId => ({
          id: sourceId,
          title: 'Preview source',
          url: 'https://example.com/',
        }))
      )

      const factCheck: StoredFactCheck = {
        requestId: body.request_id,
        messageId: mid,
        modelId: 'fake-fact-check-model',
        claims,
        counts,
        sources,
        sourcesTruncated: false,
        createdAt: now(),
      }

      existing.unshift(factCheck)
      if (existing.length > 20) existing.pop()
      factChecksByMessage.set(messageKey, existing)

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { requestId: _, ...response } = factCheck
      return { ...response, replayed: false }
    }

    if (factChecksMatch && method === 'GET') {
      const [, sid, mid] = factChecksMatch
      findMessage(sid, mid) // Validate message exists

      const messageKey = `${sid}:${mid}`
      const results = factChecksByMessage.get(messageKey) || []
      return { results }
    }

    return undefined
  }
}
