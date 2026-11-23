import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GatewayOpenLoops } from '@/components/gateway/open-loops-workspace'
import type { OpenLoop, OpenLoopPage, OpenLoopsClient } from '@/lib/gateway/open-loops'
import { GatewayError } from '@/lib/gateway/transport'

afterEach(() => cleanup())

const loop = (over: Partial<OpenLoop> = {}): OpenLoop => ({
  id: `loop_${'0'.repeat(32)}`,
  sessionId: 'sess_1',
  sessionTitle: 'Taxes',
  messageId: 'msg_1',
  quote: null,
  text: 'Send the form to the accountant',
  promisedBy: 'owner',
  dueOn: null,
  overdue: false,
  state: 'open',
  revision: 1,
  createdAt: 1,
  updatedAt: 1,
  ...over,
})
const page = (items: OpenLoop[], nextAfter: string | null = null): OpenLoopPage => ({ today: '2026-11-23', timeZone: 'UTC', items, nextAfter })

type List = OpenLoopsClient['list']
function show(list: List) {
  render(
    <MemoryRouter>
      <GatewayOpenLoops client={{ list } as OpenLoopsClient} />
    </MemoryRouter>,
  )
}
const checkAgain = () => screen.getByRole('button', { name: 'Check again' }) as HTMLButtonElement

