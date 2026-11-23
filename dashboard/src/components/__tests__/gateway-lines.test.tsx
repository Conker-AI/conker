import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImportedChatsLine } from '@/components/gateway/imported-chats-line'
import { MemoryUsesLine } from '@/components/gateway/memory-uses-line'
import type { GatewayImportsClient, ImportedChatPage } from '@/lib/gateway/imports'
import type { MemoryUsesClient } from '@/lib/gateway/memory-uses'
import { GatewayError } from '@/lib/gateway/transport'

afterEach(() => cleanup())

const importsClient = (chats: GatewayImportsClient['chats']) => ({ chats }) as unknown as GatewayImportsClient
const page = (total: number) => ({ total }) as ImportedChatPage

function showImports(chats: GatewayImportsClient['chats']) {
  return render(
    <MemoryRouter>
      <ImportedChatsLine client={importsClient(chats)} />
    </MemoryRouter>,
  )
}

describe('ImportedChatsLine', () => {
  it('shows nothing until the count is known', () => {
    const { container } = showImports(() => new Promise(() => undefined))
    expect(container.textContent).toBe('')
  })

  it('shows nothing when the count cannot be read', async () => {
    const chats = vi.fn().mockRejectedValue(new GatewayError('network'))
    const { container } = showImports(chats)
    await waitFor(() => expect(chats).toHaveBeenCalled())
    await Promise.resolve()
    expect(container.textContent).toBe('')
  })

  it('asks for one chat only, to learn the total', async () => {
    const chats = vi.fn().mockResolvedValue(page(2))
    showImports(chats)
    await screen.findByRole('link')
    expect(chats).toHaveBeenCalledWith({ limit: 1 })
  })

  it('invites the owner to import when nothing is imported yet', async () => {
    showImports(vi.fn().mockResolvedValue(page(0)))
    const link = await screen.findByRole('link', { name: /Import from ChatGPT or Claude/ })
    expect(link.getAttribute('href')).toBe('/chats?view=import')
    expect(link.textContent).toContain('Read-only copies of old chats')
  })

  it('links to the imported chats with a plural count', async () => {
    showImports(vi.fn().mockResolvedValue(page(1234)))
    const link = await screen.findByRole('link', { name: /Imported chats/ })
    expect(link.getAttribute('href')).toBe('/chats?view=imported')
    expect(link.textContent).toContain(`${(1234).toLocaleString()} chats, read-only`)
  })

  it('says "1 chat" for a single imported chat', async () => {
    showImports(vi.fn().mockResolvedValue(page(1)))
    const link = await screen.findByRole('link', { name: /Imported chats/ })
    expect(link.textContent).toContain('1 chat, read-only')
  })

  it('ignores an answer that arrives after it was removed', async () => {
    let resolve: (value: ImportedChatPage) => void = () => undefined
    const chats = vi.fn().mockReturnValue(new Promise<ImportedChatPage>(done => (resolve = done)))
    const { container, unmount } = showImports(chats)
    unmount()
    resolve(page(5))
    await Promise.resolve()
    expect(container.textContent).toBe('')
  })
})

const usesClient = (uses: MemoryUsesClient['uses']) => ({ uses }) as MemoryUsesClient
const usesPage = (total: number, chats: number) => ({ total, chats }) as Awaited<ReturnType<MemoryUsesClient['uses']>>

describe('MemoryUsesLine', () => {
  it('makes no call until it is asked', () => {
    const uses = vi.fn()
    render(<MemoryUsesLine client={usesClient(uses)} memoryId="mem_1" />)
    expect(screen.getByRole('button', { name: 'Where was this used?' })).not.toBeNull()
    expect(uses).not.toHaveBeenCalled()
  })

  it('shows Checking… and turns the button off while it reads', async () => {
    let resolve: (value: Awaited<ReturnType<MemoryUsesClient['uses']>>) => void = () => undefined
    const uses = vi.fn().mockReturnValue(new Promise(done => (resolve = done)))
    render(<MemoryUsesLine client={usesClient(uses)} memoryId="mem_9" />)
    fireEvent.click(screen.getByRole('button', { name: 'Where was this used?' }))
    const busy = screen.getByRole('button', { name: 'Checking…' }) as HTMLButtonElement
    expect(busy.disabled).toBe(true)
    expect(uses).toHaveBeenCalledWith('mem_9')
    resolve(usesPage(1, 1))
    await screen.findByRole('status')
  })

  it('says how many answers and chats used the memory, in the plural', async () => {
    render(<MemoryUsesLine client={usesClient(vi.fn().mockResolvedValue(usesPage(3, 2)))} memoryId="mem_1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Where was this used?' }))
    expect((await screen.findByRole('status')).textContent).toBe('Used in 3 answers in 2 chats.')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('uses the singular for one answer in one chat', async () => {
    render(<MemoryUsesLine client={usesClient(vi.fn().mockResolvedValue(usesPage(1, 1)))} memoryId="mem_1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Where was this used?' }))
    expect((await screen.findByRole('status')).textContent).toBe('Used in 1 answer in 1 chat.')
  })

  it('says so when it was never used', async () => {
    render(<MemoryUsesLine client={usesClient(vi.fn().mockResolvedValue(usesPage(0, 0)))} memoryId="mem_1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Where was this used?' }))
    expect((await screen.findByRole('status')).textContent).toBe('Not used in an answer yet.')
  })

  it('shows the failure as an alert with Try again, and a retry can succeed', async () => {
    const uses = vi.fn().mockRejectedValueOnce(new GatewayError('network')).mockResolvedValueOnce(usesPage(2, 1))
    render(<MemoryUsesLine client={usesClient(uses)} memoryId="mem_1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Where was this used?' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(new GatewayError('network').message)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect((await screen.findByRole('status')).textContent).toBe('Used in 2 answers in 1 chat.')
    expect(uses).toHaveBeenCalledTimes(2)
  })

  it('shows a plain network failure for an error that is not a Conker error', async () => {
    render(<MemoryUsesLine client={usesClient(vi.fn().mockRejectedValue(new TypeError('boom')))} memoryId="mem_1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Where was this used?' }))
    expect((await screen.findByRole('alert')).textContent).toContain(new GatewayError('network').message)
  })
})
