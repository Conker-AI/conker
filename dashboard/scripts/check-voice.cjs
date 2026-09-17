const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function load(file) {
  const filename = path.join(__dirname, '..', file)
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const module = { exports: {} }
  new Function('module', 'exports', compiled.outputText)(module, module.exports)
  return module.exports
}

const { insertTranscript } = load('src/lib/voice/draft.ts')
const { browserVoiceInput } = load('src/lib/voice/browser-voice-input.ts')
const checks = []
const check = async (name, fn) => { await fn(); checks.push(name) }
let recognizer
let tracks
let pendingMedia
let denyMedia
class FakeRecognition {
  constructor() { recognizer = this; this.aborted = false }
  start() { queueMicrotask(() => this.onstart?.()) }
  stop() { this.stopped = true }
  abort() { this.aborted = true }
  result(items) { this.onresult?.({ results: items.map(([transcript, isFinal]) => ({ 0: { transcript }, isFinal })) }) }
}
class FakeAudioContext {
  state = 'running'
  createAnalyser() { return { fftSize: 512, getByteTimeDomainData: samples => samples.fill(144) } }
  createMediaStreamSource() { return { connect() {}, disconnect() {} } }
  async close() { this.state = 'closed' }
}
function setup() {
  tracks = []
  pendingMedia = null
  denyMedia = false
  global.window = { isSecureContext: true, SpeechRecognition: FakeRecognition }
  global.AudioContext = FakeAudioContext
  Object.defineProperty(global, 'navigator', { configurable: true, value: { mediaDevices: {
    getUserMedia: async () => {
      if (denyMedia) throw new DOMException('Denied', 'NotAllowedError')
      if (pendingMedia) return pendingMedia
      const track = { stopped: false, stop() { this.stopped = true } }
      tracks.push(track)
      return { getTracks: () => [track] }
    },
  } } })
}
function options() {
  const controller = new AbortController()
  const events = { started: 0, ended: 0, errors: [], transcripts: [], levels: [] }
  return { controller, events, value: {
    language: 'he-IL', signal: controller.signal,
    onStart: () => events.started++, onEnd: () => events.ended++,
    onError: message => events.errors.push(message),
    onTranscript: value => events.transcripts.push(value), onLevel: value => events.levels.push(value),
  } }
}

