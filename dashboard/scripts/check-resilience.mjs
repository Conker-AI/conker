import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const root = fileURLToPath(new URL('../', import.meta.url))
const { build } = createRequire(import.meta.resolve('vite'))('esbuild')
// Inside the project so the ES module output resolves react and zustand from node_modules.
await fs.mkdir(path.join(root, 'node_modules/.cache'), { recursive: true })
const temporary = await fs.mkdtemp(path.join(root, 'node_modules/.cache/conker-resilience-check-'))
const checks = []
const check = async (name, run) => { await run(); checks.push(name) }
const events = []
globalThis.window = {
  location: { origin: 'https://conker.example', pathname: '/memory' },
  dispatchEvent: event => { events.push(event.detail); return true },
  addEventListener() {}, removeEventListener() {},
}
try {
  const entries = ['components/resilience/error-boundary.tsx', 'components/resilience/error-fallbacks.tsx', 'components/resilience/inline-error.tsx', 'components/resilience/error-details.ts', 'lib/connection-store.ts', 'lib/gateway/transport.ts']
  await build({
    entryPoints: entries.map(entry => path.join(root, 'src', entry)),
    outdir: temporary, outbase: path.join(root, 'src'), bundle: true, platform: 'node', format: 'esm', splitting: true, jsx: 'automatic', logLevel: 'silent',
    tsconfig: path.join(root, 'tsconfig.app.json'), define: { 'import.meta.env': '{}' },
    loader: { '.css': 'empty' },
    // Bundled CommonJS dependencies still call require('react').
    banner: { js: "import { createRequire as conkerRequire } from 'node:module'; const require = conkerRequire(import.meta.url);" },
    plugins: [{ name: 'one-react-runtime', setup(builder) {
      builder.onResolve({ filter: /^(?:react(?:-dom)?|zustand)(?:\/.*)?$/ }, args => ({ path: args.path, external: true }))
    } }],
  })
  const load = entry => import(pathToFileURL(path.join(temporary, entry.replace(/\.tsx?$/, '.js'))))
  const { ErrorBoundary } = await load('components/resilience/error-boundary.tsx')
  const { CrashScreen, WorkspaceError, SectionError } = await load('components/resilience/error-fallbacks.tsx')
  const { InlineError } = await load('components/resilience/inline-error.tsx')
  const { errorReport, isChunkLoadError } = await load('components/resilience/error-details.ts')
  const { connectionStore, reportGatewayReachable } = await load('lib/connection-store.ts')
  const { GatewayError, createGatewayTransport } = await load('lib/gateway/transport.ts')
  const h = React.createElement
  const render = element => renderToStaticMarkup(element)

  await check('Reachability: recovery counts only a return from unreachable', () => {
    reportGatewayReachable(true)
    assert.deepEqual([connectionStore.getState().gateway, connectionStore.getState().recoveries], ['reachable', 0])
    reportGatewayReachable(false); reportGatewayReachable(false)
    assert.equal(connectionStore.getState().gateway, 'unreachable')
    reportGatewayReachable(true); reportGatewayReachable(true)
    assert.deepEqual([connectionStore.getState().gateway, connectionStore.getState().recoveries], ['reachable', 1])
  })

  await check('The transport reports any answer as reachable and a network failure as unreachable', async () => {
    const origin = 'https://conker.example'
    events.length = 0
    const down = createGatewayTransport({ origin, fetch: async () => { throw new TypeError('Failed to fetch') } })
    await assert.rejects(down.request('/health'), error => error instanceof GatewayError && error.kind === 'network')
    const failing = createGatewayTransport({ origin, fetch: async () => new Response('', { status: 503 }) })
    await assert.rejects(failing.request('/health'), error => error.kind === 'dependency')
    const aborted = new AbortController(); aborted.abort()
    await assert.rejects(down.request('/health', { signal: aborted.signal }), error => error.kind === 'aborted')
    assert.deepEqual(events, [false, true], 'An abort is not a reachability signal')
  })

  await check('Copied details never carry the server address, query strings or tokens', () => {
    const error = new Error(`Failed at https://conker.example/api/pi/sessions?token=abc ${'a'.repeat(40)}`)
    error.stack = `Error: x\n    at https://conker.example/assets/app.js?v=1:1:2`
    const report = errorReport(error)
    assert.ok(!report.includes('conker.example'))
    assert.ok(!report.includes('token=abc'))
    assert.ok(!report.includes('a'.repeat(40)))
    assert.ok(report.includes('Page: /memory'))
  })

  await check('Missing page chunks are recognized in each browser wording', () => {
    for (const message of ['Failed to fetch dynamically imported module: https://x/a.js', 'error loading dynamically imported module', 'Importing a module script failed.'])
      assert.equal(isChunkLoadError(new TypeError(message)), true, message)
    assert.equal(isChunkLoadError(new Error('Cannot read properties of undefined')), false)
  })

  await check('Error boundaries reset when their keys change', () => {
    const boundary = new ErrorBoundary({ children: 'ok', fallback: () => 'failed', resetKeys: ['/a'] })
    let state = { ...boundary.state, ...ErrorBoundary.getDerivedStateFromError(new Error('x')) }
    boundary.state = state
    boundary.setState = next => { state = { ...state, ...next } }
    boundary.props = { ...boundary.props, resetKeys: ['/a'] }
    boundary.componentDidUpdate({ ...boundary.props, resetKeys: ['/a'] })
    assert.equal(state.failed, true, 'Same keys keep the fallback')
    boundary.props = { ...boundary.props, resetKeys: ['/b'] }
    boundary.componentDidUpdate({ ...boundary.props, resetKeys: ['/a'] })
    assert.equal(state.failed, false, 'A new route renders the page again')
  })

  await check('Fallbacks name the failure and give a next step', () => {
    const reset = () => {}
    const crash = render(h(CrashScreen, { error: new Error('x'), reset }))
    assert.ok(crash.includes('Conker hit a problem') && crash.includes('Reload Conker') && crash.includes('Try again') && crash.includes('Copy details'))
    const updated = render(h(CrashScreen, { error: new TypeError('Failed to fetch dynamically imported module: /a.js'), reset }))
    assert.ok(updated.includes('Conker was updated') && !updated.includes('Try again'))
    const page = render(h(WorkspaceError, { error: new Error('x'), reset }))
    assert.ok(page.includes('role="alert"') && page.includes('The rest of Conker still works'))
    assert.ok(render(h(SectionError, { error: new Error('x'), reset, label: 'your allowance' })).includes('Couldn’t show your allowance.'))
  })

  await check('Inline errors explain the failed load and offer retry only when it can help', () => {
    const network = render(h(InlineError, { error: new GatewayError('network'), onRetry() {} }))
    assert.ok(network.includes('Can’t reach your Conker server') && network.includes('refreshes by itself') && network.includes('Try again'))
    assert.ok(!network.includes('nothing was retried'), 'The load wording replaces the action wording')
    const invalid = render(h(InlineError, { error: new GatewayError('validation'), onRetry() {} }))
    assert.ok(!invalid.includes('Try again'), 'Retrying an invalid request cannot help')
    const unknown = render(h(InlineError, { error: new GatewayError('aborted'), onRetry() {} }))
    assert.ok(unknown.includes('warning'), 'An interrupted request is an unknown outcome, not a failure')
    const detail = render(h(InlineError, { error: new GatewayError('dependency', 503) }))
    assert.ok(detail.includes('dependency · HTTP 503') && !detail.includes('Try again'))
  })
} finally {
  await fs.rm(temporary, { recursive: true, force: true })
}
console.log(`Resilience: ${checks.length} cases passed (${checks.join('; ')}).`)
