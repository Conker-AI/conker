// Installable app and phone chat: manifest and icons, the service worker's routing and caching rules,
// keyboard tracking, the back swipe, and the built shell list (when dist exists).
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
function load(file, deps = {}) {
  const source = read(file).replaceAll('import.meta.env', '({ VITE_BASENAME: "" })')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', compiled.outputText)(name => { if (name in deps) return deps[name]; throw new Error(`Unexpected runtime import ${name}`) }, loaded, loaded.exports)
  return loaded.exports
}
const pngSize = file => { const bytes = fs.readFileSync(path.join(root, file)); return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)] }

// Manifest, icons and the page's install tags.
const manifest = JSON.parse(read('public/manifest.webmanifest'))
assert.equal(manifest.name, 'Conker')
assert.equal(manifest.short_name, 'Conker')
assert.equal(manifest.display, 'standalone')
assert.equal(manifest.start_url, '/')
assert.equal(manifest.scope, '/')
assert.ok(manifest.start_url.startsWith(manifest.scope), 'The start page is inside the app scope')
// The dark theme's rendered --background (the app opens in dark by default).
assert.equal(manifest.background_color, '#161616')
assert.equal(manifest.theme_color, '#161616')
for (const [size, purpose] of [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']]) {
  const icon = manifest.icons.find(item => item.sizes === size && item.purpose === purpose)
  assert.ok(icon, `A ${purpose} ${size} icon is listed`)
  assert.equal(icon.type, 'image/png')
  assert.deepEqual(pngSize(`public${icon.src}`), size.split('x').map(Number), `${icon.src} is really ${size}`)
}
assert.deepEqual(pngSize('public/apple-touch-icon.png'), [180, 180])
const html = read('index.html')
for (const tag of ['rel="manifest" href="%BASE_URL%manifest.webmanifest"', 'rel="apple-touch-icon" href="%BASE_URL%apple-touch-icon.png"', 'name="theme-color" content="#161616"', 'name="apple-mobile-web-app-title" content="Conker"'])
  assert.ok(html.includes(tag), `index.html has ${tag}`)
assert.match(html, /name="viewport" content="[^"]*viewport-fit=cover[^"]*interactive-widget=resizes-content/, 'The page shrinks for the Android keyboard and uses the full notched screen')

// The service worker, run against fake browser APIs.
function serviceWorker({ shell = [], online = true, stored = {} } = {}) {
  const listeners = {}, fetched = [], deleted = []
  const store = new Map(Object.entries(stored).map(([name, keys]) => [name, new Map(keys.map(key => [key, new Response(key)]))]))
  const open = async name => {
    if (!store.has(name)) store.set(name, new Map())
    const cache = store.get(name)
    return {
      put: async (request, response) => { cache.set(new URL(request.url).pathname, response) },
      addAll: async requests => { for (const request of requests) { fetched.push(request); cache.set(new URL(request.url).pathname, new Response('shell')) } },
      keys: async () => [...cache.keys()].map(key => new Request(`https://conker.test${key}`)),
      delete: async request => cache.delete(new URL(request.url).pathname),
    }
  }
  const caches = {
    open,
    keys: async () => [...store.keys()],
    delete: async name => { deleted.push(name); return store.delete(name) },
    match: async request => { for (const cache of store.values()) { const hit = cache.get(new URL(request.url).pathname); if (hit) return hit } return undefined },
  }
  const responses = { html: () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }), js: () => new Response('code', { headers: { 'content-type': 'text/javascript' } }) }
  const fetchStub = async request => {
    fetched.push(request)
    if (!online) throw new TypeError('Failed to fetch')
    const url = new URL(request.url)
    const response = url.pathname.endsWith('.js') && !url.pathname.includes('missing') ? responses.js() : responses.html()
    Object.defineProperty(response, 'type', { value: 'basic' })
    return response
  }
  const self = {
    location: { origin: 'https://conker.test' },
    registration: { scope: 'https://conker.test/', navigationPreload: { enable: async () => { self.preloadEnabled = true } } },
    clients: { claim: async () => { self.claimed = true } },
    skipWaiting: async () => { self.skipped = true },
    addEventListener: (type, listener) => { listeners[type] = listener },
  }
  const source = read('public/sw.js').replace('const SHELL = []', `const SHELL = ${JSON.stringify(shell)}`)
  vm.runInNewContext(source, { self, caches, fetch: fetchStub, Request, Response, URL, Promise, console })
  const dispatch = async (type, init = {}) => {
    const waits = []
    let responded = null
    const event = { ...init, waitUntil: promise => waits.push(promise), respondWith: promise => { responded = promise } }
    listeners[type](event)
    const response = responded ? await responded : null
    await Promise.all(waits)
    return { responded: Boolean(responded), response }
  }
  const request = (url, init = {}) => {
    const value = new Request(`https://conker.test${url}`, { method: init.method || 'GET', headers: init.headers || {} })
    if (init.mode) Object.defineProperty(value, 'mode', { value: init.mode })
    return value
  }
  return { dispatch, request, store, fetched, deleted, self, setOnline: value => { online = value } }
}

