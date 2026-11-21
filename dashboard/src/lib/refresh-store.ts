import { createRefreshState, refreshState, type RefreshNote, type RefreshState } from './refresh-state'
import type { HostUpdateCheck } from './gateway/host-ops'
import type { UpdatesOverview } from './gateway/updates'
import { gatewayError } from './gateway/transport'

/**
 * "Refresh everything" and the quiet re-check when the owner enters or comes back to the app.
 *
 * Manual refresh is soft: it bumps `epoch`, which keys the routed screens so every list and page
 * reads again, and it never touches the chat panel (that one re-reads through `reads`). Entry and
 * return never remount anything and never reload while work is open; they only ask the server to
 * look for a new release and nudge the small readers that live in the shell (`reads`).
 * The server's `update.check` never waits for GitHub, so the answer is polled and Pi's offer is
 * read again only after the host has reported it.
 */
export const RETURN_AFTER_MS = 5 * 60_000
export const AUTO_GAP_MS = 60_000
export const UPDATE_CHECK_GAP_MS = 30 * 60_000
export const POLL_EVERY_MS = 2_000
export const POLL_GIVE_UP_MS = 60_000
export const MANUAL_MIN_MS = 600

export type RefreshReason = 'entry' | 'return' | 'manual'
/** Why a manual refresh asks first: text or edits not saved yet, or a window left open. */
export type RefreshBlocker = 'unsaved' | 'dialog'

export type RefreshDeps = {
  checkUpdate: (signal: AbortSignal) => Promise<HostUpdateCheck>
  listUpdates: (signal: AbortSignal) => Promise<UpdatesOverview>
  /** A cheap read that proves the server answers; a failure makes the manual refresh say so. */
  probe: (signal: AbortSignal) => Promise<unknown>
  /** A conversation is sending, resuming or unsure whether a send arrived. */
  busy: () => boolean
  onUpdateFound: (version: string) => void
  onNewBuild: () => void
}

export type RefreshEnv = {
  now: () => number
  sleep: (ms: number, signal: AbortSignal) => Promise<void>
  /** Something is not saved: the screens already say so through `beforeunload`. */
  unsaved: () => boolean
  /** A dialog, menu window or password prompt is open (the phone's sidebar drawer does not count). */
  dialogOpen: () => boolean
  /** The entry script of the dashboard as the server serves it now; null when it cannot be told. */
  fetchEntry: (signal: AbortSignal) => Promise<string | null>
  runningEntry: () => string | null
  /** Only a built dashboard can be replaced; the dev server has no hashed entry. */
  prod: boolean
  reload: () => void
  updateWorker: () => void
}

type View = { addEventListener: (type: string, listener: () => void) => void; removeEventListener: (type: string, listener: () => void) => void }
type ReturnView = View & { document: View & { visibilityState: string } }

