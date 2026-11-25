import { createStore } from 'zustand/vanilla'
import { describe, expect, it, vi } from 'vitest'
import { preloadAfterSignIn } from '@/components/auth/preload-after-sign-in'

/** A window whose idle callbacks run only when the test says so. */
function idleWindow() {
  const waiting: (() => void)[] = []
  const view = { requestIdleCallback: (run: () => void) => waiting.push(run), setTimeout: () => 0 } as unknown as Window
  return { view, idle: () => waiting.splice(0).forEach(run => run()), queued: () => waiting.length }
}

describe('code preloads after sign-in', () => {
  it('fetches nothing on the sign-in page, so a weak signal cannot reload it and clear the password', () => {
    const store = createStore(() => ({ phase: 'checking' }))
    const { view, idle, queued } = idleWindow()
    const preload = vi.fn()
    preloadAfterSignIn(store, [preload], view)
    store.setState({ phase: 'anonymous' })
    idle()
    expect(queued()).toBe(0)
    expect(preload).not.toHaveBeenCalled()
    store.setState({ phase: 'authenticated' })
    expect(preload).not.toHaveBeenCalled()
    idle()
    expect(preload).toHaveBeenCalledTimes(1)
    // Signing out and in again does not fetch twice.
    store.setState({ phase: 'anonymous' })
    store.setState({ phase: 'authenticated' })
    idle()
    expect(preload).toHaveBeenCalledTimes(1)
  })

  it('starts at once, while idle, when he is already signed in, and runs every preload', () => {
    const store = createStore(() => ({ phase: 'authenticated' }))
    const { view, idle } = idleWindow()
    const control = vi.fn(),
      alerts = vi.fn()
    preloadAfterSignIn(store, [control, alerts], view)
    expect(control).not.toHaveBeenCalled()
    idle()
    expect(control).toHaveBeenCalledTimes(1)
    expect(alerts).toHaveBeenCalledTimes(1)
  })
})
