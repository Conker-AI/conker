import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Sparkles } from 'lucide-react'
import { FocusBar } from '@/components/gateway/focus-bar'
import { pickShown, useCardLimit } from '@/components/inbox/card-limit'
import { InboxCard } from '@/components/inbox/inbox-card'
import { ShownTime } from '@/components/shown-time'
import { GatewayError } from '@/lib/gateway/transport'
import { factTime, fullTime, shownTime, timeAgo } from '@/lib/shown-time'
import { publishServerSettings, serverSetting } from '@/settings/server-setting'

/** Settings round ten (R-F1): Cards at once, Focus mode, Easy mode and Times; each test fails if its reader ignores the value. */
let revision = 19_000
function choose(values: Record<string, unknown>) {
  revision += 1
  act(() => publishServerSettings({ revision, values }))
}
const NOW = Date.parse('2026-11-25T12:00:00Z')
const minutes = (count: number) => NOW - count * 60_000

afterEach(() => {
  choose({})
  cleanup()
})

describe('appearance.timestamps', () => {
  it('words how long ago one way for every list', () => {
    expect(timeAgo(NOW - 20_000, NOW)).toBe('Just now')
    expect(timeAgo(minutes(5), NOW)).toBe('5 min ago')
    expect(timeAgo(minutes(3 * 60 + 2), NOW)).toBe('3 hr ago')
    expect(timeAgo(minutes(24 * 60 + 5), NOW)).toBe('1 day ago')
    expect(timeAgo(minutes(4 * 24 * 60), NOW)).toBe('4 days ago')
    expect(timeAgo(NOW + 60_000, NOW)).toBe('Just now')
  })

  it('shows the relative time, the exact time, or nothing on a list line; details always keep the full time', () => {
    expect(shownTime(minutes(5), NOW, 'relative')).toBe('5 min ago')
    expect(shownTime(minutes(5), NOW, 'exact')).not.toMatch(/ago/)
    expect(shownTime(minutes(5), NOW, 'hidden')).toBeNull()
    expect(factTime(minutes(5), NOW, 'relative')).toBe(`5 min ago · ${fullTime(minutes(5))}`)
    expect(factTime(minutes(5), NOW, 'hidden')).toBe(fullTime(minutes(5)))
  })

  it('puts when an Inbox card came on its source line, as he chose', () => {
    render(<InboxCard icon={<Sparkles />} title="Invoices are overdue" source="AI job" came={{ at: minutes(5), now: NOW }} />)
    const line = () => screen.getByText(/^AI job/).textContent
    expect(line()).toBe('AI job · 5 min ago')
    choose({ 'appearance.timestamps': 'exact' })
    expect(line()).not.toMatch(/ago/)
    expect(line()).toMatch(/^AI job · \S/)
    choose({ 'appearance.timestamps': 'hidden' })
    expect(line()).toBe('AI job')
  })

  it('labels a chat time with its full date and time, and leaves it out when hidden', () => {
    const at = new Date(Date.now() - 5 * 60_000).toISOString()
    const view = render(<ShownTime at={at} />)
    const time = () => view.container.querySelector('time')
    expect(time()?.textContent).toBe('5 min ago')
    expect(time()?.getAttribute('aria-label')).toBe(fullTime(Date.parse(at)))
    choose({ 'appearance.timestamps': 'hidden' })
    expect(time()).toBeNull()
  })
})

