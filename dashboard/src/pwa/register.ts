/**
 * Installs the service worker (public/sw.js) in production builds: a fast start from the build files
 * and a plain offline page. Development never registers it, so hot reload always serves fresh code.
 */
export function registerServiceWorker(base: string, view: Window = window) {
  const workers = view.navigator.serviceWorker
  if (!workers || !view.isSecureContext) return
  const register = () => {
    // The app works the same without it; only the fast start and the offline page are missing.
    workers.register(`${base}sw.js`, { scope: base }).catch((error: unknown) => {
      console.warn("Conker could not install its offline support.", error)
    })
  }
  if (view.document.readyState === "complete") register()
  else view.addEventListener("load", register, { once: true })
}
