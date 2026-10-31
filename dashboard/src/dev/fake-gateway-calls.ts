/**
 * Development-only browser call fixture for the preview: one synthetic call per conversation with
 * typed turns, pause and privacy updates, and end or interrupt events; no audio is ever captured.
 */
type Json = Record<string, unknown>
type Request = { method?: 'GET' | 'POST' | 'PUT'; body?: Json }

export function createFakeCalls(now: () => number, fail: (status: number) => never) {
  let counter = 0
  let browserCall: Json | null = null
  const callEvent = (kind: 'event' | 'user' | 'assistant', text: string): Json => ({ id: `call_event_${(++counter).toString(16)}`, at: now(), kind, text, source: null })
  const createBrowserCall = (conversationId: string): Json => ({
    schemaVersion: 1, id: `call_${'9'.repeat(32)}`, conversationId, sessionId: `ses_${'9'.repeat(16)}`, agentId: 'companion', name: 'Call',
    startedAt: now(), endedAt: null, revision: 1, generation: 1, phase: 'ready', paused: false,
    channels: { microphone: false, camera: false, keyboard: true, voice: false, avatar: false, captions: true }, mode: 'focus', modelId: null,
    privacy: { memory: false, harness: false }, events: [callEvent('event', 'Call started · English; no recording')], requests: [],
    eventsTruncated: false, requestsTruncated: false, capabilities: { typedTurns: true, speech: 'bounded-audio-turns', camera: 'unavailable', perception: 'unavailable', emotion: 'unavailable', characterVoice: 'adapter-dependent; inspect call capabilities', channels: 'client-owned capture; preferences gate transport', rawMediaRetention: 'none', audioReplay: 'unavailable', interruption: 'cooperative; in-flight effects cannot be recalled' },
    authority: 'none', execution: 'typed-and-audio-turns', contentIncluded: true, audioIncluded: false, retention: 'transcript-persisted; raw-media-none',
  })
  return function handle(path: string, method: 'GET' | 'POST' | 'PUT', options: Request): Json | undefined {
    let match: RegExpMatchArray | null
    if (path === '/api/control/pi/calls/browser/capabilities' && method === 'GET') return {
      schemaVersion: 1, typedTurns: true, language: 'en', speechInput: 'unconfigured', speechOutput: 'unconfigured', inputMimeTypes: ['audio/wav'], outputMimeTypes: ['audio/wav'], maxAudioBytes: 10485760, maxAudioSeconds: 120, camera: 'unavailable', perception: 'unavailable', rawMediaRetention: 'none', transcriptRetention: 'persisted-with-call-conversation', devices: 'client-owned; not captured by Pi', authority: 'none',
    }
    if ((match = path.match(/^\/api\/control\/pi\/calls\/browser\/active\/([A-Za-z0-9_-]{1,200})$/)) && method === 'GET') {
      if (!browserCall || browserCall.conversationId !== match[1] || browserCall.endedAt !== null) return fail(404)
      return browserCall
    }
    if (path === '/api/control/pi/calls/browser' && method === 'POST') {
      if (browserCall && browserCall.conversationId === options.body?.conversationId && browserCall.endedAt === null) return fail(409)
      browserCall = createBrowserCall(String(options.body?.conversationId))
      return browserCall
    }
    if ((match = path.match(/^\/api\/control\/pi\/calls\/browser\/(call_[a-f0-9]{32})(?:\/(update|interrupt|end|turns))?$/))) {
      if (!browserCall || browserCall.id !== match[1]) return fail(404)
      if (!match[2] && method === 'GET') return browserCall
      if (method !== 'POST') return fail(405)
      if (match[2] === 'turns') {
        const existing = (browserCall.requests as Json[]).find(item => item.requestId === options.body?.request_id)
        if (existing) return { schemaVersion: 1, call: browserCall, replayed: true, audioIncluded: false, transcriptionIncluded: false, execution: 'typed-turn' }
        const text = String(options.body?.text ?? '')
        ;(browserCall.events as Json[]).push(callEvent('user', text), callEvent('assistant', 'I’m here. Let’s keep this focused and work through it one step at a time.'))
        ;(browserCall.requests as Json[]).push({ requestId: options.body?.request_id, state: 'complete', inputKind: 'text', speechStatus: 'not-requested', errorCode: null, turnId: `turn_${(++counter).toString(16)}`, turnStatus: 'complete', textStatus: 'complete', acted: false, messageIds: [] })
        browserCall.contentIncluded = true
        return { schemaVersion: 1, call: browserCall, replayed: false, audioIncluded: false, transcriptionIncluded: false, execution: 'typed-turn' }
      }
      if (Number(options.body?.expected_revision) !== browserCall.revision) return fail(409)
      browserCall.revision = Number(browserCall.revision) + 1
      if (match[2] === 'update') {
        if (typeof options.body?.paused === 'boolean') browserCall.paused = options.body.paused
        if (options.body?.mode === 'focus' || options.body?.mode === 'character') browserCall.mode = options.body.mode
        if (options.body?.privacy) browserCall.privacy = structuredClone(options.body.privacy as Json)
        ;(browserCall.events as Json[]).push(callEvent('event', browserCall.paused ? 'Call paused' : 'Call preferences updated'))
      } else {
        browserCall.generation = Number(browserCall.generation) + 1
        if (match[2] === 'end') { browserCall.endedAt = now(); browserCall.phase = 'ended' }
        ;(browserCall.events as Json[]).push(callEvent('event', match[2] === 'end' ? 'Call ended' : 'Response interrupted; in-flight effects may still finish'))
      }
      return browserCall
    }
    return undefined
  }
}
