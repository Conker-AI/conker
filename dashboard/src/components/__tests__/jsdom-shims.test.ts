// Shared stubs for the component tests. The .test.ts name keeps it out of the source-reachability check; no vitest project runs it as a test file.
import { vi } from 'vitest'

/** jsdom has no ResizeObserver; components that measure themselves get one that never reports a size. */
export class SilentResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/**
 * Call from beforeEach; vitest's unstubAllGlobals takes it away again. With a width, every observed
 * element reports that width once, right after it is observed (as a real observer does).
 */
export function stubResizeObserver(width?: number) {
  if (width === undefined) {
    vi.stubGlobal('ResizeObserver', SilentResizeObserver)
    return
  }
  const size = width
  class SizedResizeObserver {
    private readonly callback: (entries: { contentRect: { width: number } }[]) => void
    constructor(callback: (entries: { contentRect: { width: number } }[]) => void) {
      this.callback = callback
    }
    observe() {
      queueMicrotask(() => this.callback([{ contentRect: { width: size } }]))
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', SizedResizeObserver)
}

/** jsdom has no matchMedia. `matching` lists the queries that match; every other query does not. */
export function stubMatchMedia(matching: readonly string[] = []) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matching.includes(query),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
    onchange: null,
  }))
}
