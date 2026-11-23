import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PendingSubmissions } from '@/components/gateway/pending-submissions'
import type { GatewayRuntimeClient, RuntimePendingSubmission } from '@/lib/gateway/runtime'
import { GatewayError } from '@/lib/gateway/transport'

afterEach(() => cleanup())

const row = (index: number, over: Partial<RuntimePendingSubmission> = {}): RuntimePendingSubmission => ({ requestId: `req_${index}`, status: 'accepted_awaiting_history', ...over }) as RuntimePendingSubmission
const rows = (count: number, from = 1) => Array.from({ length: count }, (_, index) => row(from + index))

function show(props: { initial?: RuntimePendingSubmission[]; truncated?: boolean; disabled?: boolean; list?: ReturnType<typeof vi.fn>; onInspect?: (row: RuntimePendingSubmission) => void } = {}) {
  const list = props.list ?? vi.fn()
  const onInspect = props.onInspect ?? vi.fn()
  render(
    <PendingSubmissions
      client={{ listPendingSubmissions: list } as unknown as GatewayRuntimeClient}
      sessionId="sess_1"
      initial={props.initial ?? rows(2)}
      truncated={props.truncated ?? false}
      disabled={props.disabled ?? false}
      onInspect={onInspect}
    />,
  )
  return { list, onInspect }
}
const more = () => screen.getByRole('button', { name: /Load earlier submissions|Loading…/ }) as HTMLButtonElement

describe('PendingSubmissions', () => {
  it('shows nothing when no saved message needs attention', () => {
    show({ initial: [] })
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('is a named region that counts the saved messages and explains what they are', () => {
    show({ initial: rows(3) })
    const region = screen.getByRole('region', { name: 'Saved message recovery' })
    expect(within(region).getByText('A saved message needs your attention (3)')).not.toBeNull()
    expect(within(region).getByText('These requests survived a reload. Inspect their saved state before deciding how to continue.')).not.toBeNull()
    expect(within(region).getAllByRole('listitem')).toHaveLength(3)
  })

  it('shows each request’s status in plain words and its id, never its content', () => {
    show({ initial: [row(1, { status: 'preparation_failed' as never })] })
    const item = screen.getByRole('listitem')
    expect(within(item).getByText('preparation failed')).not.toBeNull()
    expect(within(item).getByText('req_1')).not.toBeNull()
  })

  it('hands the row to the inspector when Inspect submission is pressed', () => {
    const { onInspect } = show({ initial: rows(2) })
    fireEvent.click(within(screen.getAllByRole('listitem')[1]).getByRole('button', { name: 'Inspect submission' }))
    expect(onInspect).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'req_2' }))
  })

  it('greys every button while the chat is busy', () => {
    show({ initial: rows(2), truncated: true, disabled: true })
    for (const button of screen.getAllByRole('button')) expect((button as HTMLButtonElement).disabled).toBe(true)
  })

  it('offers no way to load more when the list is complete', () => {
    show({ initial: rows(2), truncated: false })
    expect(screen.queryByRole('button', { name: 'Load earlier submissions' })).toBeNull()
    expect(screen.getByText('A saved message needs your attention (2)')).not.toBeNull()
  })

  it('marks a cut-off list with a plus and loads the earlier submissions after the last one', async () => {
    const list = vi.fn().mockResolvedValue({ results: rows(2, 3), nextCursor: null })
    show({ initial: rows(2), truncated: true, list })
    expect(screen.getByText('A saved message needs your attention (2+)')).not.toBeNull()
    fireEvent.click(more())
    expect(await screen.findByText('A saved message needs your attention (4)')).not.toBeNull()
    expect(list).toHaveBeenCalledWith('sess_1', { cursor: 'req_2' })
    expect(screen.queryByRole('button', { name: 'Load earlier submissions' })).toBeNull()
  })

  it('says it is loading and holds the button until the page arrives', async () => {
    let finish: (value: unknown) => void = () => undefined
    const list = vi.fn().mockReturnValue(new Promise(done => (finish = done)))
    show({ initial: rows(1), truncated: true, list })
    // A double click lands before the page has had time to redraw the button: it still asks for one page only.
    act(() => {
      fireEvent.click(more())
      fireEvent.click(more())
    })
    expect(more().textContent).toBe('Loading…')
    expect(more().disabled).toBe(true)
    expect(list).toHaveBeenCalledTimes(1)
    expect((screen.getByRole('button', { name: 'Inspect submission' }) as HTMLButtonElement).disabled).toBe(true)
    finish({ results: [], nextCursor: null })
    await waitFor(() => expect(screen.queryByRole('button', { name: /Loading…/ })).toBeNull())
  })

  it('keeps following the cursor while the server has more pages', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ results: rows(1, 2), nextCursor: 'req_2' })
      .mockResolvedValueOnce({ results: rows(1, 3), nextCursor: null })
    show({ initial: rows(1), truncated: true, list })
    fireEvent.click(more())
    expect(await screen.findByText('A saved message needs your attention (2+)')).not.toBeNull()
    fireEvent.click(more())
    expect(await screen.findByText('A saved message needs your attention (3)')).not.toBeNull()
    expect(list).toHaveBeenLastCalledWith('sess_1', { cursor: 'req_2' })
  })

  it('does not list the same request twice when a page repeats one', async () => {
    const list = vi.fn().mockResolvedValue({ results: [row(1), row(2)], nextCursor: null })
    show({ initial: rows(1), truncated: true, list })
    fireEvent.click(more())
    expect(await screen.findByText('A saved message needs your attention (2)')).not.toBeNull()
    expect(screen.getAllByText('req_1')).toHaveLength(1)
  })

  it('shows why loading failed as an alert and lets the owner try again', async () => {
    const list = vi
      .fn()
      .mockRejectedValueOnce(new GatewayError('network'))
      .mockResolvedValueOnce({ results: rows(1, 2), nextCursor: null })
    show({ initial: rows(1), truncated: true, list })
    fireEvent.click(more())
    expect((await screen.findByRole('alert')).textContent!.length).toBeGreaterThan(0)
    expect(more().disabled).toBe(false)
    fireEvent.click(more())
    expect(await screen.findByText('A saved message needs your attention (2)')).not.toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('lists fifty saved messages, each with its own Inspect button', () => {
    show({ initial: rows(50) })
    expect(screen.getAllByRole('listitem')).toHaveLength(50)
    expect(screen.getByText('A saved message needs your attention (50)')).not.toBeNull()
  })
})
