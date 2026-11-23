import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Brain } from 'lucide-react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CollectionEmpty,
  CollectionLoading,
  CollectionPanel,
  CollectionRow,
  CollectionSearch,
  CollectionSection,
  CollectionToolbar,
  OverviewSection,
  PageHeader,
  PageTitle,
  RecordItem,
  WorkspaceSection,
} from '@/components/design-system/primitives'

afterEach(() => cleanup())

const inRouter = (node: ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>)

describe('PageHeader', () => {
  it('has the one level 1 heading, with its description and status beside it', () => {
    render(<PageHeader title="Memory" description="What Conker remembers." status={<span>Live</span>} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Memory' })).not.toBeNull()
    expect(screen.getByText('What Conker remembers.')).not.toBeNull()
    expect(screen.getByText('Live')).not.toBeNull()
  })

  it('shows its actions, and only a heading when there are none', () => {
    const view = render(<PageHeader title="Jobs" actions={<button type="button">New job</button>} />)
    expect(screen.getByRole('button', { name: 'New job' })).not.toBeNull()
    view.unmount()
    render(<PageHeader title="Jobs" />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('keeps a long title in one heading that can wrap', () => {
    const title = 'A project name that is far too long to fit on a single line of a phone screen'
    render(<PageHeader title={title} density="compact" />)
    expect(screen.getByRole('heading', { level: 1, name: title }).className).toContain('break-words')
  })

  it('can hide the heading from sight yet keep it for screen readers, with the actions as a named toolbar', () => {
    render(<PageHeader title="Server" actionsOnly actions={<button type="button">Refresh</button>} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Server' }).className).toContain('sr-only')
    expect(within(screen.getByRole('toolbar', { name: 'Server actions' })).getByRole('button', { name: 'Refresh' })).not.toBeNull()
  })

  it('has no toolbar when an actions-only header has no actions', () => {
    render(<PageHeader title="Server" actionsOnly />)
    expect(screen.queryByRole('toolbar')).toBeNull()
  })
})

describe('PageTitle', () => {
  it('is a plain level 1 heading that takes the caller’s class', () => {
    render(<PageTitle className="sr-only">Chat with Conker</PageTitle>)
    expect(screen.getByRole('heading', { level: 1, name: 'Chat with Conker' }).className).toBe('sr-only')
  })
})

describe('WorkspaceSection and OverviewSection', () => {
  it('labels a section by its heading, with its description, action and content', () => {
    render(
      <WorkspaceSection title="Providers" description="Where answers come from." action={<button type="button">Add</button>}>
        <p>Body</p>
      </WorkspaceSection>,
    )
    const section = screen.getByRole('region', { name: 'Providers' })
    expect(within(section).getByRole('heading', { level: 2, name: 'Providers' })).not.toBeNull()
    for (const text of ['Where answers come from.', 'Body']) expect(within(section).getByText(text)).not.toBeNull()
    expect(within(section).getByRole('button', { name: 'Add' })).not.toBeNull()
  })

  it('can be only a heading, and drops its divider when asked', () => {
    render(<WorkspaceSection title="Quiet" divided={false} />)
    const section = screen.getByRole('region', { name: 'Quiet' })
    expect(section.className).not.toContain('border-b')
    expect(section.querySelector('p')).toBeNull()
  })

  it('gives an overview section its heading and action, and lifts it when it leads', () => {
    render(
      <>
        <OverviewSection title="Needs you" description="Two things are waiting." action={<button type="button">Open Inbox</button>} priority>
          <p>First</p>
        </OverviewSection>
        <OverviewSection title="Later">
          <p>Second</p>
        </OverviewSection>
      </>,
    )
    const lead = screen.getByRole('region', { name: 'Needs you' })
    expect(within(lead).getByText('Two things are waiting.')).not.toBeNull()
    expect(within(lead).getByRole('button', { name: 'Open Inbox' })).not.toBeNull()
    expect(lead.className).toContain('border')
    expect(screen.getByRole('region', { name: 'Later' }).className).not.toContain('border')
  })
})

describe('CollectionEmpty', () => {
  it('says what is missing and what to do, with a search-miss mark by default', () => {
    render(<CollectionEmpty title="No memories" description="Saved memories will appear here." />)
    expect(screen.getByRole('heading', { level: 2, name: 'No memories' })).not.toBeNull()
    expect(screen.getByText('Saved memories will appear here.')).not.toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('uses the caller’s mark, hidden from screen readers', () => {
    render(<CollectionEmpty title="No memories" description="d" icon={<Brain data-testid="mark" />} />)
    expect(screen.getByTestId('mark').parentElement?.getAttribute('aria-hidden')).toBe('true')
  })

  it('clears a search with a button that has its own label', () => {
    const onClear = vi.fn()
    render(<CollectionEmpty title="Nothing found" description="d" onClear={onClear} clearLabel="Show everything" action={<button type="button">Ignored</button>} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show everything' }))
    expect(onClear).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Ignored' })).toBeNull()
  })

  it('shows its action when there is nothing to clear', () => {
    render(<CollectionEmpty title="No jobs" description="d" action={<button type="button">New job</button>} />)
    expect(screen.getByRole('button', { name: 'New job' })).not.toBeNull()
  })
})

describe('CollectionLoading', () => {
  it('is a labelled status with a search placeholder and three placeholder rows', () => {
    render(<CollectionLoading label="Loading memories" />)
    const status = screen.getByRole('status', { name: 'Loading memories' })
    expect(within(status).getByText('Loading memories').className).toContain('sr-only')
    expect(status.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(3)
  })
})

describe('CollectionRow', () => {
  it('is one link with a heading, a description and a trailing note', () => {
    inRouter(<CollectionRow to="/memory/1" title="Prefers short answers" description="From a chat · 3 days ago" trailing={<span>3 uses</span>} leading={<Brain data-testid="lead" />} />)
    const link = screen.getByRole('link', { name: /Prefers short answers/ })
    expect(link.getAttribute('href')).toBe('/memory/1')
    expect(within(link).getByRole('heading', { level: 3, name: 'Prefers short answers' }).getAttribute('title')).toBe('Prefers short answers')
    expect(within(link).getByText('From a chat · 3 days ago')).not.toBeNull()
    expect(within(link).getByText('3 uses')).not.toBeNull()
    expect(screen.getByTestId('lead').parentElement?.getAttribute('aria-hidden')).toBe('true')
  })

  it('gives the description a hover title when one is supplied, and shows details under it', () => {
    inRouter(<CollectionRow to="/x" title="Row" description="short" descriptionTitle="The whole description" expanded={false} details={<p>More</p>} />)
    expect(screen.getByText('short').getAttribute('title')).toBe('The whole description')
    expect(screen.getByRole('link').getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByText('More')).not.toBeNull()
  })
})

describe('CollectionSection', () => {
  it('is a labelled section whose list is the children', () => {
    render(
      <CollectionSection title="Services" icon={<Brain data-testid="mark" />}>
        <li>One</li>
        <li>Two</li>
      </CollectionSection>,
    )
    const section = screen.getByRole('region', { name: 'Services' })
    expect(within(within(section).getByRole('list')).getAllByRole('listitem')).toHaveLength(2)
  })

  it('uses a list the caller passes instead of wrapping another around it', () => {
    render(
      <CollectionSection title="Checks">
        <ul className="mine">
          <li>One</li>
        </ul>
      </CollectionSection>,
    )
    const lists = screen.getAllByRole('list')
    expect(lists).toHaveLength(1)
    expect(lists[0].className).toContain('mine')
    expect(lists[0].className).toContain('collection-surface')
  })

  it('leaves off the surface when contained', () => {
    render(
      <CollectionSection title="Inside a card" contained>
        <li>One</li>
      </CollectionSection>,
    )
    expect(screen.getByRole('list').className).not.toContain('collection-surface')
  })
})

describe('RecordItem', () => {
  it('shows a plain record with a title, description, meta and actions', () => {
    render(<RecordItem title="Weekly report" lang="en" description="Sent on Fridays" meta={<span>Owner</span>} actions={<button type="button">Edit</button>} leading={<Brain data-testid="mark" />} />)
    expect(screen.getByText('Weekly report').getAttribute('lang')).toBe('en')
    for (const text of ['Sent on Fridays', 'Owner']) expect(screen.getByText(text)).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Edit' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: /Weekly report/ })).toBeNull()
  })

  it('becomes a button when it can be opened, and says when it is the selected one', () => {
    const onOpen = vi.fn()
    const view = render(<RecordItem title="Weekly report" onOpen={onOpen} />)
    const button = screen.getByRole('button', { name: 'Weekly report' })
    expect(button.getAttribute('aria-current')).toBeNull()
    fireEvent.click(button)
    expect(onOpen).toHaveBeenCalledTimes(1)
    view.unmount()
    render(<RecordItem title="Weekly report" onOpen={onOpen} selected details={<p>Open details</p>} />)
    const selected = screen.getByRole('button', { name: 'Weekly report' })
    expect(selected.getAttribute('aria-current')).toBe('true')
    expect(selected.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Open details')).not.toBeNull()
  })

  it('keeps a very long unbroken title inside the row', () => {
    const title = 'x'.repeat(200)
    render(<RecordItem title={title} />)
    expect(screen.getByText(title).className).toContain('break-words')
  })
})

describe('CollectionToolbar', () => {
  it('shows the count as a polite status with its unit, beside search, filters and actions', () => {
    render(<CollectionToolbar search={<p>Search box</p>} filters={<p>Filter chips</p>} actions={<button type="button">Export</button>} count={5} unit="memories" />)
    const count = screen.getByRole('status')
    expect(count.textContent).toBe('5 memories')
    for (const text of ['Search box', 'Filter chips']) expect(screen.getByText(text)).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Export' })).not.toBeNull()
  })

  it('counts "records" unless told another unit, and says a count of zero', () => {
    render(<CollectionToolbar count={0} />)
    expect(screen.getByRole('status').textContent).toBe('0 records')
  })

  it('has no status without a count', () => {
    render(<CollectionToolbar search={<p>Only search</p>} />)
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('CollectionSearch', () => {
  it('is a search box named by its label that takes typing', () => {
    const onChange = vi.fn()
    render(<CollectionSearch label="Search memory" placeholder="Search" value="" onChange={onChange} />)
    const box = screen.getByRole('searchbox', { name: 'Search memory' }) as HTMLInputElement
    expect(box.placeholder).toBe('Search')
    expect(box.autocomplete).toBe('off')
    fireEvent.change(box, { target: { value: 'tea' } })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('has room for a trailing control', () => {
    render(<CollectionSearch label="Search" value="" onChange={() => undefined} trailing={<button type="button">Scope</button>} compact />)
    expect(screen.getByRole('button', { name: 'Scope' })).not.toBeNull()
  })
})

describe('CollectionPanel', () => {
  const panel = (over: Partial<React.ComponentProps<typeof CollectionPanel>> = {}, children: ReactNode = <p>Rows</p>) =>
    render(
      <CollectionPanel count={2} unit="memories" emptyTitle="No memories" emptyDescription="Nothing saved yet." {...over}>
        {children}
      </CollectionPanel>,
    )

  it('shows its rows and the count when there are some', () => {
    panel()
    expect(screen.getByText('Rows')).not.toBeNull()
    expect(screen.getByRole('status').textContent).toBe('2 memories')
    expect(screen.queryByRole('heading', { name: 'No memories' })).toBeNull()
  })

  it('shows the empty state, not its rows, with a count of zero', () => {
    panel({ count: 0 })
    expect(screen.queryByText('Rows')).toBeNull()
    expect(screen.getByRole('heading', { name: 'No memories' })).not.toBeNull()
    expect(screen.getByRole('status').textContent).toBe('0 memories')
  })

  it('offers to clear a search that found nothing', () => {
    const onQueryChange = vi.fn()
    panel({ count: 0, query: 'zzz', onQueryChange, label: 'Search memory', placeholder: 'Search' })
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(onQueryChange).toHaveBeenCalledWith('')
  })

  it('shows the caller’s own empty content instead, and a hint under everything', () => {
    panel({ count: 0, emptyContent: <p>Connect memory first.</p>, hint: 'Memories are kept on your server.' })
    expect(screen.getByText('Connect memory first.')).not.toBeNull()
    expect(screen.getByText('Memories are kept on your server.')).not.toBeNull()
  })

  it('searches through the page search box when it has a label and a handler', () => {
    const onQueryChange = vi.fn()
    panel({ query: 'tea', onQueryChange, label: 'Search memory', placeholder: 'Search' })
    const box = screen.getByRole('searchbox', { name: 'Search memory' }) as HTMLInputElement
    expect(box.value).toBe('tea')
    fireEvent.change(box, { target: { value: 'tea time' } })
    expect(onQueryChange).toHaveBeenCalledTimes(1)
  })

  it('has no search box without a handler', () => {
    panel({ label: 'Search memory', placeholder: 'Search' })
    expect(screen.queryByRole('searchbox')).toBeNull()
  })
})
