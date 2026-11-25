import type { ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GatewayBoundary } from '@/components/auth/gateway-boundary'
import { GatewayShareCapture } from '@/components/gateway/share-capture'
import { connectionStore } from '@/lib/connection-store'
import type { GatewayAuthClient, GatewaySession } from '@/lib/gateway/auth'
import { createGatewayAuthStore } from '@/lib/gateway/auth-store'
import { GatewayError } from '@/lib/gateway/transport'
import type { SharedSaved } from '@/lib/gateway/shared-notes'
import { SHARE_KEY, takeShared, type ShareStorage } from '@/lib/share-capture'

vi.mock('@/components/mode-toggle', () => ({ ModeToggle: () => null }))

afterEach(() => {
  cleanup()
  connectionStore.setState({ online: true })
})

type Saved = SharedSaved
const done: Saved = { noteId: `note_${'1'.repeat(32)}`, sessionId: `ses_${'1'.repeat(16)}`, title: 'Shared: Article Read this', status: 'saved' }
function memory(initial: Record<string, string> = {}): ShareStorage & { items: Record<string, string> } {
  const items = { ...initial }
  return {
    items,
    getItem: key => items[key] ?? null,
    setItem: (key, value) => void (items[key] = value),
    removeItem: key => void delete items[key],
  }
}
const stored = (text: string, extra: Partial<Record<'title' | 'url', string>> = {}) => memory({ [SHARE_KEY]: JSON.stringify({ title: '', url: '', ...extra, text }) })
function client(...results: (Saved | Error)[]) {
  const calls: [string, string][] = []
  return {
    calls,
    save: vi.fn(async (id: string, text: string) => {
      calls.push([id, text])
      const next = results.shift() ?? done
      if (next instanceof Error) throw next
      return next
    }),
  }
}
/** What `control.shared` hands the screen: a loader for the client. */
const loaded =
  <T,>(api: T) =>
  async () =>
    api
function show(element: ReactNode, entry = '/share') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/share" element={element} />
        <Route path="/overview" element={<p>Home page</p>} />
        <Route path="/chat" element={<p>Chat page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}
const box = () => screen.getByLabelText<HTMLTextAreaElement>('What you shared')
const saveButton = () => screen.getByRole<HTMLButtonElement>('button', { name: /Save to Inbox|Try again/ })
const save = () =>
  act(async () => {
    fireEvent.click(saveButton())
  })

