const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..'), cache = new Map()
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports
  const module = { exports: {} }; cache.set(relative, module)
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(request => request === 'zod' ? require('zod') : load(`${path.posix.normalize(path.posix.join(path.posix.dirname(relative), request))}.ts`), module, module.exports)
  return module.exports
}

const { createGatewayCallsClient } = load('src/lib/gateway/calls.ts')
const { createGatewayTransport, isConversationWrite } = load('src/lib/gateway/transport.ts')
const id = `call_${'a'.repeat(32)}`, conversation = 'ses_source_123456', request = 'browser_call_turn_123456'
const call = {
  schemaVersion: 1, id, conversationId: conversation, sessionId: 'ses_child_123456', agentId: 'companion', name: 'Call', startedAt: 1, endedAt: null,
  revision: 1, generation: 1, phase: 'ready', paused: false, channels: { microphone: false, camera: false, keyboard: true, voice: false, avatar: false, captions: true },
  mode: 'focus', modelId: null, privacy: { memory: false, harness: false }, events: [{ id: 'call_event_1', at: 1, kind: 'event', text: 'Call started', source: null }], requests: [],
  eventsTruncated: false, requestsTruncated: false, capabilities: { typedTurns: true, speech: 'bounded-audio-turns', camera: 'unavailable', perception: 'unavailable', emotion: 'unavailable', characterVoice: 'adapter-dependent; inspect call capabilities', channels: 'client-owned capture; preferences gate transport', rawMediaRetention: 'none', audioReplay: 'unavailable', interruption: 'cooperative; in-flight effects cannot be recalled' },
  authority: 'none', execution: 'typed-and-audio-turns', contentIncluded: true, audioIncluded: false, retention: 'transcript-persisted; raw-media-none',
}
const available = { schemaVersion: 1, typedTurns: true, language: 'en', speechInput: 'configured', speechOutput: 'configured', inputMimeTypes: ['audio/wav'], outputMimeTypes: ['audio/wav'], maxAudioBytes: 10485760, maxAudioSeconds: 120, camera: 'unavailable', perception: 'unavailable', rawMediaRetention: 'none', transcriptRetention: 'persisted-with-call-conversation', devices: 'client-owned; not captured by Pi', authority: 'none' }

async function main() {
  const calls = [], client = createGatewayCallsClient({
    request: async (...args) => { calls.push(args); if (args[0].endsWith('/capabilities')) return available; if (args[0].endsWith('/turns')) return { schemaVersion: 1, call, replayed: false, audioIncluded: false, transcriptionIncluded: false, execution: 'typed-turn' }; return call },
    audio: async (...args) => { calls.push(args); return { schemaVersion: 1, call, replayed: false, execution: 'audio-turn', audioIncluded: true, transcriptionIncluded: true, audio: { base64: 'UklGRg==', mime: 'audio/wav', durationSeconds: 0.2, retention: 'transient-response-only' }, transcription: { text: 'hello', durationSeconds: 0.2, timing: 'unavailable', retention: 'transient-response-only' } } },
  })
  assert.equal((await client.availability()).speechInput, 'configured')
  assert.equal((await client.active(conversation)).id, id)
  assert.equal(calls.pop()[0], `/api/control/pi/calls/browser/active/${conversation}`)
  assert.equal((await client.start('browser_call_start_123456', conversation)).conversationId, conversation)
  assert.deepEqual(calls.pop(), ['/api/control/pi/calls/browser', { method: 'POST', body: { request_id: 'browser_call_start_123456', conversationId: conversation }, signal: undefined }])
  await client.update(id, 1, { paused: true }); assert.equal(calls.pop()[0], `/api/control/pi/calls/browser/${id}/update`)
  await client.interrupt(id, 1); assert.equal(calls.pop()[0], `/api/control/pi/calls/browser/${id}/interrupt`)
  await client.end(id, 1); assert.equal(calls.pop()[0], `/api/control/pi/calls/browser/${id}/end`)
  assert.equal((await client.turn(id, request, 'Think with me.')).audioIncluded, false)
  assert.equal((await client.audioTurn(id, 'browser_call_audio_123456', new Uint8Array([1, 2]))).transcription.text, 'hello')
  await assert.rejects(createGatewayCallsClient({ request: async () => ({ ...call, audioIncluded: true }), audio: async () => ({}) }).get(id), error => error.kind === 'invalid-response')
  await assert.rejects(client.turn(id, request, '   '), error => error.kind === 'validation')

  let count = 0
  const transport = createGatewayTransport({ origin: 'https://localhost:8050', fetch: async (_url, options) => { count++; const url = String(_url); return new Response(JSON.stringify(url.endsWith('/capabilities') ? available : url.endsWith('/turns') ? { schemaVersion: 1, call, replayed: false, audioIncluded: false, transcriptionIncluded: false, execution: 'typed-turn' } : call), { headers: { 'content-type': 'application/json' } }) } })
  await transport.request('/api/control/pi/calls/browser/capabilities')
  await transport.request(`/api/control/pi/calls/browser/active/${conversation}`)
  await transport.request(`/api/control/pi/calls/browser/${id}`)
  await transport.request('/api/control/pi/calls/browser', { method: 'POST', csrfToken: 'x'.repeat(43), body: { request_id: 'browser_call_start_123456', conversationId: conversation } })
  await transport.request(`/api/control/pi/calls/browser/${id}/turns`, { method: 'POST', csrfToken: 'x'.repeat(43), body: { request_id: request, text: 'Think', language: 'en' } })
  await transport.audio(`/api/control/pi/calls/browser/${id}/audio`, 'browser_call_audio_123456', new Uint8Array([1, 2]), 'x'.repeat(43))
  await assert.rejects(transport.audio(`/api/control/pi/calls/browser/${id}/audio`, 'short', new Uint8Array([1]), 'x'.repeat(43)), error => error.kind === 'validation')
  await assert.rejects(transport.request('/api/control/pi/calls/capabilities'), error => error.kind === 'validation')
  assert.equal(count, 6)
  assert(isConversationWrite('/api/control/pi/calls/browser'))
  assert(isConversationWrite(`/api/control/pi/calls/browser/${id}/turns`))
  assert(isConversationWrite(`/api/control/pi/calls/browser/${id}/audio`))

  const ui = fs.readFileSync(path.join(root, 'src/components/gateway/call-workspace.tsx'), 'utf8')
  assert.match(ui, /recordings and generated audio are not retained/)
  assert.match(ui, /check the saved call before sending anything else/)
  assert.match(ui, /Retry same request/)
  assert.match(ui, /in-flight effects already in flight cannot be recalled|external effect already in flight cannot be recalled/)
  assert.match(ui, /useGatewayCallAudio|audioTurn|Send voice/)
  console.log('Gateway calls passed: typed and transient audio turns, session-level writes, durable recovery, and bounded browser media transport.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
