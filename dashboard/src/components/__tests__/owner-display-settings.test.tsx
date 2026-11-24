import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConversationHistory } from '@/components/chat/history'
import { ChatMessageRecord, ChatTranscript } from '@/components/chat/transcript'
import { ComposerModeProvider, ModePresetControl } from '@/components/gateway/mode-control'
import { ThinkingStatus } from '@/components/gateway/thinking-status'
import type { Action, ChatContract, ChatMessage, MessageAction } from '@/lib/chat/contract'
import type { AutoSettings } from '@/lib/gateway/auto-settings'
import type { GatewayControlClient } from '@/lib/gateway/control'
import type { RuntimeThinking } from '@/lib/gateway/runtime'
import { useAppearanceSync } from '@/settings/appearance'
import { publishServerSettings } from '@/settings/server-setting'
import { stubMatchMedia } from './jsdom-shims.test'

/** The owner's display settings the dashboard reads (R-F1 round four): each test fails if its reader ignores the value. */
let revision = 1000
function choose(values: Record<string, unknown>) {
  revision += 1
  act(() => publishServerSettings({ revision, values }))
}

/** A ResizeObserver the test can fire by hand, the way content growing fires a real one. */
const observers: (() => void)[] = []
class HandResizeObserver {
  constructor(callback: () => void) {
    observers.push(callback)
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(async () => {
  await import('@/components/rich-answer')
}, 120_000)
beforeEach(() => {
  stubMatchMedia()
  vi.stubGlobal('ResizeObserver', HandResizeObserver)
  document.documentElement.dataset.motion = 'off'
})
afterEach(() => {
  choose({})
  cleanup()
  observers.length = 0
  vi.unstubAllGlobals()
  vi.useRealTimers()
  delete document.documentElement.dataset.motion
})

const unsupported: Action = { availability: 'unsupported', reason: '' }
const actions = Object.fromEntries(['copy', 'link', 'edit', 'retry', 'fork', 'pin', 'rateUp', 'rateDown', 'redact', 'saveArtifact'].map(kind => [kind, unsupported])) as Record<MessageAction, Action>
const answer: ChatMessage = { id: 'm1', sessionId: 's1', sequence: 2, role: 'assistant', createdAt: '2026-11-24T09:30:00.000Z', content: { kind: 'text', text: 'A **bold** answer' }, agentId: 'companion', agentName: 'Conker', actions }
const record = () =>
  render(
    <MemoryRouter>
      <ChatMessageRecord message={answer} />
    </MemoryRouter>,
  )
const chat = (over: Partial<ChatContract> = {}): ChatContract => ({
  source: 'gateway',
  sessionId: 's1',
  messages: [],
  activeAgentName: 'Conker',
  history: 'ready',
  notice: null,
  error: null,
  draft: '',
  setDraft: unsupported,
  send: unsupported,
  checkHistory: unsupported,
  generation: null,
  submission: { kind: 'idle' },
  ...over,
})
const transcript = (value: ChatContract) =>
  render(
    <MemoryRouter>
      <ChatTranscript chat={value} />
    </MemoryRouter>,
  )

describe('appearance.portraits and appearance.rich_text', () => {
  it('shows the portrait and formatted text by default, and neither once he turns them off', async () => {
    const view = record()
    expect(view.container.querySelector('img')).not.toBeNull()
    expect((await screen.findByText('bold', {}, { timeout: 15_000 })).tagName).toBe('STRONG')
    cleanup()
    choose({ 'appearance.portraits': false, 'appearance.rich_text': false })
    const plain = record()
    expect(plain.container.querySelector('img')).toBeNull()
    expect(screen.getByText('A **bold** answer').tagName).toBe('P')
  })
})

describe('appearance.streaming', () => {
  const writing = chat({ generation: { id: 'g1', sessionId: 's1', phase: 'streaming', previewText: 'The answer so far', resetVersion: 0, stop: unsupported } })

  it('shows the answer as it is written, or only once it is saved', async () => {
    transcript(writing)
    expect(await screen.findByText('The answer so far', {}, { timeout: 15_000 })).not.toBeNull()
    cleanup()
    choose({ 'appearance.streaming': 'whole' })
    transcript(writing)
    expect(screen.getByRole('status').textContent).toBe('Conker is writing…')
    expect(screen.queryByText('The answer so far')).toBeNull()
  })
})

describe('appearance.chat_text_size', () => {
  it('scales the messages only when he picks a size', () => {
    const view = transcript(chat())
    const messages = () => view.container.querySelector<HTMLElement>('[data-source]')!
    expect(messages().style.getPropertyValue('zoom')).toBe('')
    choose({ 'appearance.chat_text_size': '125' })
    expect(messages().style.getPropertyValue('zoom')).toBe('1.25')
  })
})

describe('appearance.chat_width and accessibility.large_targets', () => {
  function Shell() {
    useAppearanceSync({ settings: { read: () => new Promise(() => undefined) } } as unknown as GatewayControlClient)
    return null
  }

  it('leave the page as it is by default and mark it once he changes them', () => {
    render(<Shell />)
    const root = document.documentElement
    expect(root.dataset.chatWidth).toBeUndefined()
    expect(root.dataset.targets).toBeUndefined()
    choose({ 'appearance.chat_width': 'wide', 'accessibility.large_targets': true })
    expect(root.dataset.chatWidth).toBe('wide')
    expect(root.dataset.targets).toBe('large')
    choose({})
    expect(root.dataset.chatWidth).toBeUndefined()
  })
})

describe('chats.autoscroll', () => {
  const at = (writing: boolean) => (
    <MemoryRouter>
      <ConversationHistory sessionId="s1" writing={writing}>
        <p>Messages</p>
      </ConversationHistory>
    </MemoryRouter>
  )
  /** The history's scroll box with a height the test controls; returns a way to grow the content. */
  function history(writing: boolean) {
    const view = render(at(writing))
    const box = screen.getByLabelText('Saved conversation history')
    let height = 1000,
      top = 0
    Object.defineProperty(box, 'clientHeight', { configurable: true, get: () => 200 })
    Object.defineProperty(box, 'scrollHeight', { configurable: true, get: () => height })
    Object.defineProperty(box, 'scrollTop', {
      configurable: true,
      get: () => top,
      set: value => {
        top = value
      },
    })
    const grow = (to: number) => {
      height = to
      act(() => observers.forEach(fire => fire()))
    }
    return { view, grow, top: () => top }
  }

  it('follows a growing answer by default', () => {
    const { view, grow, top } = history(false)
    grow(1000)
    expect(top()).toBe(1000)
    view.rerender(at(true))
    grow(1500)
    expect(top()).toBe(1500)
  })

  it('holds still while an answer is written when he turns it off, and offers Latest', () => {
    choose({ 'chats.autoscroll': false })
    const { view, grow, top } = history(false)
    grow(1000)
    expect(top()).toBe(1000)
    view.rerender(at(true))
    grow(1500)
    expect(top()).toBe(1000)
    expect(screen.getByRole('button', { name: 'Jump to latest message' })).not.toBeNull()
  })
})

describe('chats.thinking', () => {
  const done: RuntimeThinking = { turnId: 't1', inputMessageId: null, status: 'completed', model: 'sonnet', provider: 'claude', result: 'Three options.', detail: null }
  const show = (row: RuntimeThinking) => render(<ThinkingStatus rows={[row]} disabled={false} cancellation={{ key: null, turnId: null, pending: null, error: null }} onCancel={vi.fn()} onRefresh={vi.fn()} onDiscuss={vi.fn()} />)

  it('folds findings by default, opens them or leaves finished work out, and never hides work still running', () => {
    expect(show(done).container.querySelector('details')?.open).toBe(false)
    cleanup()
    choose({ 'chats.thinking': 'expanded' })
    expect(show(done).container.querySelector('details')?.open).toBe(true)
    cleanup()
    choose({ 'chats.thinking': 'hidden' })
    expect(show(done).container.textContent).toBe('')
    cleanup()
    show({ ...done, status: 'running', result: null })
    expect(screen.getByRole('button', { name: 'Cancel thinking' })).not.toBeNull()
  })
})

describe('models.auto_reasons', () => {
  const proposal: AutoSettings = { complexity: 'hard', think: false, research: 'web', modelId: 'm1', reasons: { complexity: 'long', think: 'A quick one.', research: 'It asks about today’s news.' } }
  async function openMode() {
    vi.useFakeTimers()
    render(
      <ComposerModeProvider
        text="What happened today?"
        think={false}
        research="web"
        thinkAvailable
        harnessDisabled={false}
        sessionId={null}
        disabled={false}
        modelId=""
        setModel={() => undefined}
        propose={vi.fn().mockResolvedValue(proposal)}
        apply={vi.fn()}
      >
        <ModePresetControl />
      </ComposerModeProvider>,
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    fireEvent.click(screen.getByRole('button', { name: /^Mode: Auto/ }))
  }

  it('says why Auto chose each setting, unless he turns the reasons off', async () => {
    await openMode()
    expect(screen.getByText('It asks about today’s news.')).not.toBeNull()
    cleanup()
    choose({ 'models.auto_reasons': false })
    await openMode()
    expect(screen.queryByText('It asks about today’s news.')).toBeNull()
    expect(screen.getByText('Decided for you from your message. Change any setting to take over.')).not.toBeNull()
  })
})