describe('GatewayOpenLoops', () => {
  it('shows a loading state while the first read is under way, and the refresh button is off', async () => {
    let resolve: (value: OpenLoopPage) => void = () => undefined
    show(vi.fn().mockReturnValue(new Promise<OpenLoopPage>(done => (resolve = done))))
    expect(screen.getByRole('status', { name: 'Loading' })).not.toBeNull()
    expect(checkAgain().disabled).toBe(true)
    await act(async () => resolve(page([])))
    expect(screen.queryByRole('status', { name: 'Loading' })).toBeNull()
    expect(checkAgain().disabled).toBe(false)
  })

  it('explains the page and points to the command line for changes', async () => {
    show(vi.fn().mockResolvedValue(page([])))
    await screen.findByText('Nothing is waiting on a promise.')
    expect(screen.getByRole('heading', { name: 'Open loops' })).not.toBeNull()
    expect(screen.getByText('conker loops add')).not.toBeNull()
    expect(screen.getByText('conker loops done')).not.toBeNull()
    expect(screen.getByText('conker loops drop')).not.toBeNull()
  })

  it('reads the open ones first and marks "Still open" as the pressed filter', async () => {
    const list = vi.fn().mockResolvedValue(page([]))
    show(list)
    await screen.findByText('Nothing is waiting on a promise.')
    expect(list).toHaveBeenCalledWith('open', null, expect.any(AbortSignal))
    const group = screen.getByRole('group', { name: 'Show' })
    expect(within(group).getByRole('button', { name: 'Still open' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(group).getByRole('button', { name: 'Done' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('lists each promise with who made it, the day, and a link to the message in its chat', async () => {
    show(vi.fn().mockResolvedValue(page([loop({ dueOn: '2026-12-01' }), loop({ id: `loop_${'1'.repeat(32)}`, text: 'Book the venue', promisedBy: 'conker', dueOn: null, sessionId: 'sess_2', messageId: null, sessionTitle: '' })])))
    const rows = await screen.findAllByRole('listitem')
    expect(rows).toHaveLength(2)
    const due = new Date('2026-12-01T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
    expect(within(rows[0]).getByText('Send the form to the accountant')).not.toBeNull()
    expect(within(rows[0]).getByText(`You promised · due ${due}`)).not.toBeNull()
    expect(within(rows[0]).getByRole('link', { name: 'Taxes' }).getAttribute('href')).toBe('/chat?session=sess_1&message=msg_1')
    expect(within(rows[1]).getByText('Conker promised · no day set')).not.toBeNull()
    expect(within(rows[1]).getByRole('link', { name: 'a chat' }).getAttribute('href')).toBe('/chat?session=sess_2')
  })

  it('marks an overdue promise, and only that one', async () => {
    show(vi.fn().mockResolvedValue(page([loop({ overdue: true, dueOn: '2026-11-01' }), loop({ id: `loop_${'2'.repeat(32)}`, text: 'Later one' })])))
    const rows = await screen.findAllByRole('listitem')
    expect(within(rows[0]).getByText('Overdue')).not.toBeNull()
    expect(within(rows[1]).queryByText('Overdue')).toBeNull()
  })

  it('switches to Done, reads that list and says when nothing is done yet', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce(page([loop()]))
      .mockResolvedValueOnce(page([]))
    show(list)
    await screen.findByText('Send the form to the accountant')
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByText('Send the form to the accountant')).toBeNull()
    expect(screen.getByRole('status', { name: 'Loading' })).not.toBeNull()
    await screen.findByText('Nothing is marked done yet.')
    expect(list).toHaveBeenLastCalledWith('done', null, expect.any(AbortSignal))
    expect(screen.getByRole('button', { name: 'Done' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Still open' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('reads again on Check again', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce(page([]))
      .mockResolvedValueOnce(page([loop({ text: 'New promise' })]))
    show(list)
    await screen.findByText('Nothing is waiting on a promise.')
    fireEvent.click(checkAgain())
    expect(checkAgain().disabled).toBe(true)
    await screen.findByText('New promise')
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('shows a failed first read as an error with a way to try again, then the list', async () => {
    const list = vi
      .fn()
      .mockRejectedValueOnce(new GatewayError('network'))
      .mockResolvedValueOnce(page([loop()]))
    show(list)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('This didn’t load')
    expect(screen.queryByRole('status', { name: 'Loading' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByText('Send the form to the accountant')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('offers Show more when there is another page, and adds its promises below the first', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce(page([loop()], 'cursor_1'))
      .mockResolvedValueOnce(page([loop({ id: `loop_${'3'.repeat(32)}`, text: 'Second page promise' })]))
    show(list)
    await screen.findByText('Send the form to the accountant')
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
    await screen.findByText('Second page promise')
    expect(list).toHaveBeenLastCalledWith('open', 'cursor_1')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull()
  })

  it('shows Loading… on the button while the next page is read', async () => {
    let resolve: (value: OpenLoopPage) => void = () => undefined
    const list = vi
      .fn()
      .mockResolvedValueOnce(page([loop()], 'cursor_1'))
      .mockReturnValueOnce(new Promise<OpenLoopPage>(done => (resolve = done)))
    show(list)
    await screen.findByText('Send the form to the accountant')
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
    const busy = screen.getByRole('button', { name: 'Loading…' }) as HTMLButtonElement
    expect(busy.disabled).toBe(true)
    await act(async () => resolve(page([])))
    expect(screen.queryByRole('button', { name: 'Loading…' })).toBeNull()
  })

  it('keeps the last result and says so when a later page cannot be read', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce(page([loop()], 'cursor_1'))
      .mockRejectedValueOnce(new GatewayError('network'))
    show(list)
    await screen.findByText('Send the form to the accountant')
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Couldn’t update this. It shows the last result.')
    expect(screen.getByText('Send the form to the accountant')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Show more' })).not.toBeNull()
  })

  it('does not ask for more when there is no next page', async () => {
    const list = vi.fn().mockResolvedValue(page([loop()]))
    show(list)
    await screen.findByText('Send the form to the accountant')
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull()
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('drops an answer that arrives after the list was left, without an error', async () => {
    let reject: (error: unknown) => void = () => undefined
    const list = vi
      .fn()
      .mockReturnValueOnce(new Promise<OpenLoopPage>((_, fail) => (reject = fail)))
      .mockResolvedValueOnce(page([]))
    show(list)
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await act(async () => reject(new GatewayError('aborted')))
    await screen.findByText('Nothing is marked done yet.')
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })
})
