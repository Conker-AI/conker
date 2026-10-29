/*
 * Conker's service worker: a fast start from the app's own build files, and a plain offline page.
 *
 * It only ever stores public build files that are the same for everyone (scripts, styles, fonts,
 * icons, the manifest). It never touches API, sign-in, event-stream or upload traffic, and it never
 * keeps a page or an answer, so nothing old or private is shown later. The production build fills
 * in BUILD and SHELL (see vite.config.ts); this unfilled copy works too, with nothing precached.
 */
const BUILD = 'development'
const SHELL = []

const SHELL_CACHE = `conker-shell-${BUILD}`
const ASSET_CACHE = 'conker-assets'
const ASSET_LIMIT = 200
const BASE = new URL(self.registration.scope).pathname
// Hashed build output can be kept by name: a new build gets new names.
const HASHED = /^(?:assets|fonts)\//
// Unhashed public files are part of SHELL, refreshed with every build.
const PUBLIC = /^(?:manifest\.webmanifest|conker\.png|apple-touch-icon\.png|icons\/[\w-]+\.png)$/
// Server routes, never handled here (the gateway reserves these names).
const SERVER = /^(?:api|auth|health|docs|redoc|openapi\.json)(?:\/|$)/

const OFFLINE_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>Conker · Offline</title>
<style>
  /* Mirrors the app's background, text and muted-text tokens (src/index.css), light and dark. */
  :root { color-scheme: light dark; --bg: #ffffff; --fg: #262626; --muted: #686868; }
  @media (prefers-color-scheme: dark) { :root { --bg: #161616; --fg: #f5f5f5; --muted: #8f8f8f; } }
  html, body { height: 100%; margin: 0; }
  body { display: grid; place-items: center; background: var(--bg); color: var(--fg);
    font: 16px/1.5 system-ui, sans-serif; padding: max(1.5rem, env(safe-area-inset-top)) 1.5rem max(1.5rem, env(safe-area-inset-bottom)); box-sizing: border-box; }
  main { max-width: 22rem; text-align: center; }
  img { width: 4rem; height: 4rem; }
  h1 { font-size: 1.5rem; line-height: 1.3; margin: 1rem 0 0.5rem; }
  p { color: var(--muted); margin: 0 0 1.5rem; }
  a { display: inline-flex; align-items: center; justify-content: center; min-height: 2.75rem; padding: 0 1.25rem;
    border-radius: 0.625rem; background: var(--fg); color: var(--bg); font-weight: 500; text-decoration: none; }
  a:focus-visible { outline: 2px solid var(--fg); outline-offset: 2px; }
</style>
</head>
<body>
<main>
<img src="${BASE}conker.png" alt="">
<h1>You’re offline</h1>
<p>Conker can’t reach your server right now. Check your connection, then try again.</p>
<a href="">Try again</a>
</main>
</body>
</html>`

/** The path inside the app's scope, without the leading base; null outside the scope. */
function local(url) {
  return url.origin === self.location.origin && url.pathname.startsWith(BASE) ? url.pathname.slice(BASE.length) : null
}

function offline() {
  return new Response(OFFLINE_PAGE, {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'",
    },
  })
}

async function navigate(event) {
  try {
    // Pages always come from the server, so the app never starts from an old copy.
    return (await event.preloadResponse) || await fetch(event.request)
  } catch {
    return offline()
  }
}

async function keep(request, response) {
  const cache = await caches.open(ASSET_CACHE)
  await cache.put(request, response)
  const keys = await cache.keys()
  // Oldest first: drop what earlier builds left behind once the cache is full.
  await Promise.all(keys.slice(0, Math.max(0, keys.length - ASSET_LIMIT)).map(key => cache.delete(key)))
}

async function buildFile(event, hashed) {
  const hit = await caches.match(event.request)
  if (hit) return hit
  const response = await fetch(event.request)
  const type = response.headers.get('content-type') || ''
  if (hashed && response.ok && response.type === 'basic' && !type.startsWith('text/html')) event.waitUntil(keep(event.request, response.clone()))
  return response
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE)
    // Public files only, fetched without cookies.
    await cache.addAll(SHELL.map(path => new Request(new URL(path, self.registration.scope), { cache: 'reload', credentials: 'omit' })))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names.filter(name => name.startsWith('conker-shell-') && name !== SHELL_CACHE).map(name => caches.delete(name)))
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable()
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET' || request.headers.has('range')) return
  const url = new URL(request.url)
  const path = local(url)
  if (path === null || SERVER.test(path) || (request.headers.get('accept') || '').includes('text/event-stream')) return
  if (request.mode === 'navigate') {
    event.respondWith(navigate(event))
    return
  }
  if (url.search) return
  const hashed = HASHED.test(path)
  if (hashed || PUBLIC.test(path)) event.respondWith(buildFile(event, hashed))
})
