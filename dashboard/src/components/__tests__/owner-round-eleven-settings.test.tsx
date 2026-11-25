import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { createStore } from 'zustand/vanilla'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Sparkles } from 'lucide-react'
import { InboxCard } from '@/components/inbox/inbox-card'
import { orderCards } from '@/components/inbox/card-order'
import { InboxAttentionProvider } from '@/components/gateway/inbox-attention'
import { ConversationViewStrip } from '@/components/gateway/conversation-views'
import { TemplateInput } from '@/components/gateway/template-composer'
import { chooseTemplate, templateText } from '@/components/gateway/template-store'
import { NewChatVoiceControl } from '@/components/gateway/new-chat-voice-control'
import type { GatewayOwnerClient } from '@/lib/gateway/owner'
import type { GatewayProposalClient } from '@/lib/gateway/proposals'
import type { AsksClient } from '@/lib/gateway/asks'
import type { GatewayRuntimeWorkspaceState } from '@/components/gateway/runtime-state'
import type { PromptTemplate } from '@/lib/chat/prompt-templates'
import { useInboxAttention, useInboxBadge } from '@/lib/workspace-chrome'
import { weekOrder } from '@/lib/week-start'
import { publishServerSettings } from '@/settings/server-setting'

const voice = vi.hoisted(() => ({ start: vi.fn() }))
vi.mock('@/lib/voice/browser-voice-input', () => ({ browserVoiceInput: { availability: () => ({ supported: true }), start: voice.start } }))

/** Settings round eleven (R-F1): each test fails if its reader ignores the value. */
let revision = 21_000
function choose(values: Record<string, unknown>) {
  revision += 1
  act(() => publishServerSettings({ revision, values }))
}

afterEach(() => {
  choose({})
  cleanup()
  voice.start.mockReset()
})

describe('inbox.details_open', () => {
  const card = () => render(<InboxCard icon={<Sparkles />} title="Send the invoice" source="Conker" summary="To Ada, 120 EUR" />)
  it('starts every card folded by default and open when he chose so, also when the choice arrives late', () => {
    card()
    expect(screen.queryByText('To Ada, 120 EUR')).toBeNull()
    choose({ 'inbox.details_open': true })
    expect(screen.getByText('To Ada, 120 EUR')).not.toBeNull()
  })

  it('keeps a card he folded himself folded', () => {
    choose({ 'inbox.details_open': true })
    card()
    fireEvent.click(screen.getByRole('button', { expanded: true }))
    expect(screen.queryByText('To Ada, 120 EUR')).toBeNull()
  })
})

describe('inbox.sort', () => {
  const cards = [
    { key: 'decision:a', at: 300, unknown: false, node: 'a' },
    { key: 'decision:b', at: 100, unknown: true, node: 'b' },
    { key: 'idea:c', at: 50, unknown: false, node: 'c' },
    { key: 'ask:d', at: 400, unknown: false, node: 'd' },
  ]
  const keys = (order: 'urgent' | 'oldest' | 'newest') => orderCards(cards, order).map(item => item.key)
  it('keeps the Inbox order for urgent first, and sorts by when it came otherwise', () => {
    expect(keys('urgent')).toEqual(['decision:b', 'decision:a', 'idea:c', 'ask:d'])
    expect(keys('oldest')).toEqual(['decision:b', 'idea:c', 'decision:a', 'ask:d'])
    expect(keys('newest')).toEqual(['decision:b', 'ask:d', 'decision:a', 'idea:c'])
  })

  it('puts a card whose outcome is unknown first in every order', () => {
    for (const order of ['urgent', 'oldest', 'newest'] as const) expect(keys(order)[0]).toBe('decision:b')
  })
})

