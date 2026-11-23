import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Globe } from 'lucide-react'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ComposerItemContext } from '@/components/chat/composer-items'
import { ModeChip, SearchControl } from '@/components/gateway/mode-chips'
import { ComposerModeProvider } from '@/components/gateway/mode-control'
import type { AutoSettings, Research } from '@/lib/gateway/auto-settings'
import { stubResizeObserver } from './jsdom-shims.test'

beforeEach(() => stubResizeObserver())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

type Propose = React.ComponentProps<typeof ComposerModeProvider>['propose']

const options = [
  ['off', 'Off'],
  ['web', 'Web'],
  ['deep', 'Deep'],
] as const

function chip(over: Partial<ComponentProps<typeof ModeChip>> = {}) {
  const onPick = vi.fn()
  render(<ModeChip id="search" label="Search" icon={Globe} value="off" defaultValue="off" options={options} field="research" hint="Web looks things up." onPick={onPick} {...over} />)
  return onPick
}
const trigger = (name: string) => screen.getByRole('button', { name })

describe('ModeChip on its own', () => {
  it('is a quiet icon button named by its label while the value is the default', () => {
    chip()
    const button = trigger('Search')
    expect(button.getAttribute('title')).toBe('Search')
    expect(button.textContent).toBe('Search')
    expect(button.className).not.toContain('rounded-full')
  })

  it('becomes a pill with its value, and names the value, once it is set', () => {
    chip({ value: 'deep' })
    const button = trigger('Search: Deep')
    expect(button.getAttribute('title')).toBe('Search: Deep')
    expect(within(button).getAllByText('Deep').length).toBeGreaterThan(0)
    expect(button.className).toContain('rounded-full')
  })

  it('says something shorter on the bar when asked to, and keeps the full name for assistive technology', () => {
    chip({ value: 'web', shownOn: 'On the web' })
    const button = trigger('Search: Web')
    expect(within(button).getByText('On the web')).not.toBeNull()
  })

  it('falls back to the raw value when it is not one of the options', () => {
    chip({ value: 'mystery' })
    expect(trigger('Search: mystery')).not.toBeNull()
  })

  it('stays visible but off, with the reason, when it cannot be used', () => {
    chip({ value: 'deep', unavailable: 'Needs a search provider' })
    const button = trigger('Search: Needs a search provider') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('title')).toBe('Needs a search provider')
    expect(within(button).queryByText('Deep')).toBeNull()
  })

  it('can be switched off by its caller', () => {
    chip({ disabled: true })
    expect((trigger('Search') as HTMLButtonElement).disabled).toBe(true)
  })

  it('opens a radio group of its choices with the current one checked, and says what each does', () => {
    chip({ value: 'web' })
    fireEvent.click(trigger('Search: Web'))
    const group = screen.getByRole('radiogroup', { name: 'Search' })
    const checked = within(group)
      .getAllByRole('radio')
      .map(radio => [radio.textContent, radio.getAttribute('aria-checked')])
    expect(checked).toEqual([
      ['Off', 'false'],
      ['Web', 'true'],
      ['Deep', 'false'],
    ])
    expect(screen.getByText('Web looks things up.')).not.toBeNull()
  })

  it('picks another choice, and does nothing when the current one is pressed again', () => {
    const onPick = chip({ value: 'web' })
    fireEvent.click(trigger('Search: Web'))
    fireEvent.click(screen.getByRole('radio', { name: 'Web' }))
    expect(onPick).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('radio', { name: 'Deep' }))
    expect(onPick).toHaveBeenCalledWith('deep')
  })

  it('reports its value to a composer, and clears it when the value goes back to the default', () => {
    const report = vi.fn()
    const view = render(
      <ComposerItemContext.Provider value={report}>
        <ModeChip id="search" label="Search" icon={Globe} value="web" defaultValue="off" options={options} field="research" hint="h" onPick={() => undefined} />
      </ComposerItemContext.Provider>,
    )
    expect(report).toHaveBeenLastCalledWith('search', 'Search: Web')
    view.rerender(
      <ComposerItemContext.Provider value={report}>
        <ModeChip id="search" label="Search" icon={Globe} value="off" defaultValue="off" options={options} field="research" hint="h" onPick={() => undefined} />
      </ComposerItemContext.Provider>,
    )
    expect(report).toHaveBeenLastCalledWith('search', null)
  })
})

describe('SearchControl', () => {
  it('shows nothing outside a composer', () => {
    render(<SearchControl />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('SearchControl in a composer', () => {
  beforeEach(() => vi.useFakeTimers())

  const proposal = (over: Partial<AutoSettings> = {}): AutoSettings => ({ complexity: 'hard', think: false, research: 'web', modelId: 'm1', reasons: { complexity: 'long', think: 'quick', research: 'It asks about today’s news.' }, ...over })

  function inComposer({ research = 'off', text = '', propose = vi.fn<Propose>(), disabled = false }: { research?: Research; text?: string; propose?: Propose; disabled?: boolean } = {}) {
    const apply = vi.fn()
    render(
      <ComposerModeProvider text={text} think={false} research={research} thinkAvailable harnessDisabled={false} sessionId={null} disabled={disabled} modelId="" setModel={() => undefined} propose={propose} apply={apply}>
        <SearchControl />
      </ComposerModeProvider>,
    )
    return apply
  }

  it('is off until the owner or Auto turns search on', () => {
    inComposer()
    expect(trigger('Search')).not.toBeNull()
  })

  it('writes the owner’s choice into the draft and keeps the thinking setting', () => {
    const apply = inComposer()
    fireEvent.click(trigger('Search'))
    fireEvent.click(screen.getByRole('radio', { name: 'Deep' }))
    expect(apply).toHaveBeenCalledWith({ think: false, researchMode: 'deep' })
  })

  it('is greyed out while the composer is', () => {
    inComposer({ disabled: true })
    expect((trigger('Search') as HTMLButtonElement).disabled).toBe(true)
  })

  it('tags what Auto chose as auto and gives its reason in the popover', async () => {
    const propose = vi.fn<Propose>().mockResolvedValue(proposal())
    inComposer({ research: 'web', text: 'What happened in the news today?', propose })
    expect(trigger('Search: Web')).not.toBeNull()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(propose).toHaveBeenCalledTimes(1)
    fireEvent.click(trigger('Search: Web (auto)'))
    const reason = screen.getByRole('status')
    expect(reason.textContent).toBe('Auto chose this: It asks about today’s news.')
    expect(screen.queryByRole('button', { name: 'Back to Auto' })).toBeNull()
  })

  it('offers the way back to Auto once the owner has taken over', async () => {
    const propose = vi.fn<Propose>().mockResolvedValue(proposal())
    inComposer({ research: 'off', text: 'What happened in the news today?', propose })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    // Auto wanted web search, the box says off: the owner changed it, so the mode is Custom.
    fireEvent.click(trigger('Search'))
    fireEvent.click(screen.getByRole('button', { name: 'Back to Auto' }))
    expect(screen.queryByRole('status')).toBeNull()
    // Back on Auto, the same message gets a new proposal after the pause.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(propose).toHaveBeenCalledTimes(2)
  })
})
