import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'

afterEach(() => cleanup())

describe('Badge', () => {
  it('shows its text as a plain label with the default look', () => {
    render(<Badge>Needs attention</Badge>)
    const badge = screen.getByText('Needs attention')
    expect(badge.tagName).toBe('SPAN')
    expect(badge.getAttribute('data-slot')).toBe('badge')
    expect(badge.className).toContain('bg-primary')
  })

  it.each([
    ['destructive', 'bg-destructive'],
    ['error', 'text-destructive-foreground'],
    ['info', 'text-info-foreground'],
    ['outline', 'border-input'],
    ['secondary', 'bg-secondary'],
    ['success', 'text-success-foreground'],
    ['warning', 'text-warning-foreground'],
  ] as const)('gives the %s variant its own colours', (variant, expected) => {
    render(<Badge variant={variant}>{variant}</Badge>)
    expect(screen.getByText(variant).className).toContain(expected)
  })

  it('has three sizes, with the default one when none is given', () => {
    render(
      <>
        <Badge>plain</Badge>
        <Badge size="sm">small</Badge>
        <Badge size="lg">large</Badge>
      </>,
    )
    expect(screen.getByText('plain').className).toContain('h-5.5')
    expect(screen.getByText('small').className).toContain('h-5 ')
    expect(screen.getByText('large').className).toContain('h-6.5')
  })

  it('keeps a custom class and passes attributes through', () => {
    render(
      <Badge className="shrink-0" title="Optional check">
        Optional
      </Badge>,
    )
    const badge = screen.getByText('Optional')
    expect(badge.className).toContain('shrink-0')
    expect(badge.getAttribute('title')).toBe('Optional check')
  })

  it('can render as another element, such as a link, and keep the badge look', () => {
    render(<Badge render={<a href="/system" />}>Open Server</Badge>)
    const link = screen.getByRole('link', { name: 'Open Server' })
    expect(link.getAttribute('href')).toBe('/system')
    expect(link.getAttribute('data-slot')).toBe('badge')
  })
})

describe('Alert', () => {
  it('is announced as an alert with its title and description', () => {
    render(
      <Alert variant="error">
        <AlertTitle>Couldn’t load this</AlertTitle>
        <AlertDescription>Check your connection.</AlertDescription>
      </Alert>,
    )
    const alert = screen.getByRole('alert')
    expect(alert.getAttribute('data-slot')).toBe('alert')
    expect(alert.textContent).toContain('Couldn’t load this')
    expect(screen.getByText('Check your connection.').getAttribute('data-slot')).toBe('alert-description')
    expect(screen.getByText('Couldn’t load this').getAttribute('data-slot')).toBe('alert-title')
  })

  it.each([
    ['error', 'border-destructive/32'],
    ['info', 'border-info/32'],
    ['success', 'border-success/32'],
    ['warning', 'border-warning/32'],
  ] as const)('colours the %s variant', (variant, expected) => {
    render(<Alert variant={variant}>text</Alert>)
    expect(screen.getByRole('alert').className).toContain(expected)
  })

  it('is transparent when no variant is given, and keeps a custom class', () => {
    render(<Alert className="min-w-0">plain</Alert>)
    const alert = screen.getByRole('alert')
    expect(alert.className).toContain('bg-transparent')
    expect(alert.className).toContain('min-w-0')
  })

  it('holds an action button beside the message, and takes custom classes on every part', () => {
    render(
      <Alert>
        <AlertTitle className="text-base">Offline</AlertTitle>
        <AlertDescription className="gap-1">Reconnecting.</AlertDescription>
        <AlertAction className="justify-end">
          <button type="button">Try again</button>
        </AlertAction>
      </Alert>,
    )
    const button = screen.getByRole('button', { name: 'Try again' })
    expect(button.parentElement?.getAttribute('data-slot')).toBe('alert-action')
    expect(button.parentElement?.className).toContain('justify-end')
    expect(screen.getByText('Offline').className).toContain('text-base')
    expect(screen.getByText('Reconnecting.').className).toContain('gap-1')
  })
})

describe('Empty', () => {
  it('shows a title, a description and content in their own slots', () => {
    render(
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No chats yet</EmptyTitle>
          <EmptyDescription>Start one from the Chats page.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <button type="button">New chat</button>
        </EmptyContent>
      </Empty>,
    )
    expect(screen.getByText('No chats yet').getAttribute('data-slot')).toBe('empty-title')
    expect(screen.getByText('Start one from the Chats page.').getAttribute('data-slot')).toBe('empty-description')
    expect(screen.getByRole('button', { name: 'New chat' }).parentElement?.getAttribute('data-slot')).toBe('empty-content')
    expect(screen.getByText('No chats yet').closest('[data-slot="empty"]')).not.toBeNull()
  })

  it('merges custom classes on every part', () => {
    render(
      <Empty className="max-w-md" data-testid="empty">
        <EmptyHeader className="gap-1" data-testid="header">
          <EmptyTitle className="text-lg">Nothing here</EmptyTitle>
          <EmptyDescription className="text-xs">Later.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="gap-2" data-testid="content" />
      </Empty>,
    )
    expect(screen.getByTestId('empty').className).toContain('max-w-md')
    expect(screen.getByTestId('header').className).toContain('gap-1')
    expect(screen.getByText('Nothing here').className).toContain('text-lg')
    expect(screen.getByText('Later.').className).toContain('text-xs')
    expect(screen.getByTestId('content').className).toContain('gap-2')
  })

  it('draws an icon tile with two hidden cards behind it, and nothing extra for the plain media', () => {
    const { container } = render(
      <>
        <EmptyMedia variant="icon">
          <svg data-testid="icon" />
        </EmptyMedia>
        <EmptyMedia />
      </>,
    )
    const media = container.querySelectorAll('[data-slot="empty-media"]')
    expect(media.length).toBeGreaterThanOrEqual(2)
    const icon = media[0]
    expect(icon.getAttribute('data-variant')).toBe('icon')
    expect(icon.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2)
    expect(screen.getByTestId('icon')).not.toBeNull()
    const plain = container.querySelector('[data-variant="default"]')
    expect(plain?.querySelectorAll('[aria-hidden="true"]')).toHaveLength(0)
  })
})
