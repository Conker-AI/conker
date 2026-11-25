import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RecallNoticeCard } from '@/components/inbox/recall-notice-card'
import type { RecallNotice } from '@/lib/gateway/recall-notices'
import { timeAgo } from '@/lib/shown-time'

afterEach(() => cleanup())

const since = 1_700_000_000
const NOW = since * 1000 + 3 * 86_400_000
const notice = (over: Partial<RecallNotice> = {}): RecallNotice => ({
  kind: 'memory-recall',
  id: `mrn_${'a'.repeat(32)}`,
  title: 'A memory you corrected was used',
  since,
  memoryId: 'mem_1',
  change: 'corrected',
  answers: 3,
  chats: 2,
  sessionIds: ['s1', 's2'],
  sessions: [
    { id: 's1', title: 'Trip planning' },
    { id: 's2', title: '' },
  ],
  source: { kind: 'memory-recall', noticeId: `mrn_${'a'.repeat(32)}`, memoryId: 'mem_1' },
  ...over,
})

function show(over: Partial<RecallNotice> = {}, props: { busy?: boolean; error?: string | null; onDismiss?: () => void } = {}) {
  const onDismiss = props.onDismiss ?? vi.fn()
  render(
    <MemoryRouter>
      <RecallNoticeCard notice={notice(over)} now={NOW} busy={props.busy ?? false} error={props.error ?? null} onDismiss={onDismiss} />
    </MemoryRouter>,
  )
  return onDismiss
}

describe('RecallNoticeCard', () => {
  it('is one folded card: title, what changed and when, and the one answer to open it', () => {
    show()
    const card = screen.getByRole('article', { name: 'A memory you corrected was used' })
    expect(within(card).getByText(`Memory corrected · ${timeAgo(since * 1000, NOW)}`)).not.toBeNull()
    expect(within(card).getByRole('button', { name: 'See the chats' })).not.toBeNull()
    expect(
      within(card)
        .getByRole('button', { name: /^A memory you corrected was used/ })
        .getAttribute('aria-expanded'),
    ).toBe('false')
    expect(screen.queryByRole('list', { name: 'Chats with these answers' })).toBeNull()
  })

  it('opens to explain what happened and list the chats, each with a link to open it', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'See the chats' }))
    expect(screen.getByText(/You corrected a memory\. Those answers were written before that, so they may still say the old thing\. The chats below are unchanged\./)).not.toBeNull()
    const list = screen.getByRole('list', { name: 'Chats with these answers' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('Trip planning')).not.toBeNull()
    expect(within(rows[0]).getByRole('link', { name: 'Open the chat Trip planning' }).getAttribute('href')).toBe('/chat?session=s1')
    expect(within(rows[1]).getByText('Untitled chat')).not.toBeNull()
    expect(within(rows[1]).getByRole('link', { name: 'Open the chat Untitled chat' }).getAttribute('href')).toBe('/chat?session=s2')
  })

  it.each([
    ['corrected', 'Memory corrected', 'You corrected a memory.'],
    ['forgotten', 'Memory forgotten', 'You told Conker to forget a memory.'],
    ['changed', 'Memory changed', 'You changed a memory.'],
  ] as const)('says the %s change in its own words', (change, when, what) => {
    show({ change })
    expect(screen.getByText(new RegExp(`^${when} · `))).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'See the chats' }))
    expect(screen.getByText(new RegExp(`^${what}`))).not.toBeNull()
  })

  it('says how many chats are not listed, in the singular and the plural', () => {
    show({ chats: 3 })
    fireEvent.click(screen.getByRole('button', { name: 'See the chats' }))
    expect(screen.getByText('and 1 more chat')).not.toBeNull()
    cleanup()
    show({ chats: 7 })
    fireEvent.click(screen.getByRole('button', { name: 'See the chats' }))
    expect(screen.getByText('and 5 more chats')).not.toBeNull()
  })

  it('shows no list and no "more" line when there are no chats to open', () => {
    show({ chats: 0, sessionIds: [], sessions: [] })
    fireEvent.click(screen.getByRole('button', { name: 'See the chats' }))
    expect(screen.queryByRole('list', { name: 'Chats with these answers' })).toBeNull()
    expect(screen.queryByText(/more chat/)).toBeNull()
  })

  it('keeps the record under Advanced until it is asked for', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'See the chats' }))
    expect(screen.queryByText('Answers')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
    expect(screen.getByText('What changed').nextElementSibling?.textContent).toBe('Memory corrected')
    expect(screen.getByText('Answers').nextElementSibling?.textContent).toBe('3')
    expect(screen.getByText('Chats').nextElementSibling?.textContent).toBe('2')
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
    expect(screen.queryByText('Answers')).toBeNull()
  })

  it('dismisses from the card button and from the X, and says which card the X is for', () => {
    const onDismiss = show()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss: A memory you corrected was used' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'See the chats' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledTimes(2)
  })

  it('while a dismiss is under way: no X, and the Dismiss button is off', () => {
    const onDismiss = show({}, { busy: true })
    expect(screen.queryByRole('button', { name: /^Dismiss:/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'See the chats' }))
    const dismiss = screen.getByRole('button', { name: 'Dismiss' }) as HTMLButtonElement
    expect(dismiss.disabled).toBe(true)
    fireEvent.click(dismiss)
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('shows a failed dismiss as an alert inside the open card, and nothing when there is none', () => {
    show({}, { error: 'Conker could not hide this card.' })
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'See the chats' }))
    expect(screen.getByRole('alert').textContent).toBe('Conker could not hide this card.')
  })

  it('shows no alert when the card opens without an error', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'See the chats' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
