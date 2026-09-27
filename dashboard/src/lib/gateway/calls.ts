import { z } from 'zod'
import type { GatewayAuthClient } from './auth'
import { GatewayError } from './transport'

const callId = z.string().regex(/^call_[a-f0-9]{32}$/)
const sessionId = z.string().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/)
const requestId = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/)
const channels = z.object({ microphone: z.boolean(), camera: z.boolean(), keyboard: z.boolean(), voice: z.boolean(), avatar: z.boolean(), captions: z.boolean() }).strict()
const privacy = z.object({ memory: z.boolean(), harness: z.boolean() }).strict()
const event = z.object({
  id: z.string().min(1).max(200), at: z.number().finite().nonnegative(), kind: z.enum(['event', 'user', 'assistant']), text: z.string().max(16_000),
  source: z.object({ sessionId: z.string().min(1).max(200), messageId: z.string().min(1).max(200) }).strict().nullable(),
}).strict()
const receipt = z.object({
  requestId, state: z.enum(['reserved', 'transcribing', 'model', 'synthesizing', 'complete', 'held', 'failed', 'unknown', 'forgotten']),
  inputKind: z.enum(['text', 'audio']), speechStatus: z.string().max(100), errorCode: z.string().max(100).nullable(),
  turnId: z.string().max(200).nullable(), turnStatus: z.string().max(100).nullable(), textStatus: z.enum(['complete', 'not-complete']),
  acted: z.boolean(), messageIds: z.array(z.string().max(200)).max(4),
}).strict()
const call = z.object({
  schemaVersion: z.literal(1), id: callId, conversationId: z.string().min(1).max(200), sessionId: z.string().min(1).max(200),
  agentId: z.string().regex(/^(?:companion|agent_[a-f0-9]{32})$/), name: z.literal('Call'), startedAt: z.number().finite().nonnegative(),
  endedAt: z.number().finite().nonnegative().nullable(), revision: z.number().int().min(1), generation: z.number().int().min(1),
  phase: z.enum(['ready', 'thinking', 'responding', 'ended']), paused: z.boolean(), channels, mode: z.enum(['focus', 'character']),
  modelId: z.string().max(200).nullable(), privacy, events: z.array(event).max(200), requests: z.array(receipt).max(100),
  eventsTruncated: z.boolean(), requestsTruncated: z.boolean(), capabilities: z.object({
    typedTurns: z.literal(true), speech: z.literal('bounded-audio-turns'), camera: z.literal('unavailable'), perception: z.literal('unavailable'),
    emotion: z.literal('unavailable'), characterVoice: z.literal('adapter-dependent; inspect call capabilities'), channels: z.literal('client-owned capture; preferences gate transport'),
    rawMediaRetention: z.literal('none'), audioReplay: z.literal('unavailable'), interruption: z.literal('cooperative; in-flight effects cannot be recalled'),
  }).strict(), authority: z.literal('none'), execution: z.literal('typed-and-audio-turns'), contentIncluded: z.boolean(), audioIncluded: z.literal(false),
  retention: z.literal('transcript-persisted; raw-media-none'),
}).strict()
const turn = z.object({ schemaVersion: z.literal(1), call, replayed: z.boolean(), audioIncluded: z.literal(false), transcriptionIncluded: z.literal(false), execution: z.literal('typed-turn') }).strict()
const audioTurn = z.object({
  schemaVersion: z.literal(1), call, replayed: z.boolean(), execution: z.literal('audio-turn'), audioIncluded: z.boolean(), transcriptionIncluded: z.boolean(),
  audio: z.object({ base64: z.string().min(1).max(14_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/), mime: z.literal('audio/wav'), durationSeconds: z.number().finite().min(0).max(120).nullable(), retention: z.literal('transient-response-only') }).strict().nullable(),
  transcription: z.object({ text: z.string().min(1).max(4000), durationSeconds: z.number().finite().min(0).max(120).nullable(), timing: z.enum(['provider-words', 'provider-segments', 'unavailable']), retention: z.literal('transient-response-only') }).strict().nullable(),
}).strict().superRefine((value, context) => {
  if (value.audioIncluded !== (value.audio !== null)) context.addIssue({ code: 'custom', message: 'Audio inclusion mismatch.' })
  if (value.transcriptionIncluded !== (value.transcription !== null)) context.addIssue({ code: 'custom', message: 'Transcription inclusion mismatch.' })
})
const availability = z.object({
  schemaVersion: z.literal(1), typedTurns: z.literal(true), language: z.literal('en'), speechInput: z.enum(['configured', 'available', 'unavailable', 'unconfigured']),
  speechOutput: z.enum(['configured', 'available', 'unavailable', 'unconfigured']), inputMimeTypes: z.tuple([z.literal('audio/wav')]), outputMimeTypes: z.tuple([z.literal('audio/wav')]), maxAudioBytes: z.literal(10_485_760), maxAudioSeconds: z.literal(120), camera: z.literal('unavailable'), perception: z.literal('unavailable'), rawMediaRetention: z.literal('none'),
  transcriptRetention: z.literal('persisted-with-call-conversation'), devices: z.literal('client-owned; not captured by Pi'), authority: z.literal('none'),
}).strict()