export function createRefresh(env: RefreshEnv, store = createRefreshState()) {
  let deps: RefreshDeps | null = null
  let flight: Promise<void> | null = null, abort: AbortController | null = null, flightReason: RefreshReason | null = null
  // Module-level guards: React's double mount in development, or two events, never start two runs.
  let lastAutoAt = -Infinity, lastCheckAt = -Infinity, unsupported = false
  const announced = new Set<string>()
  let buildAnnounced = false
  const set = (patch: Partial<RefreshState>) => store.setState(patch)
  const bump = (key: 'epoch' | 'reads') => store.setState(state => ({ [key]: state[key] + 1 }))

  const blocker = (): RefreshBlocker | null => env.dialogOpen() ? 'dialog' : env.unsaved() ? 'unsaved' : null

  /** Looks for a new release; resolves to what the button should say about it. */
  async function checkForUpdate(bound: RefreshDeps, reason: RefreshReason, signal: AbortSignal): Promise<RefreshNote> {
    if (unsupported || (reason !== 'manual' && env.now() - lastCheckAt < UPDATE_CHECK_GAP_MS)) return 'none'
    // What Pi offered before the check, so only a release this check found is announced.
    const baseline = bound.listUpdates(signal).then(overview => overview.offer?.version ?? null, () => undefined)
    const ask = async () => {
      try { return await bound.checkUpdate(signal) } catch (error) {
        if (signal.aborted) throw error
        // An older server does not know the read: remember it for this session and say nothing.
        if (gatewayError(error).code === 'invalid_host_operation') { unsupported = true; return null }
        return undefined
      }
    }
    let answer = await ask()
    if (answer === null) return 'none'
    if (answer === undefined) return 'update-unchecked'
    lastCheckAt = env.now()
    const deadline = env.now() + POLL_GIVE_UP_MS
    while (answer.state === 'started' || answer.state === 'running') {
      if (env.now() >= deadline) return 'update-slow'
      await env.sleep(POLL_EVERY_MS, signal)
      const next = await ask()
      if (next === null) return 'none'
      if (next === undefined) return 'update-unchecked'
      answer = next
    }
    if (answer.state === 'unsupported') { unsupported = true; return 'none' }
    if (answer.state === 'skipped' || answer.ok !== true) return 'update-unchecked'
    // Only now does Pi know what the host found.
    const [before, overview] = [await baseline, await bound.listUpdates(signal).catch(() => null)]
    const version = overview?.offer?.version ?? null
    if (overview) set({ updateFound: version })
    if (version && before !== undefined && version !== before && !announced.has(version)) { announced.add(version); bound.onUpdateFound(version) }
    return 'none'
  }

  /** True when the server serves a different dashboard build than the one running here. */
  async function buildChanged(signal: AbortSignal): Promise<boolean> {
    if (!env.prod) return false
    const running = env.runningEntry()
    if (!running) return false
    try { const served = await env.fetchEntry(signal); return !!served && served !== running } catch { return false }
  }

  async function run(bound: RefreshDeps, reason: RefreshReason, signal: AbortSignal) {
    const started = env.now(), manual = reason === 'manual'
    if (manual) { set({ status: 'refreshing', note: 'none' }); bump('epoch') }
    if (reason !== 'entry') bump('reads')
    let note: RefreshNote = 'none', reachable = true
    try {
      if (manual) env.updateWorker()
      const [probed, checked, changed] = await Promise.all([
        manual ? bound.probe(signal).then(() => true, () => false) : Promise.resolve(true),
        checkForUpdate(bound, reason, signal),
        buildChanged(signal),
      ])
      reachable = probed; note = checked
      if (changed) {
        // A manual refresh replaces the page when nothing is being sent; every other case only says so.
        // Leave 'refreshing' first: a page that asks "leave site?" and is answered Stay must not stay stuck.
        if (manual && !bound.busy()) { set({ status: 'done', lastDoneAt: env.now(), note: 'none' }); env.reload(); return }
        set({ newBuild: true })
        if (!buildAnnounced) { buildAnnounced = true; bound.onNewBuild() }
      }
    } catch {
      if (signal.aborted) return
      reachable = false
      if (!manual) return
    }
    if (!manual) return
    const wait = MANUAL_MIN_MS - (env.now() - started)
    if (wait > 0) await env.sleep(wait, signal)
    if (signal.aborted) return
    set(reachable ? { status: 'done', lastDoneAt: env.now(), note } : { status: 'error' })
  }

  function refreshAll(reason: RefreshReason, options: { confirmed?: boolean } = {}): Promise<void> {
    const bound = deps
    // A click joins a click already running, but never an entry or return check: that one is quiet
    // and would leave the owner's click with no visible work, so it is stopped and the click runs.
    if (flight && (reason !== 'manual' || flightReason === 'manual')) return flight
    if (!bound) return Promise.resolve()
    if (flight) abort?.abort()
    if (reason === 'manual') { if (!options.confirmed && blocker()) return Promise.resolve() }
    else if (env.now() - lastAutoAt < AUTO_GAP_MS) return Promise.resolve()
    else lastAutoAt = env.now()
    const controller = new AbortController()
    abort = controller; flightReason = reason
    const current: Promise<void> = run(bound, reason, controller.signal).catch(() => undefined).finally(() => {
      if (flight === current) { flight = null; abort = null; flightReason = null }
    })
    flight = current
    return current
  }

  /** The button's click: starts at once, or returns what it needs the owner to confirm first. */
  function manual(confirmed = false): RefreshBlocker | null {
    const reason = confirmed || flightReason === 'manual' ? null : blocker()
    if (reason) return reason
    void refreshAll('manual', { confirmed: true })
    return null
  }

  function watchReturn(view: ReturnView = window as unknown as ReturnView): () => void {
    let awayAt: number | null = null
    const away = () => { awayAt ??= env.now() }
    const back = () => {
      if (view.document.visibilityState !== 'visible') return
      const long = awayAt !== null && env.now() - awayAt >= RETURN_AFTER_MS
      awayAt = null
      if (long) void refreshAll('return')
    }
    const changed = () => view.document.visibilityState === 'visible' ? back() : away()
    view.document.addEventListener('visibilitychange', changed)
    view.addEventListener('pageshow', back); view.addEventListener('online', back); view.addEventListener('offline', away)
    return () => {
      view.document.removeEventListener('visibilitychange', changed)
      view.removeEventListener('pageshow', back); view.removeEventListener('online', back); view.removeEventListener('offline', away)
    }
  }

  return {
    store,
    /** Connects the store to the signed-in workspace; the returned function ends a run that is still going. */
    bind(next: RefreshDeps): () => void {
      deps = next
      return () => {
        if (deps !== next) return
        deps = null
        if (flight) lastAutoAt = -Infinity
        abort?.abort(); flight = null; abort = null; flightReason = null
        set({ status: 'idle' })
      }
    },
    refreshAll, manual, blocker, watchReturn,
    enter: () => refreshAll('entry'),
    /** Back to idle once the button has shown the result. */
    acknowledge: () => { if (store.getState().status !== 'refreshing') set({ status: 'idle' }) },
  }
}

