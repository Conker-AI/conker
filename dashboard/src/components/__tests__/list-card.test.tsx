import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FilterChip, ListCard, ListLine, ListLineMenu } from '@/components/design-system/list-card'
import { useListSelection } from '@/components/design-system/list-selection'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'

afterEach(() => cleanup())

type Item = { id: string; title: string }
const items = (count: number): Item[] => Array.from({ length: count }, (_, index) => ({ id: `row-${index + 1}`, title: `Chat ${index + 1}` }))

/** A list with its own selection, the way the real screens wire it. */
function Harness({ rows, selectable = true, bulk = false, ...rest }: { rows: Item[]; selectable?: boolean; bulk?: boolean } & Partial<React.ComponentProps<typeof ListCard>>) {
  const selection = useListSelection(rows.map(row => row.id))
  return (
    <MemoryRouter>
      <ListCard
        count={rows.length}
        unit="chats"
        emptyTitle="No chats yet"
        emptyDescription="Start one from Home."
        selection={selectable ? selection : undefined}
        bulkActions={bulk ? <button type="button">Archive</button> : undefined}
        {...rest}
      >
        {rows.map(row => (
          <ListLine key={row.id} id={row.id} to={`/chat?session=${row.id}`} title={row.title} selection={selectable ? selection : undefined} />
        ))}
      </ListCard>
    </MemoryRouter>
  )
}
const select = (name: string) => screen.getByRole('checkbox', { name })

describe('ListCard', () => {
  it('shows the count with its unit above a list of one line per item', () => {
    render(<Harness rows={items(3)} selectable={false} />)
    expect(screen.getByText('3 chats')).not.toBeNull()
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByRole('link', { name: 'Chat 2' }).getAttribute('href')).toBe('/chat?session=row-2')
  })

  it('shows the empty state, not an empty list, when there are no rows', () => {
    render(<Harness rows={[]} selectable={false} icon={<svg data-testid="empty-mark" />} />)
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.getByRole('heading', { name: 'No chats yet' })).not.toBeNull()
    expect(screen.getByText('Start one from Home.')).not.toBeNull()
    expect(screen.getByTestId('empty-mark').parentElement?.getAttribute('aria-hidden')).toBe('true')
    expect(screen.getByText('0 chats')).not.toBeNull()
  })

  it('offers an action in the empty state', () => {
    render(<Harness rows={[]} selectable={false} emptyAction={<button type="button">New chat</button>} />)
    expect(screen.getByRole('button', { name: 'New chat' })).not.toBeNull()
  })

  it('replaces the empty state with the caller’s own content when given', () => {
    render(<Harness rows={[]} selectable={false} emptyContent={<p>Connect a server first.</p>} />)
    expect(screen.getByText('Connect a server first.')).not.toBeNull()
    expect(screen.queryByRole('heading', { name: 'No chats yet' })).toBeNull()
  })

  it('says nothing matches a search and clears it with one button', () => {
    const onQueryChange = vi.fn()
    render(<Harness rows={[]} selectable={false} query="zzz" onQueryChange={onQueryChange} label="Search chats" placeholder="Search" />)
    expect((screen.getByRole('searchbox', { name: 'Search chats' }) as HTMLInputElement).value).toBe('zzz')
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(onQueryChange).toHaveBeenCalledWith('')
  })

  it('does not offer to clear a blank search', () => {
    render(<Harness rows={[]} selectable={false} query="   " onQueryChange={() => undefined} label="Search chats" placeholder="Search" />)
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull()
  })

  it('reports what is typed in the search box', () => {
    const onQueryChange = vi.fn()
    render(<Harness rows={items(2)} selectable={false} query="" onQueryChange={onQueryChange} label="Search chats" placeholder="Search" />)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search chats' }), { target: { value: 'tax' } })
    expect(onQueryChange).toHaveBeenCalledWith('tax')
  })

  it('starts the search box empty when the caller holds no query yet', () => {
    render(<Harness rows={items(2)} selectable={false} onQueryChange={() => undefined} label="Search chats" placeholder="Search" />)
    expect((screen.getByRole('searchbox', { name: 'Search chats' }) as HTMLInputElement).value).toBe('')
  })

  it('has no search box without a placeholder either', () => {
    render(<Harness rows={items(2)} selectable={false} onQueryChange={() => undefined} label="Search chats" />)
    expect(screen.queryByRole('searchbox')).toBeNull()
  })

  it('has no search box without a label and placeholder for it', () => {
    render(<Harness rows={items(2)} selectable={false} onQueryChange={() => undefined} />)
    expect(screen.queryByRole('searchbox')).toBeNull()
  })

  it('groups filter chips under "Show" and puts a footer after the list', () => {
    render(
      <Harness
        rows={items(2)}
        selectable={false}
        filters={
          <FilterChip active={false} onClick={() => undefined}>
            All
          </FilterChip>
        }
        footer={<p>Showing 2 of 40</p>}
      />,
    )
    expect(within(screen.getByRole('group', { name: 'Show' })).getByRole('button', { name: 'All' })).not.toBeNull()
    expect(screen.getByText('Showing 2 of 40')).not.toBeNull()
  })

  it('has neither filters nor footer when none are given', () => {
    render(<Harness rows={items(2)} selectable={false} />)
    expect(screen.queryByRole('group', { name: 'Show' })).toBeNull()
    expect(screen.queryByText(/Showing/)).toBeNull()
  })

  it('shows the sort menu with the current order and changes it', async () => {
    const onChange = vi.fn()
    const sort = {
      value: 'name',
      options: [
        { value: 'newest', label: 'Newest' },
        { value: 'name', label: 'Name' },
      ],
      onChange,
    }
    render(<Harness rows={items(2)} selectable={false} sort={sort} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sort: Name' }))
    const current = await screen.findByRole('menuitemradio', { name: 'Name' })
    expect(current.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Newest' }))
    expect(onChange).toHaveBeenCalledWith('newest')
  })

  it('names the sort menu with nothing after the colon when its value is not one of the options', () => {
    render(<Harness rows={items(2)} selectable={false} sort={{ value: 'gone', options: [{ value: 'name', label: 'Name' }], onChange: () => undefined }} />)
    expect(screen.getByRole('button', { name: 'Sort:' })).not.toBeNull()
  })

  it('shows a 10,000-row count whole and keeps every row', () => {
    render(<Harness rows={items(60)} selectable={false} count={12_345} unit="of 12345 loaded" />)
    expect(screen.getByText('12345 of 12345 loaded')).not.toBeNull()
    expect(screen.getAllByRole('listitem')).toHaveLength(60)
  })
})