export type GatewayCall = z.infer<typeof call>
export type GatewayCallTurn = z.infer<typeof turn>
export type GatewayCallAudioTurn = z.infer<typeof audioTurn>
export type GatewayCallAvailability = z.infer<typeof availability>

function parse<T>(schema: z.ZodType<T>, value: unknown, input = false): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new GatewayError(input ? 'validation' : 'invalid-response')
  return result.data
}

export function createCallRequestId(kind: 'start' | 'turn' | 'audio') {
  return `browser_call_${kind}_${globalThis.crypto.randomUUID().replaceAll('-', '')}`
}

export function createGatewayCallsClient(auth: Pick<GatewayAuthClient, 'request' | 'audio'>) {
  const base = '/api/control/pi/calls/browser'
  const bound = (value: GatewayCall, expected?: { call?: string; conversation?: string }) => {
    if (expected?.call && value.id !== expected.call) throw new GatewayError('invalid-response')
    if (expected?.conversation && value.conversationId !== expected.conversation) throw new GatewayError('invalid-response')
    return value
  }
  return {
    async availability(signal?: AbortSignal): Promise<GatewayCallAvailability> {
      return parse(availability, await auth.request(`${base}/capabilities`, { signal }))
    },
    async active(conversation: string, signal?: AbortSignal): Promise<GatewayCall> {
      const selected = parse(sessionId, conversation, true)
      return bound(parse(call, await auth.request(`${base}/active/${selected}`, { signal })), { conversation: selected })
    },
    async get(id: string, signal?: AbortSignal): Promise<GatewayCall> {
      const selected = parse(callId, id, true)
      return bound(parse(call, await auth.request(`${base}/${selected}`, { signal })), { call: selected })
    },
    async start(id: string, conversation: string, signal?: AbortSignal): Promise<GatewayCall> {
      const input = { request_id: parse(requestId, id, true), conversationId: parse(sessionId, conversation, true) }
      return bound(parse(call, await auth.request(base, { method: 'POST', body: input, signal })), { conversation: input.conversationId })
    },
    async update(id: string, revision: number, patch: { paused?: boolean; mode?: 'focus' | 'character'; privacy?: { memory: boolean; harness: boolean }; channels?: Partial<z.infer<typeof channels>> }, signal?: AbortSignal): Promise<GatewayCall> {
      const selected = parse(callId, id, true)
      const body = parse(z.object({ expected_revision: z.number().int().min(1), paused: z.boolean().optional(), mode: z.enum(['focus', 'character']).optional(), privacy: privacy.optional(), channels: channels.partial().optional() }).strict(), { expected_revision: revision, ...patch }, true)
      return bound(parse(call, await auth.request(`${base}/${selected}/update`, { method: 'POST', body, signal })), { call: selected })
    },
    async interrupt(id: string, revision: number, signal?: AbortSignal): Promise<GatewayCall> {
      const selected = parse(callId, id, true), expected = parse(z.number().int().min(1), revision, true)
      return bound(parse(call, await auth.request(`${base}/${selected}/interrupt`, { method: 'POST', body: { expected_revision: expected }, signal })), { call: selected })
    },
    async end(id: string, revision: number, signal?: AbortSignal): Promise<GatewayCall> {
      const selected = parse(callId, id, true), expected = parse(z.number().int().min(1), revision, true)
      return bound(parse(call, await auth.request(`${base}/${selected}/end`, { method: 'POST', body: { expected_revision: expected }, signal })), { call: selected })
    },
    async turn(id: string, request: string, text: string, signal?: AbortSignal): Promise<GatewayCallTurn> {
      const selected = parse(callId, id, true)
      const body = { request_id: parse(requestId, request, true), text: parse(z.string().trim().min(1).max(4000), text, true), language: 'en' as const }
      const value = parse(turn, await auth.request(`${base}/${selected}/turns`, { method: 'POST', body, signal }))
      if (value.call.id !== selected) throw new GatewayError('invalid-response')
      return value
    },
    async audioTurn(id: string, request: string, audio: Uint8Array, signal?: AbortSignal): Promise<GatewayCallAudioTurn> {
      const selected = parse(callId, id, true), selectedRequest = parse(requestId, request, true)
      if (!(audio instanceof Uint8Array) || !audio.byteLength || audio.byteLength > 10_485_760) throw new GatewayError('validation')
      const value = parse(audioTurn, await auth.audio(`${base}/${selected}/audio`, selectedRequest, audio, signal))
      if (value.call.id !== selected) throw new GatewayError('invalid-response')
      return value
    },
  }
}

export type GatewayCallsClient = ReturnType<typeof createGatewayCallsClient>