describe('inbox.badge', () => {
  function Counts() {
    return (
      <p>
        badge {String(useInboxBadge())} · all {String(useInboxAttention())}
      </p>
    )
  }
  const owner = { listRequests: async () => ({ results: [{ status: 'pending', reviewable: true }], nextCursor: null }) } as unknown as GatewayOwnerClient
  const ideas = (rows: unknown[]) => ({ list: async () => rows }) as unknown as GatewayProposalClient
  const asks = { list: async () => [{ id: 'ask_1' }] } as unknown as AsksClient
  const state = createStore(() => ({ selected: null, operation: null })) as unknown as GatewayRuntimeWorkspaceState
  const show = () =>
    render(
      <MemoryRouter>
        <InboxAttentionProvider owner={owner} proposals={ideas([{ state: 'open' }, { state: 'open' }])} asks={asks} conversationState={state}>
          <Counts />
        </InboxAttentionProvider>
      </MemoryRouter>,
    )

  it('counts everything by default, only what waits for an answer when urgent, and nothing when off', async () => {
    show()
    await screen.findByText('badge 4 · all 4')
    choose({ 'inbox.badge': 'urgent' })
    expect(screen.getByText('badge 2 · all 4')).not.toBeNull()
    choose({ 'inbox.badge': 'off' })
    expect(screen.getByText('badge null · all 4')).not.toBeNull()
  })

  it('shows no urgent count when the decisions did not load, never a guess', async () => {
    choose({ 'inbox.badge': 'urgent' })
    const failing = { listRequests: async () => Promise.reject(new Error('offline')) } as unknown as GatewayOwnerClient
    render(
      <MemoryRouter>
        <InboxAttentionProvider owner={failing} proposals={ideas([{ state: 'open' }])} asks={asks} conversationState={state}>
          <Counts />
        </InboxAttentionProvider>
      </MemoryRouter>,
    )
    await screen.findByText('badge null · all 2')
  })
})

describe('appearance.chat_views', () => {
  it('offers only the chosen views, in their own order', () => {
    render(<ConversationViewStrip open={null} views={['logs', 'context']} onToggle={() => {}} />)
    expect(screen.getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual(['Context', 'Logs'])
  })
})

describe('prompts.required_fields', () => {
  const template: PromptTemplate = {
    id: 'tpl_1',
    name: 'Trip',
    description: '',
    fields: [
      { id: 'where', label: 'Where', type: 'shortText', required: true },
      { id: 'note', label: 'Note', type: 'shortText' },
    ],
  }
  it('holds the message back until required fields are filled, unless he turned that off', () => {
    const values = { where: '', note: 'Quiet hotel' }
    expect(templateText(template, values)).toBe('')
    expect(templateText(template, values, false)).toMatch(/Note: Quiet hotel/)
  })

  it('says what is still empty, and that he can send without it when not required', () => {
    chooseTemplate('draft:r11', template)
    const onText = vi.fn()
    render(<TemplateInput draftKey="draft:r11" onText={onText} onSubmit={() => {}} />)
    expect(screen.getByText('Fill in: Where')).not.toBeNull()
    expect(onText).toHaveBeenLastCalledWith('')
    choose({ 'prompts.required_fields': false })
    expect(screen.getByText('Still empty: Where. You can send without them.')).not.toBeNull()
    expect(onText).toHaveBeenLastCalledWith(expect.stringContaining('Trip request'))
    chooseTemplate('draft:r11', null)
  })
})

describe('you.week_start', () => {
  it('starts the day list on Sunday or Monday', () => {
    expect(weekOrder('sunday')).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(weekOrder('monday')).toEqual([1, 2, 3, 4, 5, 6, 0])
  })
})

describe('voice.input_language', () => {
  const listen = async () => {
    voice.start.mockResolvedValue({ stop: () => {}, cancel: () => {} })
    const view = render(<NewChatVoiceControl value="" onChange={() => {}} input={{ current: null }} disabled={false} />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(voice.start).toHaveBeenCalled())
    view.unmount()
    return voice.start.mock.calls.at(-1)![0].language
  }
  it('listens for English by default and for the language he chose', async () => {
    expect(await listen()).toBe('en-US')
    choose({ 'voice.input_language': 'he' })
    expect(await listen()).toBe('he-IL')
    choose({ 'voice.input_language': 'ru' })
    expect(await listen()).toBe('ru-RU')
  })
})
