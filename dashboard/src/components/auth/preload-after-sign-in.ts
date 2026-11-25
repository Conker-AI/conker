type PhaseStore = { getState: () => { phase: string }; subscribe: (listener: (state: { phase: string }) => void) => () => void }

function whenIdle(view: Window, run: () => void) {
  if (typeof view.requestIdleCallback === 'function') view.requestIdleCallback(run, { timeout: 2000 })
  else view.setTimeout(run, 200)
}

/**
 * Fetches code the next screens need while the browser is idle, but only once he is signed in. A
 * failed chunk fetch on a weak signal reloads the page (pwa/stale-build.ts); on the sign-in page that
 * would clear a half-typed password. Runs once per document, the first time the phase is
 * `authenticated`.
 */
export function preloadAfterSignIn(store: PhaseStore, preloads: (() => void)[], view: Window = window) {
  let started = false
  const start = () => {
    if (started) return
    started = true
    whenIdle(view, () => preloads.forEach(preload => preload()))
  }
  if (store.getState().phase === 'authenticated') return start()
  const stop = store.subscribe(state => {
    if (state.phase !== 'authenticated') return
    stop()
    start()
  })
}
