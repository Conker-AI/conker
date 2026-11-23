import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InlineError } from '@/components/resilience/inline-error'
import { connectionStore, reportGatewayReachable } from '@/lib/connection-store'
import { GatewayError } from '@/lib/gateway/transport'

afterEach(() => {
  cleanup()
  connectionStore.setState({ gateway: 'unknown', recoveries: 0 })
})

/** The server goes away and comes back, as the transport reports it. */
const serverRecovers = () =>
  act(() => {
    reportGatewayReachable(false)
    reportGatewayReachable(true)
  })

describe('InlineError content', () => {
  it('falls back to a plain title and description, with no details and no retry', () => {
    render(<InlineError error={null} />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('Couldn’t load this')
    expect(alert.textContent).toContain('Something went wrong while loading this. Try again; if it keeps happening, copy the details.')
    expect(screen.queryByText('Details')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('takes its own title and description over the ones it would pick', () => {
    render(<InlineError error={new GatewayError('network')} title="This didn’t load" description="Open Memory again." />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('This didn’t load')
    expect(alert.textContent).toContain('Open Memory again.')
    expect(alert.textContent).not.toContain('Can’t reach your Conker server')
  })

  it('names a network failure and says what to do next', () => {
    render(<InlineError error={new GatewayError('network')} />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('Can’t reach your Conker server')
    expect(alert.textContent).toContain('Check your connection. This refreshes by itself when your server answers again.')
    expect(alert.textContent).toContain('network')
  })

  it('puts the failure kind and HTTP status under Details', () => {
    render(<InlineError error={new GatewayError('http', 503)} />)
    expect(screen.getByText('Details')).not.toBeNull()
    expect(screen.getByText('http · HTTP 503')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Copy details' })).not.toBeNull()
  })

  it('shows only the kind when there is no HTTP status', () => {
    render(<InlineError error={new GatewayError('dependency')} />)
    expect(screen.getByText('dependency')).not.toBeNull()
  })

  it('calls any other error a browser error', () => {
    render(<InlineError error={new TypeError('boom')} />)
    expect(screen.getByText('browser error')).not.toBeNull()
  })

  it('treats an interrupted request as an unknown outcome, not a plain failure', () => {
    render(<InlineError error={new GatewayError('aborted')} />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('This was interrupted')
    expect(alert.className).toContain('border-warning/32')
  })

  it('treats a changed session the same way, but with nothing safe to retry', () => {
    render(<InlineError error={new GatewayError('session-changed')} onRetry={vi.fn()} />)
    expect(screen.getByRole('alert').className).toContain('border-warning/32')
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('draws a plain failure as an error and keeps a custom class', () => {
    render(<InlineError error={new GatewayError('network')} className="mt-4" />)
    const alert = screen.getByRole('alert')
    expect(alert.className).toContain('border-destructive/32')
    expect(alert.className).toContain('mt-4')
  })
})

describe('InlineError retry', () => {
  it('offers Try again only when the caller can retry', () => {
    const { rerender } = render(<InlineError error={new GatewayError('network')} />)
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    rerender(<InlineError error={new GatewayError('network')} onRetry={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Try again' })).not.toBeNull()
  })

  it('does not offer a retry for a failure that trying again cannot fix', () => {
    render(<InlineError error={new GatewayError('browser-expired')} onRetry={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('offers a retry for an error that is not a Conker error', () => {
    render(<InlineError error={new Error('x')} onRetry={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Try again' })).not.toBeNull()
  })

  it('retries on click and holds the button while the retry is under way', async () => {
    let finish: () => void = () => undefined
    const onRetry = vi.fn().mockReturnValue(new Promise<void>(done => (finish = done)))
    render(<InlineError error={new GatewayError('network')} onRetry={onRetry} />)
    const button = screen.getByRole('button', { name: 'Try again' }) as HTMLButtonElement
    fireEvent.click(button)
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(onRetry).toHaveBeenCalledTimes(1)
    await act(async () => finish())
    expect(button.disabled).toBe(false)
  })

  it('goes back to ready when the retry fails again; the caller shows the new failure', async () => {
    const onRetry = vi.fn().mockRejectedValue(new GatewayError('network'))
    render(<InlineError error={new GatewayError('network')} onRetry={onRetry} />)
    const button = screen.getByRole('button', { name: 'Try again' }) as HTMLButtonElement
    await act(async () => fireEvent.click(button))
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(button.disabled).toBe(false)
  })

  it('does not touch the screen when the retry ends after it was removed', async () => {
    let finish: () => void = () => undefined
    const onRetry = vi.fn().mockReturnValue(new Promise<void>(done => (finish = done)))
    const failures = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { unmount } = render(<InlineError error={new GatewayError('network')} onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    unmount()
    await act(async () => finish())
    expect(failures).not.toHaveBeenCalled()
    failures.mockRestore()
  })
})

describe('InlineError refreshes by itself when the server answers again', () => {
  it('retries once when a network failure ends', () => {
    const onRetry = vi.fn().mockResolvedValue(undefined)
    render(<InlineError error={new GatewayError('network')} onRetry={onRetry} />)
    serverRecovers()
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('retries when a service it needs comes back', () => {
    const onRetry = vi.fn().mockResolvedValue(undefined)
    render(<InlineError error={new GatewayError('dependency')} onRetry={onRetry} />)
    serverRecovers()
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('retries after an error that is not a Conker error', () => {
    const onRetry = vi.fn().mockResolvedValue(undefined)
    render(<InlineError error={new Error('x')} onRetry={onRetry} />)
    serverRecovers()
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('does not retry on its own for a write: the caller says the outcome is unknown instead', () => {
    const onRetry = vi.fn()
    render(<InlineError error={new GatewayError('network')} onRetry={onRetry} retryOnReconnect={false} />)
    serverRecovers()
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('does not retry on its own for a refusal, which would only be refused again', () => {
    const onRetry = vi.fn()
    render(<InlineError error={new GatewayError('http', 403)} onRetry={onRetry} />)
    serverRecovers()
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('does not retry on its own when there is nothing to call', () => {
    render(<InlineError error={new GatewayError('network')} />)
    expect(() => serverRecovers()).not.toThrow()
  })

  it('ignores connection changes that are not a recovery', () => {
    const onRetry = vi.fn()
    render(<InlineError error={new GatewayError('network')} onRetry={onRetry} />)
    act(() => reportGatewayReachable(false))
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('stops listening once it is removed', () => {
    const onRetry = vi.fn().mockResolvedValue(undefined)
    const { unmount } = render(<InlineError error={new GatewayError('network')} onRetry={onRetry} />)
    unmount()
    serverRecovers()
    expect(onRetry).not.toHaveBeenCalled()
  })
})
