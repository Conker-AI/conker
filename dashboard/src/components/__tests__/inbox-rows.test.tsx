import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentNoteCard } from '@/components/inbox/agent-note-card'
import { AskCard } from '@/components/inbox/ask-card'
import { ReplyBox } from '@/components/inbox/reply-box'
import type { ConkerAsk } from '@/lib/gateway/asks'
import type { GatewayAgentNote } from '@/lib/gateway/jobs'

afterEach(() => cleanup())

/** A fixed clock, in the ms the cards compare against, and the seconds the gateway stamps rows with. */
const NOW = Date.UTC(2026, 10, 23, 12, 0, 0)
const secondsAgo = (seconds: number) => (NOW - seconds * 1000) / 1000

function Where() {
  const location = useLocation()
  return <p data-testid="where">{location.pathname + location.search}</p>
}
const inRouter = (node: React.ReactNode) =>
  render(
    <MemoryRouter initialEntries={['/inbox']}>
      {node}
      <Where />
    </MemoryRouter>,
  )
const where = () => screen.getByTestId('where').textContent

describe('ReplyBox', () => {
  function show(over: Partial<React.ComponentProps<typeof ReplyBox>> = {}) {
    const props = { label: 'Your answer', placeholder: 'Goes to Conker.', value: '', busy: false, onChange: vi.fn(), onSend: vi.fn(), onCancel: vi.fn(), ...over }
    render(<ReplyBox {...props} />)
    return props
  }

  it('is a labelled text box with a placeholder and the default Send label', () => {
    show()
    const box = screen.getByRole('textbox', { name: 'Your answer' }) as HTMLTextAreaElement
    expect(box.placeholder).toBe('Goes to Conker.')
    expect(box.maxLength).toBe(2000)
    expect(screen.getByRole('button', { name: 'Send to Conker' })).not.toBeNull()
  })

  it('takes the focus when it opens, so the owner can type at once', () => {
    show()
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Your answer' }))
  })

  it('reports each edit, and shows what the caller holds', () => {
    const props = show({ value: 'Hello' })
    const box = screen.getByRole('textbox', { name: 'Your answer' }) as HTMLTextAreaElement
    expect(box.value).toBe('Hello')
    fireEvent.change(box, { target: { value: 'Hello there' } })
    expect(props.onChange).toHaveBeenCalledWith('Hello there')
  })

  it('cannot send an empty or blank reply', () => {
    show({ value: '   ' })
    expect((screen.getByRole('button', { name: 'Send to Conker' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('sends once there are words, and Cancel closes it', () => {
    const props = show({ value: 'Yes, go ahead' })
    fireEvent.click(screen.getByRole('button', { name: 'Send to Conker' }))
    expect(props.onSend).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(props.onCancel).toHaveBeenCalledTimes(1)
  })

  it('sends with Ctrl+Enter or Cmd+Enter, but not with Enter alone or with nothing written', () => {
    const props = show({ value: 'Yes' })
    const box = screen.getByRole('textbox', { name: 'Your answer' })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(props.onSend).not.toHaveBeenCalled()
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true })
    fireEvent.keyDown(box, { key: 'Enter', metaKey: true })
    expect(props.onSend).toHaveBeenCalledTimes(2)
    cleanup()
    const empty = show({ value: ' ' })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Your answer' }), { key: 'Enter', ctrlKey: true })
    expect(empty.onSend).not.toHaveBeenCalled()
  })

  it('greys every control while it is busy', () => {
    show({ value: 'Yes', busy: true })
    expect((screen.getByRole('textbox', { name: 'Your answer' }) as HTMLTextAreaElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Send to Conker' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('uses the caller’s send label and length limit', () => {
    show({ sendLabel: 'Ask for a change', maxLength: 50 })
    expect(screen.getByRole('button', { name: 'Ask for a change' })).not.toBeNull()
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).maxLength).toBe(50)
  })

  it('never submits a form it sits in: its buttons are plain buttons', () => {
    show({ value: 'Yes' })
    for (const button of screen.getAllByRole('button')) expect(button.getAttribute('type')).toBe('button')
  })
})

describe('AgentNoteCard', () => {
  const note = (over: Partial<GatewayAgentNote> = {}): GatewayAgentNote =>
    ({
      id: 'note_' + '0'.repeat(32),
      jobId: 'job_' + '0'.repeat(32),
      sessionId: 'sess 7',
      messageId: null,
      title: 'Your invoices are overdue',
      detail: 'Three invoices passed their due date.',
      createdAt: secondsAgo(5 * 60),
      ...over,
    }) as GatewayAgentNote

  it('is folded to the finding’s title, marked as from an AI job, with the one answer beside it', () => {
    inRouter(<AgentNoteCard note={note()} now={NOW} onOpen={() => undefined} />)
    const card = screen.getByRole('article', { name: 'Your invoices are overdue' })
    expect(within(card).getByText(/^AI job · \d+ (min|hr) ago$/)).not.toBeNull()
    expect(within(card).getByRole('button', { name: 'Open chat' })).not.toBeNull()
    expect(screen.queryByText('Three invoices passed their due date.')).toBeNull()
  })

  it('opens to the detail and both answers', () => {
    inRouter(<AgentNoteCard note={note()} now={NOW} onOpen={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: /^Your invoices are overdue/ }))
    expect(screen.getByText('Three invoices passed their due date.')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Open chat' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Got it' })).not.toBeNull()
  })

  it('has no detail line when the job gave none', () => {
    inRouter(<AgentNoteCard note={note({ detail: '' })} now={NOW} onOpen={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: /^Your invoices are overdue/ }))
    expect(screen.queryByText('Three invoices passed their due date.')).toBeNull()
    expect(screen.getByRole('button', { name: 'Got it' })).not.toBeNull()
  })

  it('goes to the finding’s chat, with its id escaped, and tells the caller', () => {
    const onOpen = vi.fn()
    inRouter(<AgentNoteCard note={note()} now={NOW} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open chat' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(where()).toBe('/chat?session=sess%207')
  })

  it('"Got it" clears the line without leaving the Inbox', () => {
    const onOpen = vi.fn()
    inRouter(<AgentNoteCard note={note()} now={NOW} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: /^Your invoices are overdue/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(where()).toBe('/inbox')
  })

  it('offers Later only when the caller can postpone it', () => {
    const onLater = vi.fn()
    const view = inRouter(<AgentNoteCard note={note()} now={NOW} onOpen={() => undefined} />)
    expect(screen.queryByRole('button', { name: /^Later/ })).toBeNull()
    view.unmount()
    inRouter(<AgentNoteCard note={note()} now={NOW} onOpen={() => undefined} onLater={onLater} />)
    fireEvent.click(screen.getByRole('button', { name: 'Later: Your invoices are overdue' }))
    expect(onLater).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['a few seconds', 20, 'Just now'],
    ['minutes', 59 * 60, '59 min ago'],
    ['hours', 3 * 3600 + 120, '3 hr ago'],
    ['days', 2 * 86_400 + 3600, '2 days ago'],
  ])('says how long ago it came, %s', (_label, seconds, words) => {
    inRouter(<AgentNoteCard note={note({ createdAt: secondsAgo(seconds) })} now={NOW} onOpen={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: /^Your invoices are overdue/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
    expect(screen.getByText('From').nextElementSibling!.textContent).toBe('An AI job')
    expect(screen.getByText('Came').nextElementSibling!.textContent!.startsWith(`${words} · `)).toBe(true)
  })

  it('keeps a very long title and detail inside the card', () => {
    const title = 'Review '.repeat(20).trim()
    inRouter(<AgentNoteCard note={note({ title, detail: 'word '.repeat(70).trim() })} now={NOW} onOpen={() => undefined} />)
    expect(screen.getByRole('article', { name: title })).not.toBeNull()
    expect(screen.getByRole('heading', { level: 3 }).className).toContain('line-clamp-2')
  })
})

describe('AskCard', () => {
  const ask = (over: Partial<ConkerAsk> = {}): ConkerAsk => ({
    id: 'ask_' + '0'.repeat(32),
    sessionId: 'sess_1',
    chatTitle: 'Trip planning',
    question: 'Should I book the cheaper flight?',
    options: ['Yes, book it', 'No, wait'],
    state: 'open',
    answer: null,
    chosen: null,
    createdAt: secondsAgo(2 * 3600),
    answeredAt: null,
    ...over,
  })
  function show(over: Partial<React.ComponentProps<typeof AskCard>> = {}, question: ConkerAsk = ask()) {
    const props = { ask: question, now: NOW, busy: false, error: null, onAnswer: vi.fn(), onDismiss: vi.fn(), onLater: undefined, ...over }
    inRouter(<AskCard {...props} />)
    return props
  }
  const open = () => fireEvent.click(screen.getByRole('button', { name: /^Should I book/ }))

  it('is folded to the question, who asks and in which chat, with an Answer button', () => {
    show()
    const card = screen.getByRole('article', { name: 'Should I book the cheaper flight?' })
    expect(within(card).getByText(/^Conker asks · Trip planning · /)).not.toBeNull()
    expect(within(card).getByRole('button', { name: 'Answer' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Yes, book it' })).toBeNull()
  })

  it('says "a chat" for a chat with no title, and "Untitled chat" in the record', () => {
    show({}, ask({ chatTitle: '' }))
    expect(screen.getByText(/^Conker asks · a chat · /)).not.toBeNull()
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
    expect(screen.getByText('Chat').nextElementSibling!.textContent).toBe('Untitled chat')
  })

  it('Answer opens the card with Conker’s own options and a Reply button', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Answer' }))
    expect(screen.getByRole('button', { name: 'Yes, book it' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'No, wait' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Reply' })).not.toBeNull()
  })

  it('sends a chosen option as chosen', () => {
    const props = show()
    open()
    fireEvent.click(screen.getByRole('button', { name: 'No, wait' }))
    expect(props.onAnswer).toHaveBeenCalledWith('No, wait', true)
  })

  it('opens a reply box for his own words, trims them and sends them as not chosen', () => {
    const props = show()
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }))
    expect(screen.queryByRole('button', { name: 'Yes, book it' })).toBeNull()
    fireEvent.change(screen.getByRole('textbox', { name: 'Your answer' }), { target: { value: '  Book it for Friday  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send to Conker' }))
    expect(props.onAnswer).toHaveBeenCalledWith('Book it for Friday', false)
  })

  it('Cancel goes back to the options and forgets nothing the caller kept', () => {
    show()
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Yes, book it' })).not.toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('greys the options, Reply and the dismiss while an answer is being sent', () => {
    show({ busy: true })
    open()
    for (const name of ['Yes, book it', 'No, wait', 'Reply']) expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
    expect((screen.getByRole('button', { name: 'Don’t answer' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows why an answer failed, as an alert, under the open card', () => {
    show({ error: 'That chat is closed.' })
    open()
    expect(screen.getByRole('alert').textContent).toBe('That chat is closed.')
  })

  it('has no alert when nothing failed', () => {
    show()
    open()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('keeps the record under Advanced: when it was asked, that the answer goes to the chat, and a way to the chat or to decline', () => {
    const props = show({}, ask({ sessionId: 'sess 9' }))
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
    expect(screen.getByText('Asked').nextElementSibling!.textContent!.startsWith('2 hr ago · ')).toBe(true)
    expect(screen.getByText('Your answer').nextElementSibling!.textContent).toMatch(/^Goes to that chat as if you typed it there/)
    expect(screen.getByRole('link', { name: 'Open the chat' }).getAttribute('href')).toBe('/chat?session=sess%209')
    fireEvent.click(screen.getByRole('button', { name: 'Don’t answer' }))
    expect(props.onDismiss).toHaveBeenCalledTimes(1)
    expect(props.onAnswer).not.toHaveBeenCalled()
  })

  it.each([
    ['a moment', 10, 'Just now'],
    ['hours', 5 * 3600, '5 hr ago'],
    ['days', 3 * 86_400, '3 days ago'],
  ])('says how long ago it was asked, %s', (_label, seconds, words) => {
    show({}, ask({ createdAt: secondsAgo(seconds) }))
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
    expect(screen.getByText('Asked').nextElementSibling!.textContent!.startsWith(`${words} · `)).toBe(true)
  })

  it('offers Later when the caller can postpone it', () => {
    const onLater = vi.fn()
    show({ onLater })
    fireEvent.click(screen.getByRole('button', { name: 'Later: Should I book the cheaper flight?' }))
    expect(onLater).toHaveBeenCalledTimes(1)
  })

  it('keeps a long question and four long options usable', () => {
    const question = 'Should I move the whole quarterly planning review to the following week so everyone can attend? '.repeat(4).trim()
    const options = ['Move it to next week please', 'Keep it where it is', 'Ask the team first', 'Split it in two parts']
    show({}, ask({ question, options }))
    fireEvent.click(screen.getByRole('button', { name: 'Answer' }))
    expect(screen.getByRole('article', { name: question })).not.toBeNull()
    for (const option of options) expect(screen.getByRole('button', { name: option })).not.toBeNull()
  })
})
