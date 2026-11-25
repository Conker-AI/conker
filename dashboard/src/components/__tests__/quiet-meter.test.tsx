import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QuietMeter, type QuietMeterReader } from '@/components/inbox/quiet-meter'
import type { QuietWeek, QuietWeeks } from '@/lib/gateway/quiet-weeks'
import { GatewayError } from '@/lib/gateway/transport'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const none = { raised: 0, actedOn: 0, dismissed: 0, unanswered: 0 }
const WEEK = 7 * 86400
// Monday 2026-11-09 00:00 UTC; the third week (from Nov 23) is the current one.
const MONDAY = Date.UTC(2026, 10, 9) / 1000
const week = (index: number, over: Partial<QuietWeek> = {}): QuietWeek => ({
  week: `2026-W${46 + index}`,
  startsAt: MONDAY + index * WEEK,
  endsAt: MONDAY + (index + 1) * WEEK,
  asks: 0,
  raised: 0,
  approvalsAsked: 0,
  pushed: 0,
  actedOn: 0,
  dismissed: 0,
  unanswered: 0,
  usefulShare: null,
  suggestions: none,
  questions: none,
  changeRequests: none,
  notices: none,
  ...over,
})
const page = (weeks: QuietWeek[], timeZone = 'UTC'): QuietWeeks => ({ schemaVersion: 1, timeZone, weeks })
const ready = page([week(0, { asks: 15, usefulShare: 0.333 }), week(1, { asks: 12, usefulShare: 0.4, actedOn: 4, dismissed: 2, unanswered: 4, approvalsAsked: 2, pushed: 6 }), week(2, { asks: 3 })])

function show(read: QuietMeterReader['read'], active = true) {
  return render(<QuietMeter client={{ read }} active={active} />)
}
const trigger = () => screen.getByRole('button')
const expand = () => fireEvent.click(trigger())

describe('QuietMeter', () => {
  it('reads nothing while the Inbox is not shown', () => {
    const read = vi.fn()
    show(read, false)
    expect(read).not.toHaveBeenCalled()
  })

  it('says it is loading, collapsed, and shows a skeleton when opened', async () => {
    const read = vi.fn().mockReturnValue(new Promise(() => undefined))
    show(read)
    expect(read).toHaveBeenCalledWith(8, expect.any(AbortSignal))
    expect(trigger().textContent).toBe('Asks per week: loading…')
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expand()
    expect(await screen.findByRole('status', { name: 'Loading asks per week…' })).not.toBeNull()
  })

  it('shows the last full week against the one before as its one line', async () => {
    show(vi.fn().mockResolvedValue(ready))
    expect(await screen.findByText('Last full week: 12 asks, 40% useful (the week before: 15 asks, 33% useful)')).not.toBeNull()
    expect(screen.queryByRole('list', { name: 'Asks per week' })).toBeNull()
  })

  it('opens to every week, newest first, with this week marked as still running', async () => {
    show(vi.fn().mockResolvedValue(ready))
    await screen.findByText(/^Last full week/)
    expand()
    const rows = within(screen.getByRole('list', { name: 'Asks per week' })).getAllByRole('listitem')
    const lines = rows.map(row => row.firstElementChild?.textContent ?? '')
    expect(lines[0]).toBe('This week, so far3 asks')
    expect(lines[1]).toMatch(/^Nov 16\s–\s22\s?12 asks · 40% useful$/)
    expect(lines[2]).toMatch(/^Nov 9\s–\s15\s?15 asks · 33% useful$/)
    expect(rows[1].textContent).toContain('4 acted on · 2 dismissed · 4 unanswered · 2 approvals · 6 sent as notifications')
    expect(screen.getByText(/The last 3 weeks, Monday to Sunday \(UTC\)/)).not.toBeNull()
    expect(screen.getByText(/^Asks: the suggestions, questions, requests and notes Conker raised/)).not.toBeNull()
  })

  it('remembers that it was opened in this browser', async () => {
    show(vi.fn().mockResolvedValue(ready))
    await screen.findByText(/^Last full week/)
    expand()
    expect(localStorage.getItem('conker-inbox-quiet-open')).toBe('true')
    cleanup()
    show(vi.fn().mockResolvedValue(ready))
    expect(await screen.findByRole('list', { name: 'Asks per week' })).not.toBeNull()
    expand()
    expect(localStorage.getItem('conker-inbox-quiet-open')).toBe('false')
  })

  it('still works when the browser keeps nothing', async () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    show(vi.fn().mockResolvedValue(ready))
    await screen.findByText(/^Last full week/)
    expand()
    expect(screen.getByRole('list', { name: 'Asks per week' })).not.toBeNull()
    get.mockRestore()
    set.mockRestore()
  })

  it('says there are not enough weeks yet while no full week holds an ask, and still lists the weeks', async () => {
    show(vi.fn().mockResolvedValue(page([week(0), week(1), week(2, { asks: 1 })], 'Not/AZone')))
    expect(await screen.findByText('Asks per week: not enough weeks yet')).not.toBeNull()
    expand()
    expect(screen.getByText(/needs a full week with asks/)).not.toBeNull()
    const rows = within(screen.getByRole('list', { name: 'Asks per week' })).getAllByRole('listitem')
    expect(rows[0].textContent).toBe('This week, so far1 ask')
    expect(rows).toHaveLength(3)
  })

  it('draws empty bars when no week holds an ask at all', async () => {
    show(vi.fn().mockResolvedValue(page([week(0), week(1)])))
    await screen.findByText('Asks per week: not enough weeks yet')
    expand()
    expect(within(screen.getByRole('list', { name: 'Asks per week' })).getAllByRole('listitem').map(row => row.textContent)).toEqual(['This week, so far0 asks', expect.stringMatching(/0 asks$/)])
  })

  it('says an older server needs the next update, plainly, with no error and no retry', async () => {
    show(vi.fn().mockRejectedValue(new GatewayError('http', 404)))
    expect(await screen.findByText('Asks per week: needs the next Conker update')).not.toBeNull()
    expand()
    expect(screen.getByText(/after the next update/)).not.toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('names a failed read and reads again on Try again', async () => {
    const read = vi.fn().mockRejectedValueOnce(new GatewayError('dependency', 503)).mockResolvedValue(ready)
    show(read)
    expect(await screen.findByText('Asks per week didn’t load')).not.toBeNull()
    expand()
    expect(within(screen.getByRole('alert')).getByText('Asks per week didn’t load')).not.toBeNull()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Try again' })))
    expect(read).toHaveBeenCalledTimes(2)
    expect(await screen.findByText(/^Last full week: 12 asks/)).not.toBeNull()
  })

  it('drops an answer that arrives after it was left', async () => {
    let resolve: (value: QuietWeeks) => void = () => undefined
    let reject: (cause: unknown) => void = () => undefined
    const { unmount } = show(vi.fn().mockReturnValueOnce(new Promise<QuietWeeks>(done => (resolve = done))))
    unmount()
    await act(async () => resolve(ready))
    const second = show(vi.fn().mockReturnValueOnce(new Promise<QuietWeeks>((_, fail) => (reject = fail))))
    second.unmount()
    await act(async () => reject(new GatewayError('network')))
    expect(screen.queryByText(/Last full week|didn’t load/)).toBeNull()
  })
})