describe('day.max_cards and day.easy_mode', () => {
  it('shows the first cards up to the limit, keeps a card already on screen, and fills a gap with the next', () => {
    expect(pickShown(['a', 'b', 'c', 'd'], 2, [])).toEqual(['a', 'b'])
    // A newer card arrived first in order: the two he is looking at stay.
    expect(pickShown(['new', 'a', 'b', 'c'], 2, ['a', 'b'])).toEqual(['a', 'b'])
    // He decided "a": the next one in order takes its place.
    expect(pickShown(['new', 'b', 'c'], 2, ['a', 'b'])).toEqual(['new', 'b'])
    expect(pickShown(['a'], 5, [])).toEqual(['a'])
  })

  function Cards({ keys, limit }: { keys: string[]; limit: number }) {
    const { shown, hidden, showAll } = useCardLimit(keys, limit)
    return (
      <div>
        {keys
          .filter(key => shown.has(key))
          .map(key => (
            <p key={key}>card {key}</p>
          ))}
        {hidden > 0 && (
          <button type="button" onClick={showAll}>
            {hidden} more waiting
          </button>
        )}
      </div>
    )
  }

  it('never hides a card without saying how many, and shows them all in one tap', () => {
    render(<Cards keys={['a', 'b', 'c']} limit={1} />)
    expect(screen.getAllByText(/^card/).map(item => item.textContent)).toEqual(['card a'])
    fireEvent.click(screen.getByRole('button', { name: '2 more waiting' }))
    expect(screen.getAllByText(/^card/)).toHaveLength(3)
    expect(screen.queryByRole('button', { name: /more waiting/ })).toBeNull()
  })

  it('marks the page for larger buttons while Easy mode is on', async () => {
    const { useAppearanceSync } = await import('@/settings/appearance')
    function Sync() {
      useAppearanceSync({ settings: { read: () => new Promise(() => undefined) } } as never)
      return null
    }
    render(<Sync />)
    expect(document.documentElement.dataset.targets).toBeUndefined()
    choose({ 'day.easy_mode': true })
    expect(document.documentElement.dataset.targets).toBe('large')
    choose({})
    expect(document.documentElement.dataset.targets).toBeUndefined()
  })
})

describe('day.focus_mode', () => {
  const document = (values: Record<string, unknown>, at = 50) => ({ schemaVersion: 1 as const, revision: at, values })
  const bar = (client: Parameters<typeof FocusBar>[0]['client']) =>
    render(
      <MemoryRouter>
        <FocusBar client={client} hidden="Only decisions show here. 3 other items are hidden." />
      </MemoryRouter>,
    )

  it('says focus is on and what it hides, and turns it off only once the server saved it', async () => {
    choose({ 'day.focus_mode': true, 'appearance.accent': 'blue' })
    let finish: (value: ReturnType<typeof document>) => void = () => undefined
    const save = vi.fn(() => new Promise<ReturnType<typeof document>>(resolve => (finish = resolve)))
    bar({ read: vi.fn(async () => document({ 'day.focus_mode': true, 'appearance.accent': 'blue' })), save })
    expect(screen.getByText('Focus on.')).not.toBeNull()
    expect(screen.getByText(/3 other items are hidden/)).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Turn off focus' }))
    expect((await screen.findByRole('button', { name: /Turning off/ })).hasAttribute('disabled')).toBe(true)
    await vi.waitFor(() => expect(save).toHaveBeenCalledWith({ 'appearance.accent': 'blue' }, 50))
    expect(serverSetting('day.focus_mode', false)).toBe(true)
    await act(async () => finish(document({ 'appearance.accent': 'blue' }, 1_000_000)))
    expect(serverSetting('day.focus_mode', false)).toBe(false)
    revision = 1_000_000
  })

  it('says focus is still on when the save failed', async () => {
    choose({ 'day.focus_mode': true })
    bar({
      read: vi.fn(async () => document({ 'day.focus_mode': true }, 2_000_000)),
      save: vi.fn(async () => {
        throw new GatewayError('http', 409)
      }),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Turn off focus' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Focus is still on. Your settings changed somewhere else. Try again.')
    expect(screen.getByRole('button', { name: 'Try again' })).not.toBeNull()
    revision = 2_000_000
  })

  it('does not claim a failure when the save landed after all, and says so when it cannot tell', async () => {
    choose({ 'day.focus_mode': true })
    const read = vi
      .fn()
      .mockResolvedValueOnce(document({ 'day.focus_mode': true }, 3_000_000))
      .mockResolvedValueOnce(document({}, 3_000_001))
    bar({
      read,
      save: vi.fn(async () => {
        throw new GatewayError('network')
      }),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Turn off focus' }))
    await vi.waitFor(() => expect(serverSetting('day.focus_mode', false)).toBe(false))
    expect(screen.queryByRole('alert')).toBeNull()
    cleanup()
    revision = 3_000_001
    choose({ 'day.focus_mode': true })
    bar({
      read: vi
        .fn()
        .mockResolvedValueOnce(document({ 'day.focus_mode': true }, 4_000_000))
        .mockRejectedValueOnce(new GatewayError('network')),
      save: vi.fn(async () => {
        throw new GatewayError('network')
      }),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Turn off focus' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/^Couldn’t check whether focus turned off/)
    revision = 4_000_000
  })

  it('points to Settings when this screen cannot save', () => {
    bar(undefined)
    expect(screen.getByRole('link', { name: 'Turn off in Settings' }).getAttribute('href')).toBe('/settings?group=day&focus=day.focus_mode')
  })
})
