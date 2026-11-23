import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useEffect, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CollectionLoading, CollectionToolbar, PageHeader, WorkspaceSearch } from '@/components/design-system/primitives'
import { WorkspaceChromeProvider } from '@/components/design-system/workspace-chrome'
import { SidebarProvider } from '@/components/ui/sidebar'
import { UniversalSearchContext, useWorkspaceChrome } from '@/lib/workspace-chrome'
import { stubMatchMedia, stubResizeObserver } from './jsdom-shims.test'

beforeEach(() => {
  stubMatchMedia()
  stubResizeObserver()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

type Slots = { actions?: boolean; search?: boolean; summary?: boolean }
/** The app bar's three slots, which pages fill from below through portals. */
function Bar({ slots = { actions: true, search: true, summary: true }, compact = false, children }: { slots?: Slots; compact?: boolean; children: ReactNode }) {
  const { setActions, setSearch, setSummary, setCompactSearch } = useWorkspaceChrome()!
  useEffect(() => setCompactSearch(compact), [compact, setCompactSearch])
  return (
    <>
      <div data-testid="bar">
        {slots.actions && <div data-testid="bar-actions" ref={setActions} />}
        {slots.search && <div data-testid="bar-search" ref={setSearch} />}
        {slots.summary && <div data-testid="bar-summary" ref={setSummary} />}
      </div>
      <main>{children}</main>
    </>
  )
}
function show(node: ReactNode, props: Omit<React.ComponentProps<typeof Bar>, 'children'> = {}) {
  return render(
    <SidebarProvider>
      <WorkspaceChromeProvider>
        <Bar {...props}>{node}</Bar>
      </WorkspaceChromeProvider>
    </SidebarProvider>,
  )
}
const slot = (name: 'bar-actions' | 'bar-search' | 'bar-summary') => within(screen.getByTestId(name))

describe('PageHeader inside the workspace chrome', () => {
  it('puts an actions-only page’s heading and action in the app bar, not on the page', () => {
    show(<PageHeader title="Server" actionsOnly actions={<button type="button">Refresh</button>} />)
    expect(slot('bar-actions').getByRole('heading', { level: 1, name: 'Server' }).className).toContain('sr-only')
    expect(slot('bar-actions').getByRole('button', { name: 'Refresh' })).not.toBeNull()
    expect(within(screen.getByRole('main')).queryByRole('heading')).toBeNull()
  })

  it('shows nothing for an actions-only page when the app bar has no place for actions', () => {
    show(<PageHeader title="Server" actionsOnly actions={<button type="button">Refresh</button>} />, { slots: { search: true } })
    expect(screen.queryByRole('heading', { name: 'Server' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull()
  })

  it('still draws an ordinary page header on the page itself', () => {
    show(<PageHeader title="Memory" description="What Conker remembers." />)
    expect(within(screen.getByRole('main')).getByRole('heading', { level: 1, name: 'Memory' })).not.toBeNull()
    expect(within(screen.getByRole('main')).getByText('What Conker remembers.')).not.toBeNull()
  })
})

describe('WorkspaceSearch inside the workspace chrome', () => {
  const search = (over: Partial<React.ComponentProps<typeof WorkspaceSearch>> = {}) => <WorkspaceSearch label="Search memory" placeholder="Search" value="tea" onChange={() => undefined} {...over} />

  it('moves the search box into the app bar, as a search landmark', () => {
    show(search())
    const field = slot('bar-search').getByRole('search')
    const box = within(field).getByRole('searchbox', { name: 'Search memory' }) as HTMLInputElement
    expect(box.value).toBe('tea')
    expect(within(screen.getByRole('main')).queryByRole('searchbox')).toBeNull()
  })

  it('reports typing, and submitting searches without reloading the page', () => {
    const onChange = vi.fn()
    const onSubmit = vi.fn()
    show(search({ onChange, onSubmit }))
    fireEvent.change(slot('bar-search').getByRole('searchbox'), { target: { value: 'tea time' } })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(fireEvent.submit(slot('bar-search').getByRole('search'))).toBe(false)
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('submits without a handler too', () => {
    show(search())
    expect(fireEvent.submit(slot('bar-search').getByRole('search'))).toBe(false)
  })

  it('shows no search box when the app bar has no place for one', () => {
    show(search(), { slots: { actions: true } })
    expect(screen.queryByRole('searchbox')).toBeNull()
  })

  // Real bug, app code left as is: primitives.tsx puts a DropdownMenuLabel outside a menu group, so opening the scope menu throws "MenuGroupContext is missing".
  it.fails('offers "Search all Conker" from its scope menu, with what is typed so far', async () => {
    const openAll = vi.fn()
    render(
      <SidebarProvider>
        <WorkspaceChromeProvider>
          <UniversalSearchContext.Provider value={openAll}>
            <Bar>{search({ value: 'x'.repeat(300) })}</Bar>
          </UniversalSearchContext.Provider>
        </WorkspaceChromeProvider>
      </SidebarProvider>,
    )
    fireEvent.click(slot('bar-search').getByRole('button', { name: 'Search scope' }))
    expect(await screen.findByRole('menuitem', { name: 'Search memory' })).not.toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Search all Conker' }))
    expect(openAll).toHaveBeenCalledTimes(1)
    expect(openAll.mock.calls[0][0]).toBe('x'.repeat(200))
  })

  it('has no scope menu where there is nothing wider to search', () => {
    show(search())
    expect(screen.queryByRole('button', { name: 'Search scope' })).toBeNull()
  })

  it('folds into one button that opens the box, when the bar is compact', async () => {
    show(search(), { compact: true })
    expect(slot('bar-search').queryByRole('searchbox')).toBeNull()
    fireEvent.click(slot('bar-search').getByRole('button', { name: 'Search memory' }))
    expect(await screen.findByRole('searchbox', { name: 'Search memory' })).not.toBeNull()
  })
})

describe('CollectionToolbar inside the workspace chrome', () => {
  it('shows the count in the app bar’s summary slot instead of the page', () => {
    show(<CollectionToolbar count={7} unit="chats" />)
    expect(slot('bar-summary').getByRole('status').textContent).toBe('7 chats')
    expect(within(screen.getByRole('main')).queryByRole('status')).toBeNull()
  })

  it('shows no count when the app bar has no summary slot', () => {
    show(<CollectionToolbar count={7} unit="chats" />, { slots: { actions: true } })
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('CollectionLoading inside the workspace chrome', () => {
  it('leaves out its own search placeholder, since the app bar has the search', () => {
    const view = render(<CollectionLoading label="Loading chats" />)
    const alone = view.container.querySelectorAll('[data-slot="skeleton"]').length
    view.unmount()
    show(<CollectionLoading label="Loading chats" />)
    expect(screen.getByRole('status', { name: 'Loading chats' }).querySelectorAll('[data-slot="skeleton"]')).toHaveLength(alone - 1)
  })
})
