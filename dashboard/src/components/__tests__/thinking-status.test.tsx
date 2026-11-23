import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThinkingStatus } from '@/components/gateway/thinking-status'
import type { ThinkingCancellationState } from '@/components/gateway/thinking-cancellation'
import type { RuntimeMessage, RuntimeThinking } from '@/lib/gateway/runtime'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

const row = (over: Partial<RuntimeThinking> = {}): RuntimeThinking => ({ turnId: 'turn_1', inputMessageId: null, status: 'running', model: 'sonnet', provider: 'claude', result: null, detail: null, ...over })
const idle: ThinkingCancellationState = { key: null, turnId: null, pending: null, error: null }
const message = (over: Partial<RuntimeMessage> = {}): RuntimeMessage => ({ id: 'm1', sessionId: 's1', sequence: 1, role: 'user', createdAt: '2026-11-23T00:00:00Z', agentId: null, content: { kind: 'text', text: 'Plan my week' }, ...over })

type Props = Partial<Parameters<typeof ThinkingStatus>[0]>
function show(props: Props = {}) {
  const handlers = { onCancel: vi.fn().mockResolvedValue(undefined), onRefresh: vi.fn().mockResolvedValue(undefined), onDiscuss: vi.fn() }
  const all = { rows: [row()], disabled: false, cancellation: idle, ...handlers, ...props }
  const view = render(<ThinkingStatus {...all} />)
  return { ...handlers, rerender: (next: Props) => view.rerender(<ThinkingStatus {...all} {...next} />) }
}
const region = () => screen.getByRole('region', { name: 'Background thinking' })

