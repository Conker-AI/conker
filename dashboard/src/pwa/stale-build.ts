const KEY = 'conker.stale-build-reload'
const AGAIN_AFTER_MS = 60_000

/**
 * After a server update the old hashed files are gone, so a window that was left open fails to
 * load the next screen. Vite reports that as `vite:preloadError`; one reload fetches the new build.
 * A second failure within a minute is left alone, so a real outage never loops.
 */
export function reloadOnStaleBuild(view: Window = window) {
  view.addEventListener('vite:preloadError', event => {
    try {
      const last = Number(view.sessionStorage.getItem(KEY) ?? 0)
      if (Date.now() - last < AGAIN_AFTER_MS) return
      view.sessionStorage.setItem(KEY, String(Date.now()))
    } catch { return }
    event.preventDefault()
    view.location.reload()
  })
}