describe('Shared text', () => {
  it('prefills the title, text and link as plain text and saves it once the server confirms', async () => {
    const storage = stored('Read this', { title: 'Article', url: 'https://example.com/a' }),
      api = client()
    show(<GatewayShareCapture client={loaded(api)} storage={storage} />)
    expect(box().value).toBe('Article\nRead this\nhttps://example.com/a')
    expect(screen.queryByRole('link', { name: /example\.com/ })).toBeNull()
    expect(screen.getByText(/of 2,000 characters/)).toBeTruthy()
    await save()
    expect(api.calls[0][1]).toBe('Article\nRead this\nhttps://example.com/a')
    expect(api.calls[0][0]).toMatch(/^share_[0-9a-f]{32}$/)
    expect(screen.getByRole('status').textContent).toBe('Saved to your Inbox.')
    expect(screen.getByText(/It has a chat of its own, “Shared: Article Read this”/)).toBeTruthy()
    expect(storage.items).toEqual({})
    expect(screen.getByRole('link', { name: 'Open' }).getAttribute('href')).toBe(`/chat?session=ses_${'1'.repeat(16)}`)
    fireEvent.click(screen.getByRole('link', { name: 'Open' }))
    expect(screen.getByText('Chat page')).toBeTruthy()
  })

  it('says when it was already in the Inbox, and Done goes Home', async () => {
    show(<GatewayShareCapture client={loaded(client({ ...done, status: 'already_saved' }))} storage={stored('Same')} />)
    await save()
    expect(screen.getByRole('status').textContent).toBe('That was already in your Inbox.')
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByText('Home page')).toBeTruthy()
  })

  it('reads the address when this tab could not keep the share', () => {
    show(<GatewayShareCapture client={loaded(client())} storage={null} />, '/share?text=From%20the%20address')
    expect(box().value).toBe('From the address')
  })

  it('uses this tab’s session storage by default and clears it after saving', async () => {
    sessionStorage.setItem(SHARE_KEY, JSON.stringify({ title: '', text: 'From the tab', url: '' }))
    show(<GatewayShareCapture client={loaded(client())} />)
    expect(box().value).toBe('From the tab')
    await save()
    expect(sessionStorage.getItem(SHARE_KEY)).toBeNull()
  })

  it('shows a plain empty state when nothing was shared', () => {
    show(<GatewayShareCapture client={loaded(client())} storage={memory()} />)
    expect(screen.getByText('Nothing was shared')).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: 'Go to Home' }))
    expect(screen.getByText('Home page')).toBeTruthy()
  })

  it('blocks a share that is too long or blank, with a clear reason', () => {
    show(<GatewayShareCapture client={loaded(client())} storage={stored('a'.repeat(2340))} />)
    expect(screen.getByText('Too long to save: the Inbox keeps up to 2,000 characters. Shorten it by 340.')).toBeTruthy()
    expect(saveButton().disabled).toBe(true)
    fireEvent.change(box(), { target: { value: '   ' } })
    expect(screen.getByText('Write something to save.')).toBeTruthy()
    expect(saveButton().disabled).toBe(true)
  })

  it('shows Saving while the request is open and sends it only once', async () => {
    let finish: (value: Saved) => void = () => {}
    const api = { save: vi.fn(() => new Promise<Saved>(resolve => (finish = resolve))) }
    show(<GatewayShareCapture client={loaded(api)} storage={stored('Note')} />)
    fireEvent.click(saveButton())
    await act(async () => {})
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Saving…' }).disabled).toBe(true)
    expect(box().readOnly).toBe(true)
    fireEvent.submit(box().closest('form')!)
    expect(api.save).toHaveBeenCalledTimes(1)
    await act(async () => finish(done))
    expect(screen.getByRole('status').textContent).toBe('Saved to your Inbox.')
  })

  it('keeps the text after a refusal, and an unknown outcome retries with the same id', async () => {
    const storage = stored('Keep me'),
      api = client(new GatewayError('dependency', 503), new GatewayError('network'), done)
    show(<GatewayShareCapture client={loaded(api)} storage={storage} />)
    await save()
    expect(screen.getByRole('alert').textContent).toBe('Part of Conker isn’t running right now. Nothing was retried; check Server. Nothing was saved.')
    expect(box().value).toBe('Keep me')
    expect(storage.items[SHARE_KEY]).toBeTruthy()
    await save()
    expect(screen.getByRole('alert').textContent).toBe('Conker couldn’t confirm it was saved. Try again: it won’t be saved twice.')
    expect(saveButton().textContent).toBe('Try again')
    expect(api.calls[1][0]).toBe(api.calls[0][0])
    await save()
    expect(api.calls[2][0]).toBe(api.calls[1][0])
    expect(screen.getByRole('status').textContent).toBe('Saved to your Inbox.')
  })

  it('a reload after an unknown outcome retries the same request, so it is never saved twice', async () => {
    const storage = stored('Keep me'),
      first = client(new GatewayError('network'))
    show(<GatewayShareCapture client={loaded(first)} storage={storage} />)
    await save()
    expect(screen.getByRole('alert').textContent).toContain('couldn’t confirm')
    cleanup()
    const again = client()
    show(<GatewayShareCapture client={loaded(again)} storage={storage} />)
    expect(box().value).toBe('Keep me')
    await save()
    expect(again.calls[0]).toEqual(first.calls[0])
    expect(screen.getByRole('status').textContent).toBe('Saved to your Inbox.')
    expect(storage.items).toEqual({})
  })

  it('starts a new request after the text changes following a failure', async () => {
    const api = client(new Error('boom'))
    show(<GatewayShareCapture client={loaded(api)} storage={stored('One')} />)
    await save()
    expect(screen.getByRole('alert').textContent).toContain('couldn’t confirm')
    fireEvent.change(box(), { target: { value: 'Two' } })
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.change(box(), { target: { value: 'Two!' } })
    await save()
    expect(api.calls[1][1]).toBe('Two!')
    expect(api.calls[1][0]).not.toBe(api.calls[0][0])
  })

  it('waits while offline and keeps the text', () => {
    connectionStore.setState({ online: false })
    const api = client()
    show(<GatewayShareCapture client={loaded(api)} storage={stored('Later')} />)
    expect(screen.getByRole('status').textContent).toBe('You’re offline. Your text stays here; save it when you’re back online.')
    expect(saveButton().disabled).toBe(true)
    fireEvent.submit(box().closest('form')!)
    expect(api.save).not.toHaveBeenCalled()
  })

  it('Cancel drops the share and goes Home', () => {
    const storage = stored('Drop me')
    show(<GatewayShareCapture client={loaded(client())} storage={storage} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(storage.items).toEqual({})
    expect(screen.getByText('Home page')).toBeTruthy()
  })

  it('keeps the share through the sign-in and shows it afterwards', async () => {
    const storage = memory(),
      replace = vi.fn()
    takeShared({ pathname: '/share', search: '?title=Recipe&url=https%3A%2F%2Fexample.com%2Fsoup', hash: '' }, '', storage, replace)
    expect(replace).toHaveBeenCalledWith('/share')
    const now = Date.now() / 1000
    const signedIn: GatewaySession = { authenticated: true, sessionId: 'browser', expiresAt: now + 3600, unlockExpiresAt: now + 3600, setupRequired: false }
    const anonymous: GatewaySession = { ...signedIn, authenticated: false, unlockExpiresAt: null }
    const auth = {
      bootstrap: vi.fn(async () => anonymous),
      revalidate: vi.fn(async () => anonymous),
      login: vi.fn(async () => signedIn),
      markActivity: vi.fn(),
      subscribe: () => () => {},
      getSession: () => null,
    } as unknown as GatewayAuthClient
    const store = createGatewayAuthStore({ client: auth })
    show(
      <GatewayBoundary store={store}>
        <GatewayShareCapture client={loaded(client())} storage={storage} />
      </GatewayBoundary>,
    )
    await act(async () => {})
    expect(screen.getByText('Sign in to Conker')).toBeTruthy()
    expect(screen.queryByText(/Recipe/)).toBeNull()
    fireEvent.change(screen.getByLabelText('Owner password'), { target: { value: 'correct horse battery' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    })
    expect(box().value).toBe('Recipe\nhttps://example.com/soup')
  })
})
