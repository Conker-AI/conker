import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InboxCard } from '@/components/inbox/inbox-card'

afterEach(() => cleanup())

function show(props: Partial<ComponentProps<typeof InboxCard>> = {}) {
  return render(<InboxCard icon={<svg data-testid="mark" />} title="Back up your server" source="Conker · today" {...props} />)
}
const toggle = () => screen.getByRole('button', { name: /^Back up your server/ })

describe('InboxCard', () => {
  it('is folded to one glance: a titled article with the source line and no details', () => {
    show({ summary: 'It has been a week.' })
    const card = screen.getByRole('article', { name: 'Back up your server' })
    expect(within(card).getByRole('heading', { level: 3, name: 'Back up your server' })).not.toBeNull()
    expect(within(card).getByText('Conker · today')).not.toBeNull()
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('It has been a week.')).toBeNull()
  })

  it('hides the icon from screen readers', () => {
    show()
    expect(screen.getByTestId('mark').parentElement?.getAttribute('aria-hidden')).toBe('true')
  })

  it('opens and folds again when the title is pressed', () => {
    show({ summary: 'It has been a week.' })
    fireEvent.click(toggle())
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('It has been a week.')).not.toBeNull()
    fireEvent.click(toggle())
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('It has been a week.')).toBeNull()
  })

  it('starts open when asked to, and points the toggle at the body it controls', () => {
    show({ defaultExpanded: true, summary: 'Open from the start.' })
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    const body = screen.getByText('Open from the start.').parentElement
    expect(toggle().getAttribute('aria-controls')).toBe(body?.id)
  })

  it('shows the one answer beside the title while folded, and moves it into the open card', () => {
    show({ primary: <button type="button">Back up now</button>, actions: <button type="button">Not this week</button> })
    expect(screen.getByRole('button', { name: 'Back up now' })).not.toBeNull()
    fireEvent.click(toggle())
    expect(screen.queryByRole('button', { name: 'Back up now' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Not this week' })).not.toBeNull()
  })

  it('offers an open-label button for an answer that needs the card open', () => {
    show({ openLabel: 'Write a reply', summary: 'Needs words.' })
    fireEvent.click(screen.getByRole('button', { name: 'Write a reply' }))
    expect(screen.getByText('Needs words.')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Write a reply' })).toBeNull()
  })

  it('prefers the primary answer to the open label', () => {
    show({ primary: <button type="button">Approve nothing</button>, openLabel: 'Write a reply' })
    expect(screen.getByRole('button', { name: 'Approve nothing' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Write a reply' })).toBeNull()
  })

  it('shows the summary, then children, then actions, when open', () => {
    show({ defaultExpanded: true, summary: 'Summary line', children: <p>Child content</p>, actions: <p>Action content</p> })
    const body = screen.getByText('Summary line').parentElement!
    expect(Array.from(body.children).map(node => node.textContent)).toEqual(['Summary line', 'Child content', 'Action content'])
  })

  it('has no X when there is nothing to put off, and an X named for its card when there is', () => {
    show()
    expect(screen.queryByRole('button', { name: /^Later:/ })).toBeNull()
    cleanup()
    const onLater = vi.fn()
    show({ onLater })
    fireEvent.click(screen.getByRole('button', { name: 'Later: Back up your server' }))
    expect(onLater).toHaveBeenCalledTimes(1)
  })

  it('names the X with a custom label', () => {
    show({ onLater: vi.fn(), laterLabel: 'Dismiss' })
    expect(screen.getByRole('button', { name: 'Dismiss: Back up your server' }).getAttribute('title')).toBe('Dismiss')
  })

  it('keeps the record under an Advanced fold: facts as a list of terms, then anything extra', () => {
    show({
      defaultExpanded: true,
      facts: [
        ['From', 'Server'],
        ['When', 'Today'],
      ],
      advanced: <p>Raw record</p>,
    })
    const fold = screen.getByRole('button', { name: 'Advanced' })
    expect(fold.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('From')).toBeNull()
    fireEvent.click(fold)
    expect(fold.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('From').nextElementSibling?.textContent).toBe('Server')
    expect(screen.getByText('When').nextElementSibling?.textContent).toBe('Today')
    expect(screen.getByText('Raw record')).not.toBeNull()
    fireEvent.click(fold)
    expect(screen.queryByText('Raw record')).toBeNull()
  })

  it('shows the Advanced fold for extra content alone, with no facts list', () => {
    show({ defaultExpanded: true, advanced: <p>Only extra</p> })
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
    expect(screen.getByText('Only extra')).not.toBeNull()
    expect(screen.queryByRole('term')).toBeNull()
  })

  it('has no Advanced fold when there is no record to show', () => {
    show({ defaultExpanded: true, summary: 'Plain.' })
    expect(screen.queryByRole('button', { name: 'Advanced' })).toBeNull()
  })

  it('shows a footer, folded or open, and keeps a custom class', () => {
    show({ footer: <span>Last checked 5 min ago</span>, className: 'mt-2' })
    expect(screen.getByText('Last checked 5 min ago')).not.toBeNull()
    expect(screen.getByRole('article').className).toContain('mt-2')
  })
})