async function main() {
  await check('Dictation inserts at the cursor and replaces only the selected text', () => {
    assert.deepEqual(insertTranscript('Create please', 'a website', { text: 'Create please', start: 7, end: 7 }), { text: 'Create a website please', caret: 17 })
    assert.equal(insertTranscript('Make a blue website.', 'green', { text: 'Make a blue website.', start: 7, end: 11 }).text, 'Make a green website.')
    assert.equal(insertTranscript('Hello.', 'world', { text: 'Hello.', start: 5, end: 5 }).text, 'Hello world.')
  })
  await check('Empty speech, RTL content, concurrent draft changes and long transcripts lose no text', () => {
    assert.equal(insertTranscript('Draft', ' ', { text: 'Draft', start: 0, end: 5 }).text, 'Draft')
    assert.equal(insertTranscript('שלום', 'עולם', { text: 'שלום', start: 4, end: 4 }).text, 'שלום עולם')
    assert.equal(insertTranscript('Draft plus a new idea', 'spoken words', { text: 'Draft', start: 0, end: 5 }).text, 'Draft plus a new idea spoken words')
    assert.equal(insertTranscript('', 'x'.repeat(4100), { text: '', start: 0, end: 0 }).text.length, 4100)
  })
  await check('Unsupported and insecure browsers explain how to recover', () => {
    setup(); window.isSecureContext = false
    assert.match(browserVoiceInput.availability().reason, /HTTPS/)
    window.isSecureContext = true; window.SpeechRecognition = undefined
    assert.match(browserVoiceInput.availability().reason, /Chrome or Safari/)
  })
  await check('Real recognition uses the selected language and replaces interim hypotheses', async () => {
    setup(); const run = options(); const session = await browserVoiceInput.start(run.value)
    assert.equal(recognizer.lang, 'he-IL'); assert.equal(recognizer.interimResults, true); assert.equal(recognizer.continuous, true)
    recognizer.result([['Create', true], ['a sight', false]])
    recognizer.result([['Create', true], ['a site', true]])
    assert.deepEqual(run.events.transcripts, [{ final: 'Create', interim: 'a sight' }, { final: 'Create a site', interim: '' }])
    await new Promise(resolve => setTimeout(resolve, 75))
    assert.ok(run.events.levels.some(level => level > 0), 'Meter must receive sampled microphone amplitude')
    session.cancel(); assert.ok(tracks.every(track => track.stopped))
  })
  await check('Use text releases capture immediately but retains the final result arriving after stop', async () => {
    setup(); const run = options(); const session = await browserVoiceInput.start(run.value)
    recognizer.result([['Create a', false]])
    session.stop(); assert.ok(recognizer.stopped); assert.ok(tracks.every(track => track.stopped)); assert.equal(run.events.ended, 0)
    recognizer.result([['Create a website.', true]])
    recognizer.onend()
    assert.equal(run.events.transcripts.at(-1).final, 'Create a website.')
    assert.equal(run.events.ended, 1); session.cancel(); assert.equal(run.events.ended, 1)
  })
  await check('Call captions borrow capture without opening or stopping the call microphone', async () => {
    setup(); const run = options()
    const borrowedTrack = { stopped: false, stop() { this.stopped = true } }
    const stream = { getTracks: () => [borrowedTrack] }
    const session = await browserVoiceInput.start({ ...run.value, inputStream: stream })
    assert.equal(tracks.length, 0, 'Caption startup must reuse the existing capture for its meter')
    recognizer.result([['Hello from a call', false]])
    assert.equal(run.events.transcripts.at(-1).interim, 'Hello from a call')
    run.controller.abort()
    assert.equal(recognizer.aborted, true)
    assert.equal(borrowedTrack.stopped, false, 'Caption cancellation must not turn off the call microphone')
    recognizer.result([['Late words', true]])
    assert.equal(run.events.transcripts.length, 1)
    session.cancel(); assert.equal(run.events.ended, 1)
  })
  await check('Speech errors retain their code so calls can resume after silence', async () => {
    setup(); const run = options(); const errors = []
    await browserVoiceInput.start({ ...run.value, onError: (message, code) => errors.push({ message, code }) })
    recognizer.onerror({ error: 'no-speech' })
    assert.equal(errors[0].code, 'no-speech')
    assert.match(errors[0].message, /No speech/)
    assert.equal(run.events.ended, 1)
    assert.ok(tracks.every(track => track.stopped))
  })
  await check('Cancel ignores late recognition events and ends exactly once', async () => {
    setup(); const run = options(); const session = await browserVoiceInput.start(run.value)
    session.cancel(); recognizer.result([['late words', true]]); session.cancel()
    assert.equal(run.events.transcripts.length, 0); assert.equal(run.events.ended, 1)
    assert.ok(recognizer.aborted); assert.ok(tracks.every(track => track.stopped))
  })
  await check('Cancelling a pending permission request releases a microphone granted afterward', async () => {
    setup(); let grant
    pendingMedia = new Promise(resolve => { grant = resolve })
    const run = options(); const started = browserVoiceInput.start(run.value)
    const rejected = assert.rejects(started, { name: 'AbortError' })
    run.controller.abort()
    const track = { stopped: false, stop() { this.stopped = true } }
    grant({ getTracks: () => [track] })
    await rejected
    assert.ok(track.stopped); assert.equal(run.events.ended, 1); assert.equal(run.events.started, 0)
  })
  await check('Permission denial and connection failures produce actionable errors and release capture', async () => {
    setup(); denyMedia = true; const denied = options()
    await assert.rejects(browserVoiceInput.start(denied.value), /Microphone access was blocked/)
    assert.equal(denied.events.ended, 1)
    setup(); const run = options(); await browserVoiceInput.start(run.value)
    recognizer.result([['Keep this draft', true]])
    recognizer.onerror({ error: 'network' })
    assert.match(run.events.errors[0], /connection/); assert.ok(tracks.every(track => track.stopped))
    assert.equal(run.events.transcripts.at(-1).final, 'Keep this draft'); assert.equal(run.events.ended, 1)
  })
  await check('Read aloud chunks long responses, cancels previous playback, and ignores late callbacks', () => {
    const { readAloud } = load('src/lib/voice/read-aloud.ts')
    const spoken = [], errors = []
    let cancellations = 0, notifications = 0
    global.SpeechSynthesisUtterance = class { constructor(text) { this.text = text } }
    global.window = { SpeechSynthesisUtterance, speechSynthesis: { speak: utterance => spoken.push(utterance), cancel: () => cancellations++ } }
    const unsubscribe = readAloud.subscribe(() => notifications++)
    const original = 'Read this sentence with care. '.repeat(40).trim()
    readAloud.start('first', original, error => errors.push(error))
    assert.equal(readAloud.getSnapshot(), 'first')
    for (let index = 0; index < spoken.length; index++) spoken[index].onend()
    assert.ok(spoken.length > 1)
    assert.equal(spoken.map(utterance => utterance.text).join(' '), original)
    assert.equal(readAloud.getSnapshot(), null)
    readAloud.start('first', 'Old playback', error => errors.push(error))
    const old = spoken.at(-1)
    readAloud.start('second', 'New playback', error => errors.push(error))
    old.onend(); old.onerror({ error: 'interrupted' })
    assert.equal(readAloud.getSnapshot(), 'second')
    readAloud.stop('first'); assert.equal(readAloud.getSnapshot(), 'second')
    readAloud.stop('second'); assert.equal(readAloud.getSnapshot(), null)
    assert.equal(cancellations, 2); assert.deepEqual(errors, [])
    assert.ok(notifications > 0); unsubscribe()
  })
  await check('Read aloud reports unavailable engines and recovers from playback failures', () => {
    const { readAloud } = load('src/lib/voice/read-aloud.ts')
    const errors = []
    global.window = {}
    readAloud.start('first', 'Text', error => errors.push(error))
    assert.match(errors.pop(), /unavailable/)
    let utterance
    window.SpeechSynthesisUtterance = global.SpeechSynthesisUtterance
    window.speechSynthesis = { speak: value => { utterance = value }, cancel() {} }
    readAloud.start('first', 'Text', error => errors.push(error))
    utterance.onerror({ error: 'audio-busy' })
    assert.match(errors.pop(), /couldn’t read/); assert.equal(readAloud.getSnapshot(), null)
    window.speechSynthesis.speak = () => { throw new Error('Unavailable') }
    readAloud.start('first', 'Text', error => errors.push(error))
    assert.match(errors.pop(), /couldn’t start/); assert.equal(readAloud.getSnapshot(), null)
  })
  console.log(checks.map(name => `PASS ${name}`).join('\n'))
  console.log(`${checks.length} voice checks passed.`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
