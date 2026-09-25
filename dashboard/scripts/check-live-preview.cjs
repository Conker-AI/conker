const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { createRequire } = require('node:module')

const root = path.resolve(__dirname, '..')
const { build } = createRequire(require.resolve('vite', { paths: [root] }))('esbuild')

const ORIGIN = 'https://conker.test'
const encoder = new TextEncoder()
const sse = (...events) => events.map(([event, data, id]) => `${id ? `id: ${id}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('')

/** A fetch that serves each queued body once, split into small chunks to exercise buffering. */
function server(bodies, status = 200, type = 'text/event-stream', chunkSize = 7) {
  const calls = []
  const fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    const body = bodies.shift()
    if (body instanceof Error) throw body
    const bytes = encoder.encode(body ?? '')
    const stream = new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += chunkSize) controller.enqueue(bytes.slice(i, i + chunkSize)); controller.close() } })
    return new Response(stream, { status, headers: { 'content-type': type } })
  }
  return { fetch, calls }
}

async function main() {
  const cache = path.join(root, 'node_modules/.cache')
  await fs.mkdir(cache, { recursive: true })
  const temporary = await fs.mkdtemp(path.join(cache, 'conker-live-preview-'))
  try {
    const output = path.join(temporary, 'live-preview.cjs')
    await build({ stdin: { contents: await fs.readFile(path.join(root, 'src/lib/gateway/live-preview.ts'), 'utf8'), loader: 'ts', sourcefile: 'live-preview.ts' }, outfile: output, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' })
    const { parseSseEvents, applyPreviewEvent, followLivePreview, LIVE_PREVIEW_BYTE_LIMIT } = require(output)
    const run = (fetch, signal = new AbortController().signal) => {
      const seen = []
      return followLivePreview('req_1', text => seen.push(text), { signal, fetch, origin: ORIGIN, retryDelayMs: 1 }).then(end => ({ end, seen }))
    }

    let resets = 0
    const emptyResets = server([sse(['reset', {}, 1], ['reset', {}, 2], ['done', {}, 3])])
    await followLivePreview('req_1', () => {}, { signal: new AbortController().signal, fetch: emptyResets.fetch, origin: ORIGIN, onReset: () => resets++ })
    assert.equal(resets, 2, 'Every reset must be observable, including repeated empty resets')

    // Parsing keeps unfinished events for the next chunk and ignores comments.
    const parsed = parseSseEvents(': keep-alive\n\nid: 1\nevent: delta\ndata: {"text":"a"}\n\nid: 2\nevent: del')
    assert.deepEqual(parsed.events, [{ event: 'delta', id: 1, data: '{"text":"a"}' }])
    assert.equal(parsed.rest, 'id: 2\nevent: del')
    assert.deepEqual(applyPreviewEvent('abc', { event: 'reset', id: 3, data: '{}' }), { text: '' })
    assert.deepEqual(applyPreviewEvent('abc', { event: 'delta', id: 4, data: 'not json' }), { text: 'abc' })

    // Text accumulates, a reset starts over, done ends the stream.
    let s = server([sse(['delta', { text: 'Hel' }, 1], ['delta', { text: 'lo' }, 2], ['reset', {}, 3], ['delta', { text: 'Hi owner' }, 4], ['done', {}, 5])])
    let result = await run(s.fetch)
    assert.equal(result.end, 'done')
    assert.equal(result.seen.at(-1), 'Hi owner')
    assert.ok(result.seen.includes('Hello'))
    assert.equal(s.calls[0].url, `${ORIGIN}/api/pi/turn-submissions/req_1/stream`)
    assert.equal(s.calls[0].init.credentials, 'same-origin')
    assert.equal(s.calls[0].init.redirect, 'error')

    // A dropped connection resumes after the last event instead of repeating text.
    s = server([sse(['delta', { text: 'One ' }, 1]), new TypeError('network'), sse(['delta', { text: 'two' }, 2], ['done', {}, 3])])
    result = await run(s.fetch)
    assert.equal(result.end, 'done')
    assert.equal(result.seen.at(-1), 'One two')
    assert.ok(s.calls.slice(1).every(call => call.url.endsWith('?after=1')))

    // Anything that is not an event stream ends quietly: the send reports its own outcome.
    assert.equal((await run(server(['{}'], 200, 'application/json').fetch)).end, 'unavailable')
    assert.equal((await run(server([''], 401).fetch)).end, 'unavailable')
    assert.equal((await run(server([sse(['unavailable', {}])]).fetch)).end, 'unavailable')
    const invalid = []
    assert.equal(await followLivePreview('bad id/..', () => undefined, { signal: new AbortController().signal, fetch: async (...args) => { invalid.push(args); throw new Error() }, origin: ORIGIN }), 'unavailable')
    assert.equal(invalid.length, 0)

    // The preview is bounded, and reconnects are limited.
    const huge = sse(['delta', { text: 'x'.repeat(LIVE_PREVIEW_BYTE_LIMIT) }, 1])
    assert.equal((await run(server([huge], 200, 'text/event-stream', 4096).fetch)).end, 'unavailable')
    s = server([new TypeError('a'), new TypeError('b'), new TypeError('c'), new TypeError('d'), new TypeError('e')])
    assert.equal((await run(s.fetch)).end, 'unavailable')
    assert.equal(s.calls.length, 4)

    // Stopping is immediate and never counted as a failure.
    const stop = new AbortController(); stop.abort()
    assert.equal((await run(server([sse(['delta', { text: 'late' }, 1])]).fetch, stop.signal)).end, 'stopped')

    console.log('Live preview passed: event parsing, reset, resume after the last event, bounds, non-stream refusal and stop.')
  } finally {
    await fs.rm(temporary, { recursive: true, force: true })
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