describe('ThinkingStatus', () => {
  it('shows nothing when there is no background thinking', () => {
    const { container } = render(<ThinkingStatus rows={[]} disabled={false} cancellation={idle} onCancel={vi.fn()} onRefresh={vi.fn()} onDiscuss={vi.fn()} />)
    expect(container.textContent).toBe('')
  })

  it.each([
    ['queued', 'Thinking is queued'],
    ['running', 'Thinking in the background'],
    ['completed', 'Background findings are ready'],
    ['canceled', 'Background work canceled'],
    ['superseded', 'A newer Think request replaced this work'],
    ['failed', 'Background model did not finish'],
    ['interrupted', 'Background work was interrupted when Conker stopped'],
    ['skipped', 'Background capacity is busy'],
  ] as const)('says %s in plain words, as a status', (status, words) => {
    show({ rows: [row({ status })] })
    expect(within(region()).getByRole('status').textContent).toBe(words)
  })

  it('names the model and says the owner can keep talking while it works', () => {
    show()
    expect(region().textContent).toContain('claude / sonnet · You can keep talking. Answers get priority on shared local capacity.')
  })

  it('leaves the model out when there is none, and warns that findings may need checking once finished', () => {
    show({ rows: [row({ status: 'completed', model: null, provider: null })] })
    expect(region().textContent).toContain('Findings are a separate model’s analysis and may need verification.')
    expect(region().textContent).not.toContain(' / ')
  })

  it('says that further results are discarded after a cancel', () => {
    show({ rows: [row({ status: 'canceled' })] })
    expect(screen.getByText('Further results are discarded. Work already performed may count toward usage.')).not.toBeNull()
  })

  it('shows the message the thinking was for', () => {
    show({ rows: [row({ inputMessageId: 'm1' })], messages: [message()] })
    expect(screen.getByText('For your message: Plan my week')).not.toBeNull()
  })

  it('says "earlier message" when the owner has written since', () => {
    show({ rows: [row({ inputMessageId: 'm1' })], messages: [message(), message({ id: 'm2', sequence: 2, content: { kind: 'text', text: 'Never mind' } })] })
    expect(screen.getByText('For your earlier message: Plan my week')).not.toBeNull()
  })

  it('shows only the first 180 characters of that message', () => {
    show({ rows: [row({ inputMessageId: 'm1' })], messages: [message({ content: { kind: 'text', text: 'x'.repeat(300) } })] })
    expect(screen.getByText(`For your message: ${'x'.repeat(180)}`)).not.toBeNull()
  })

  it('says nothing about the message when it is gone or not readable', () => {
    show({ rows: [row({ inputMessageId: 'missing' })], messages: [message()] })
    expect(screen.queryByText(/For your/)).toBeNull()
    cleanup()
    show({ rows: [row({ inputMessageId: 'm1' })], messages: [message({ content: { kind: 'unavailable', reason: 'forgotten' } })] })
    expect(screen.queryByText(/For your/)).toBeNull()
  })

  describe('cancelling', () => {
    it('offers Cancel thinking while it works, and cancels that turn', () => {
      const { onCancel } = show({ rows: [row({ turnId: 'turn_7' })] })
      fireEvent.click(screen.getByRole('button', { name: 'Cancel thinking' }))
      expect(onCancel).toHaveBeenCalledWith('turn_7')
    })

    it('offers it while queued too, and not once the work has ended', () => {
      show({ rows: [row({ status: 'queued' })] })
      expect(screen.getByRole('button', { name: 'Cancel thinking' })).not.toBeNull()
      cleanup()
      show({ rows: [row({ status: 'completed' })] })
      expect(screen.queryByRole('button', { name: 'Cancel thinking' })).toBeNull()
    })

    it('turns the button off when the page is off or a cancel is under way', () => {
      show({ disabled: true })
      expect((screen.getByRole('button', { name: 'Cancel thinking' }) as HTMLButtonElement).disabled).toBe(true)
      cleanup()
      show({ cancellation: { key: 'k', turnId: 'turn_1', pending: 'cancel', error: null } })
      expect((screen.getByRole('button', { name: 'Canceling thinking…' }) as HTMLButtonElement).disabled).toBe(true)
    })

    it('ignores a cancellation that belongs to another turn', () => {
      show({ cancellation: { key: 'k', turnId: 'turn_other', pending: 'cancel', error: 'uncertain' } })
      expect((screen.getByRole('button', { name: 'Cancel thinking' }) as HTMLButtonElement).disabled).toBe(false)
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('says plainly when a cancel was not confirmed, and offers a read-only check instead of Cancel', () => {
      const { onRefresh } = show({ cancellation: { key: 'k', turnId: 'turn_1', pending: null, error: 'uncertain' } })
      expect(screen.getByRole('alert').textContent).toBe('Cancellation was not confirmed. Work may still be running.')
      expect(screen.queryByRole('button', { name: 'Cancel thinking' })).toBeNull()
      expect(screen.getByText('Checking only reads the latest status. You can keep talking.')).not.toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Check thinking status' }))
      expect(onRefresh).toHaveBeenCalledWith('turn_1')
    })

    it('says plainly when the status itself could not be confirmed', () => {
      show({ cancellation: { key: 'k', turnId: 'turn_1', pending: null, error: 'refresh' } })
      expect(screen.getByRole('alert').textContent).toBe('Thinking status could not be confirmed. Work may still be running.')
    })

    it('turns the check off while it reads, or while the page is off', () => {
      show({ cancellation: { key: 'k', turnId: 'turn_1', pending: 'refresh', error: 'refresh' } })
      expect((screen.getByRole('button', { name: 'Checking thinking status…' }) as HTMLButtonElement).disabled).toBe(true)
      cleanup()
      show({ disabled: true, cancellation: { key: 'k', turnId: 'turn_1', pending: null, error: 'refresh' } })
      expect((screen.getByRole('button', { name: 'Check thinking status' }) as HTMLButtonElement).disabled).toBe(true)
    })

    it('shows no uncertainty once the work has ended', () => {
      show({ rows: [row({ status: 'completed' })], cancellation: { key: 'k', turnId: 'turn_1', pending: null, error: 'uncertain' } })
      expect(screen.queryByRole('alert')).toBeNull()
      expect(screen.queryByRole('button', { name: 'Check thinking status' })).toBeNull()
    })
  })

  describe('findings', () => {
    it('hides the findings under "Read findings" and hands them to the chat on request', () => {
      const { onDiscuss } = show({ rows: [row({ status: 'completed', result: 'Do the taxes first.' })] })
      expect(screen.getByText('Read findings').closest('details')?.hasAttribute('open')).toBe(false)
      expect(screen.getByText('Do the taxes first.')).not.toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Discuss these findings' }))
      expect(onDiscuss).toHaveBeenCalledWith('Do the taxes first.')
    })

    it('turns Discuss off while the page is off', () => {
      show({ disabled: true, rows: [row({ status: 'completed', result: 'Findings' })] })
      expect((screen.getByRole('button', { name: 'Discuss these findings' }) as HTMLButtonElement).disabled).toBe(true)
    })

    it('has no findings section when there is no result', () => {
      show({ rows: [row({ status: 'completed' })] })
      expect(screen.queryByText('Read findings')).toBeNull()
    })

    it('lists earlier findings with their model, skipping earlier rows that have none', () => {
      const { onDiscuss } = show({
        rows: [row({ status: 'completed', result: 'Newest' }), row({ turnId: 'turn_0', status: 'completed', model: 'opus', result: 'Older', inputMessageId: 'm1' }), row({ turnId: 'turn_x', status: 'failed', model: 'haiku' })],
        messages: [message()],
      })
      expect(screen.getByText('Earlier findings · opus')).not.toBeNull()
      expect(screen.queryByText('Earlier findings · haiku')).toBeNull()
      expect(screen.getByText('For your message: Plan my week')).not.toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Discuss earlier findings' }))
      expect(onDiscuss).toHaveBeenCalledWith('Older')
    })

    it('turns Discuss earlier findings off while the page is off', () => {
      show({ disabled: true, rows: [row({ status: 'completed' }), row({ turnId: 'turn_0', status: 'completed', result: 'Older' })] })
      expect((screen.getByRole('button', { name: 'Discuss earlier findings' }) as HTMLButtonElement).disabled).toBe(true)
    })
  })

  describe('keyboard focus', () => {
    it('moves focus to the status when the focused Cancel button goes away', () => {
      const view = show()
      const button = screen.getByRole('button', { name: 'Cancel thinking' })
      button.focus()
      fireEvent.click(button)
      view.rerender({ rows: [row({ status: 'canceled' })] })
      expect(document.activeElement).toBe(within(region()).getByRole('status'))
    })

    it('does not take focus from an open dialog', () => {
      const dialog = document.createElement('div')
      dialog.setAttribute('role', 'dialog')
      dialog.setAttribute('data-open', '')
      document.body.append(dialog)
      const view = show()
      const button = screen.getByRole('button', { name: 'Cancel thinking' })
      button.focus()
      fireEvent.click(button)
      view.rerender({ rows: [row({ status: 'canceled' })] })
      expect(document.activeElement).toBe(document.body)
    })

    it('leaves focus alone when the button is still there, or the click did not focus it', () => {
      const view = show()
      const button = screen.getByRole('button', { name: 'Cancel thinking' })
      button.focus()
      fireEvent.click(button)
      view.rerender({ cancellation: { key: 'k', turnId: 'turn_1', pending: 'cancel', error: null } })
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Canceling thinking…' }))
      cleanup()
      const plain = show()
      fireEvent.click(screen.getByRole('button', { name: 'Cancel thinking' }))
      plain.rerender({ rows: [row({ status: 'canceled' })] })
      expect(document.activeElement).toBe(document.body)
    })

    it('forgets the remembered button when another turn took over, so focus is not pulled to the new status', () => {
      const view = show()
      const button = screen.getByRole('button', { name: 'Cancel thinking' })
      button.focus()
      fireEvent.click(button)
      view.rerender({ rows: [row({ turnId: 'turn_2', status: 'running' })] })
      view.rerender({ rows: [row({ turnId: 'turn_2', status: 'canceled' })] })
      expect(document.activeElement).toBe(document.body)
    })
  })
})