;(async () => {
  let worker = serviceWorker()
  for (const [url, init, reason] of [
    ['/api/pi/sessions', {}, 'API answers'],
    ['/auth/session', {}, 'sign-in state'],
    ['/api/pi/events', { headers: { accept: 'text/event-stream' } }, 'event streams'],
    ['/health', {}, 'health checks'],
    ['/assets/index-abc.js', { method: 'POST' }, 'writes'],
    ['/assets/index-abc.js', { headers: { range: 'bytes=0-10' } }, 'partial reads'],
    ['/assets/index-abc.js?v=2', {}, 'files with a query'],
    ['/fixtures/sample.json', {}, 'other files'],
    ['/api/pi/sessions', { mode: 'navigate' }, 'API pages opened directly'],
  ]) {
    const result = await worker.dispatch('fetch', { request: worker.request(url, init) })
    assert.equal(result.responded, false, `The service worker never handles ${reason}`)
  }
  assert.equal(worker.store.size, 0, 'Nothing private was stored')

  const page = await worker.dispatch('fetch', { request: worker.request('/chat?session=abc', { mode: 'navigate' }), preloadResponse: Promise.resolve(undefined) })
  assert.equal(page.response.headers.get('content-type'), 'text/html', 'Online, pages come from the server')
  assert.equal(worker.store.size, 0, 'Pages are never stored')

  const first = await worker.dispatch('fetch', { request: worker.request('/assets/index-abc.js') })
  assert.equal(await first.response.text(), 'code')
  assert.ok(worker.store.get('conker-assets').has('/assets/index-abc.js'), 'Hashed build files are kept')
  worker.setOnline(false)
  const again = await worker.dispatch('fetch', { request: worker.request('/assets/index-abc.js') })
  assert.equal(again.responded, true, 'A kept build file is served without the network')
  const offline = await worker.dispatch('fetch', { request: worker.request('/chat', { mode: 'navigate' }), preloadResponse: Promise.resolve(undefined) })
  assert.equal(offline.response.status, 503)
  const offlineText = await offline.response.text()
  assert.match(offlineText, /You’re offline/, 'Offline, a plain offline page replaces the app')
  assert.match(offline.response.headers.get('content-security-policy'), /default-src 'none'/)
  assert.doesNotMatch(offlineText, /<script/, 'The offline page runs no script')

  worker = serviceWorker()
  await worker.dispatch('fetch', { request: worker.request('/assets/missing.js') })
  assert.equal(worker.store.has('conker-assets'), false, 'An HTML answer for a missing file is never kept')
  await worker.dispatch('fetch', { request: worker.request('/conker.png') })
  assert.equal(worker.store.has('conker-assets'), false, 'Unhashed public files are refreshed with the shell, not kept by name')

  worker = serviceWorker({ shell: ['assets/index-abc.js', 'manifest.webmanifest'], stored: { 'conker-shell-old': ['/assets/index-old.js'], 'conker-assets': ['/assets/lazy-abc.js'] } })
  await worker.dispatch('install')
  assert.deepEqual(worker.fetched.map(request => [new URL(request.url).pathname, request.credentials, request.cache]), [['/assets/index-abc.js', 'omit', 'reload'], ['/manifest.webmanifest', 'omit', 'reload']], 'The shell is fetched fresh and without cookies')
  assert.equal(worker.self.skipped, true)
  await worker.dispatch('activate')
  assert.deepEqual(worker.deleted, ['conker-shell-old'], 'Activation drops only older shells')
  assert.equal(worker.self.claimed, true)
  assert.equal(worker.self.preloadEnabled, true)

  // Registration: production pages over HTTPS only (index.ts gates it to production gateway builds).
  const { registerServiceWorker } = load('src/pwa/register.ts')
  const registered = []
  const view = (secure, readyState = 'complete') => ({ isSecureContext: secure, document: { readyState }, addEventListener: (type, run) => { if (type === 'load') run() }, navigator: { serviceWorker: { register: async (url, options) => { registered.push([url, options.scope]) } } } })
  registerServiceWorker('/', view(true))
  registerServiceWorker('/', view(true, 'loading'))
  registerServiceWorker('/', view(false))
  registerServiceWorker('/', { isSecureContext: true, document: { readyState: 'complete' }, navigator: {} })
  assert.deepEqual(registered, [['/sw.js', '/'], ['/sw.js', '/']])
  assert.match(read('src/pwa/index.ts'), /import\.meta\.env\.PROD && runtimeMode === "gateway"/, 'Development never registers the service worker')
  assert.match(read('src/main.tsx'), /startPwa\(\)/)

  // Keyboard: only a real covered area counts, never zoom or toolbar noise.
  const keyboard = load('src/pwa/keyboard.ts')
  assert.equal(keyboard.keyboardInset({ layoutHeight: 844, visualHeight: 508, scale: 1 }), 336)
  assert.equal(keyboard.keyboardInset({ layoutHeight: 844, visualHeight: 830, scale: 1 }), 0, 'Toolbar movement is not a keyboard')
  assert.equal(keyboard.keyboardInset({ layoutHeight: 844, visualHeight: 400, scale: 2 }), 0, 'Pinch zoom is not a keyboard')
  assert.equal(keyboard.keyboardInset({ layoutHeight: 508, visualHeight: 508, scale: 1 }), 0, 'Android already resized the page')
  const viewport = { height: 844, offsetTop: 0, scale: 1, listeners: {}, addEventListener(type, run) { this.listeners[type] = run }, removeEventListener(type) { delete this.listeners[type] } }
  const style = new Map()
  const rootElement = { dataset: {}, style: { setProperty: (name, value) => style.set(name, value), removeProperty: name => style.delete(name) } }
  const frames = []
  const stop = keyboard.trackKeyboard(rootElement, { innerHeight: 844, visualViewport: viewport, requestAnimationFrame: run => { frames.push(run); return frames.length }, cancelAnimationFrame: () => {} })
  assert.equal(rootElement.dataset.keyboard, undefined)
  Object.assign(viewport, { height: 508, offsetTop: 120 })
  viewport.listeners.resize(); frames.shift()()
  assert.equal(rootElement.dataset.keyboard, 'open')
  assert.equal(style.get('--visual-height'), '508px')
  assert.equal(style.get('--visual-top'), '120px')
  Object.assign(viewport, { height: 844, offsetTop: 0 })
  viewport.listeners.scroll(); frames.shift()()
  assert.equal(rootElement.dataset.keyboard, undefined)
  assert.equal(style.size, 0, 'Closing the keyboard restores the normal layout')
  stop()
  assert.deepEqual(Object.keys(viewport.listeners), [])
  const css = read('src/pwa/phone.css')
  assert.match(css, /\[data-slot="sidebar-wrapper"\] \{\s*height: var\(--app-height\);/, 'The app frame uses the visible height')
  // Enter: a new line on phones (Send button sends), send elsewhere; the keyboard's key says which.
  const enterKey = load('src/pwa/enter-key.ts', { react: {}, '@/hooks/use-mobile': {} })
  assert.equal(enterKey.enterSends(true, true), false, 'On a phone Enter adds a new line')
  assert.equal(enterKey.enterSends(true, false), true, 'A narrow desktop window keeps Enter to send')
  assert.equal(enterKey.enterSends(false, true), true, 'A tablet keeps Enter to send')
  assert.equal(enterKey.enterSends(false, false), true, 'Desktop keeps Enter to send')
  const composer = read('src/components/chat/composer.tsx')
  assert.match(composer, /enterKeyHint=\{enterSends \? 'send' : 'enter'\}/, 'The keyboard key is labelled Send only where Enter sends')
  assert.match(composer, /if \(enterSends && event\.key === 'Enter' && !event\.shiftKey/, 'Enter sends only where it should')

  // Back to the chat list: the swipe and the history-aware return.
  const navigation = load('src/pwa/chat-navigation.ts', { react: {}, 'react-router-dom': {}, '@/hooks/use-mobile': {} })
  assert.equal(navigation.isBackSwipe(120, 20, 300), true)
  assert.equal(navigation.isBackSwipe(60, 0, 200), false, 'A short drag is not a swipe')
  assert.equal(navigation.isBackSwipe(120, 80, 300), false, 'A diagonal scroll is not a swipe')
  assert.equal(navigation.isBackSwipe(-150, 0, 200), false, 'Swiping left does nothing')
  assert.equal(navigation.isBackSwipe(150, 0, 1500), false, 'A slow drag (reading, selecting) is not a swipe')
  const entries = (urls, index) => ({ currentEntry: { index }, entries: () => urls.map(url => ({ url })) })
  assert.equal(navigation.previousIsChatList(entries(['https://conker.test/chats', 'https://conker.test/chat?session=a'], 1), 'https://conker.test'), true)
  assert.equal(navigation.previousIsChatList(entries(['https://conker.test/inbox', 'https://conker.test/chat?session=a'], 1), 'https://conker.test'), false)
  assert.equal(navigation.previousIsChatList(entries(['https://conker.test/chat?session=a'], 0), 'https://conker.test'), false, 'A chat opened directly goes to the list')
  assert.equal(navigation.previousIsChatList(entries(['https://elsewhere.test/chats', 'https://conker.test/chat'], 1), 'https://conker.test'), false)
  assert.equal(navigation.previousIsChatList(undefined, 'https://conker.test'), false, 'Without the Navigation API the list opens')

  // The built service worker carries this build's shell (CI builds before running checks).
  const built = path.join(root, 'dist/sw.js')
  if (fs.existsSync(built)) {
    const source = fs.readFileSync(built, 'utf8')
    assert.doesNotMatch(source, /const BUILD = 'development'/, 'The build stamped the service worker')
    const shell = JSON.parse(source.match(/const SHELL = (\[.*\])/)[1])
    assert.ok(shell.includes('manifest.webmanifest') && shell.some(file => /^assets\/index-.*\.js$/.test(file)) && shell.some(file => /^assets\/gateway-entry-.*\.js$/.test(file)), 'The shell has the entry and the gateway workspace')
    for (const file of shell) assert.ok(fs.existsSync(path.join(root, 'dist', file)), `${file} exists in dist`)
    assert.ok(shell.every(file => !file.endsWith('.html') && !file.startsWith('api/')), 'No page or API answer is precached')
  } else console.log('dist/ not built: skipped the built shell check (CI builds first).')

  console.log('PWA: manifest, icons, service worker rules, registration, keyboard, Enter key and back navigation passed.')
})().catch(error => { console.error(error); process.exit(1) })
