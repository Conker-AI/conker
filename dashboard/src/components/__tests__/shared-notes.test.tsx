import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SharedNotes } from '@/components/inbox/shared-notes'
import type { SharedNote } from '@/lib/gateway/shared-notes'

afterEach(cleanup)

const note = (n: string, title: string): SharedNote => ({ id: `note_${n.repeat(32)}`, sessionId: `ses_${n.repeat(16)}`, title, createdAt: 1_760_000_000 })

async function show(notes: SharedNote[], dismiss = vi.fn(async () => {})) {
  const client = { list: vi.fn(async () => notes), dismiss }
  render(
    <MemoryRouter initialEntries={['/inbox']}>
      <Routes>
        <Route path="/inbox" element={<SharedNotes client={client} active />} />
        <Route path="/chat" element={<p>Chat page</p>} />
      </Routes>
    </MemoryRouter>,
  )
  await act(async () => {})
  return client
}

describe('Shared by you', () => {
  it('lists what he shared and Open chat clears the note and opens its chat', async () => {
    const client = await show([note('a', 'Shared: Rates rise next week'), note('b', 'Shared: Soup recipe')])
    expect(screen.getByRole('heading', { name: 'Shared by you' })).toBeTruthy()
    expect(screen.getByText('Shared: Rates rise next week')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Open chat' })[0])
    expect(client.dismiss).toHaveBeenCalledWith(`note_${'a'.repeat(32)}`)
    expect(screen.getByText('Chat page')).toBeTruthy()
  })

  it('shows nothing when there is nothing shared or the read fails', async () => {
    await show([])
    expect(screen.queryByRole('heading', { name: 'Shared by you' })).toBeNull()
    cleanup()
    const client = { list: vi.fn(async () => Promise.reject(new Error('down'))), dismiss: vi.fn() }
    render(
      <MemoryRouter>
        <SharedNotes client={client} active />
      </MemoryRouter>,
    )
    await act(async () => {})
    expect(screen.queryByRole('heading', { name: 'Shared by you' })).toBeNull()
  })
})