describe('ListCard select mode', () => {
  it('has a Select button only when it has a selection', () => {
    render(<Harness rows={items(2)} selectable={false} />)
    expect(screen.queryByRole('button', { name: 'Select items' })).toBeNull()
  })

  it('swaps its top bar for a toolbar of selected items with a Done button', () => {
    render(<Harness rows={items(3)} bulk />)
    fireEvent.click(screen.getByRole('button', { name: 'Select items' }))
    const bar = screen.getByRole('toolbar', { name: 'Selected items' })
    expect(within(bar).getByRole('status').textContent).toBe('Select items')
    expect(within(bar).getByRole('button', { name: 'Archive' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Select items' })).toBeNull()
    fireEvent.click(within(bar).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('turns each row into a checkbox named by its title and counts what is picked', () => {
    render(<Harness rows={items(3)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Select items' }))
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    fireEvent.click(select('Chat 1'))
    fireEvent.click(select('Chat 3'))
    expect(select('Chat 1').getAttribute('aria-checked')).toBe('true')
    expect(select('Chat 2').getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('status').textContent).toBe('2 selected')
  })

  it('selects all loaded rows and clears them again', () => {
    render(<Harness rows={items(3)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Select items' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all loaded' }))
    expect(screen.getByRole('status').textContent).toBe('3 selected')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Clear selection' }))
    expect(screen.getByRole('status').textContent).toBe('Select items')
  })

  it('picks a range with Shift', () => {
    render(<Harness rows={items(5)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Select items' }))
    fireEvent.click(select('Chat 2'))
    fireEvent.click(select('Chat 4'), { shiftKey: true })
    expect(screen.getByRole('status').textContent).toBe('3 selected')
    expect(select('Chat 3').getAttribute('aria-checked')).toBe('true')
    expect(select('Chat 5').getAttribute('aria-checked')).toBe('false')
  })

  it('has nothing to select all of in an empty list', () => {
    render(<Harness rows={[]} />)
    expect(screen.queryByRole('button', { name: 'Select items' })).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Select items' }))
    expect((screen.getByRole('checkbox', { name: 'Select all loaded' }) as HTMLInputElement).getAttribute('aria-disabled')).toBe('true')
  })

  it('leaves select mode on Escape and drops what was picked', () => {
    render(<Harness rows={items(2)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Select items' }))
    fireEvent.click(select('Chat 1'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('toolbar')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Select items' }))
    expect(screen.getByRole('status').textContent).toBe('Select items')
  })

  it('lets a mouse start selecting from a row’s own hover checkbox', () => {
    render(<Harness rows={items(2)} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Chat 2' }))
    expect(screen.getByRole('toolbar', { name: 'Selected items' })).not.toBeNull()
    expect(select('Chat 2').getAttribute('aria-checked')).toBe('true')
  })
})

describe('ListLine', () => {
  const inList = (node: ReactNode) =>
    render(
      <MemoryRouter>
        <ul>{node}</ul>
      </MemoryRouter>,
    )

  it('is one link with a title, a muted sub-line, a time and a state word', () => {
    inList(<ListLine to="/jobs/1" title="Weekly summary" sub="Runs on Mondays" meta="2 hr ago" badge="Archived" icon={<svg data-testid="icon" />} />)
    const link = screen.getByRole('link', { name: /Weekly summary/ })
    expect(link.getAttribute('href')).toBe('/jobs/1')
    for (const text of ['Runs on Mondays', '2 hr ago', 'Archived']) expect(within(link).getByText(text)).not.toBeNull()
    expect(screen.getByTestId('icon').parentElement?.getAttribute('aria-hidden')).toBe('true')
  })

  it('shows only the title when nothing else is given', () => {
    inList(<ListLine to="/x" title="Just a title" />)
    expect(screen.getByRole('link').textContent).toBe('Just a title')
  })

  it('calls onClick when the line is followed', () => {
    const onClick = vi.fn()
    inList(<ListLine to="/x" title="Open me" onClick={onClick} />)
    fireEvent.click(screen.getByRole('link', { name: 'Open me' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('says whether it opens its details in place, and shows them under it', () => {
    inList(<ListLine to="/x" title="Skill" expanded details={<p>Skill details</p>} />)
    expect(screen.getByRole('link', { name: 'Skill' }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Skill details')).not.toBeNull()
  })

  it('has its own menu of actions beside the link, named by the caller', async () => {
    const onArchive = vi.fn()
    inList(
      <ListLine
        to="/x"
        title="Chat"
        actions={
          <ListLineMenu label="Actions for Chat">
            <DropdownMenuItem onClick={onArchive}>Archive</DropdownMenuItem>
          </ListLineMenu>
        }
      />,
    )
    expect(within(screen.getByRole('link', { name: 'Chat' })).queryByRole('button')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Chat' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }))
    expect(onArchive).toHaveBeenCalledTimes(1)
  })

  it('keeps a very long title and sub-line on one truncated line each', () => {
    const long = 'A very long name '.repeat(20).trim()
    inList(<ListLine to="/x" title={long} sub={long} />)
    expect(screen.getByText(long, { selector: 'span.truncate.text-sm.font-medium' })).not.toBeNull()
    expect(screen.getAllByText(long).every(node => node.className.includes('truncate'))).toBe(true)
  })

  it('keeps its icon visible for a mouse’s hover checkbox only on a line that can be selected', () => {
    function Rows() {
      const selection = useListSelection(['a'])
      return (
        <>
          <ListLine id="a" to="/a" title="Selectable" icon={<svg data-testid="icon-a" />} selection={selection} />
          <ListLine to="/b" title="Plain" icon={<svg data-testid="icon-b" />} selection={selection} />
        </>
      )
    }
    inList(<Rows />)
    expect(screen.getByTestId('icon-a').parentElement!.className).toContain('group-hover/line:invisible')
    expect(screen.getByTestId('icon-b').parentElement!.className).not.toContain('group-hover/line:invisible')
    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
  })

  it('works as its own toggle in select mode, not as a link', () => {
    function Selecting() {
      const selection = useListSelection(['a'])
      return <ListLine id="a" to="/x" title="Row A" selection={selection} />
    }
    inList(<Selecting />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Row A' }))
    expect(screen.getByRole('checkbox', { name: 'Row A' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('FilterChip', () => {
  function Chips() {
    const [active, setActive] = useState('all')
    return (
      <>
        <FilterChip active={active === 'all'} count={12} onClick={() => setActive('all')}>
          All
        </FilterChip>
        <FilterChip active={active === 'archived'} onClick={() => setActive('archived')}>
          Archived
        </FilterChip>
      </>
    )
  }

  it('is pressed while active and shows its count', () => {
    render(<Chips />)
    const all = screen.getByRole('button', { name: /^All\s*12$/ })
    expect(all.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Archived' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('moves the pressed state to the chip pressed', () => {
    render(<Chips />)
    fireEvent.click(screen.getByRole('button', { name: 'Archived' }))
    expect(screen.getByRole('button', { name: 'Archived' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /^All\s*12$/ }).getAttribute('aria-pressed')).toBe('false')
  })

  it('shows a count of zero, not nothing', () => {
    render(
      <FilterChip active={false} count={0} onClick={() => undefined}>
        Failed
      </FilterChip>,
    )
    expect(screen.getByRole('button', { name: /^Failed\s*0$/ })).not.toBeNull()
  })
})