const ENTRY_SCRIPT = /<script[^>]*type="module"[^>]*src="([^"]*\/assets\/index-[^"]+\.js)"/

/** Open windows that hold the owner's attention; the phone's sidebar drawer and toasts are not one. */
function dialogOpen(): boolean {
  // Popups that stay mounted while closed carry data-closed; only an open, drawn one counts.
  return [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].some(element =>
    element.getAttribute('aria-modal') !== 'false' && !element.matches('[data-closed],[hidden]') && element.getClientRects().length > 0
    && !element.closest('[data-sidebar="sidebar"],[data-base-ui-toast-viewport]'))
}

function browserEnv(): RefreshEnv {
  return {
    now: () => Date.now(),
    sleep: (ms, signal) => new Promise((resolve, reject) => {
      const timer = window.setTimeout(resolve, ms)
      signal.addEventListener('abort', () => { window.clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
    }),
    // Every screen with unsaved work already asks the browser not to leave through `beforeunload`;
    // a synthetic one, which shows no dialog, tells whether any of them would. New screens must keep that habit.
    unsaved: () => { const probe = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(probe); return probe.defaultPrevented },
    dialogOpen,
    fetchEntry: async signal => {
      const page = await fetch(import.meta.env.BASE_URL, { cache: 'no-store', credentials: 'omit', signal })
      return page.ok ? (ENTRY_SCRIPT.exec(await page.text())?.[1] ?? null) : null
    },
    runningEntry: () => document.querySelector('script[type="module"][src*="/assets/index-"]')?.getAttribute('src') ?? null,
    prod: import.meta.env.PROD,
    reload: () => window.location.reload(),
    updateWorker: () => { void navigator.serviceWorker?.getRegistration().then(registration => registration?.update()).catch(() => undefined) },
  }
}

export const refresh = createRefresh(browserEnv(), refreshState)
