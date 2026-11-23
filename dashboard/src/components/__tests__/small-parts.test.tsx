import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { getCoreRowModel, getPaginationRowModel, useReactTable } from '@tanstack/react-table'
import { Brain } from 'lucide-react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageActionButton } from '@/components/message-action-button'
import { ReferenceSection } from '@/components/reference-section'
import { DataTablePagination } from '@/components/table/data-table-pagination'
import { Meter, MeterIndicator, MeterLabel, MeterTrack, MeterValue } from '@/components/ui/meter'
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress'
import { stubResizeObserver } from './jsdom-shims.test'

beforeEach(() => stubResizeObserver())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Progress', () => {
  it('is a progress bar that reports its value', () => {
    render(<Progress value={40} aria-label="Upload" />)
    const bar = screen.getByRole('progressbar', { name: 'Upload' })
    expect(bar.getAttribute('aria-valuenow')).toBe('40')
    expect(bar.getAttribute('aria-valuemin')).toBe('0')
    expect(bar.getAttribute('aria-valuemax')).toBe('100')
  })

  it('names the bar by its label and shows the value as text', () => {
    render(
      <Progress value={65}>
        <ProgressLabel>Backing up</ProgressLabel>
        <ProgressValue />
      </Progress>,
    )
    expect(screen.getByRole('progressbar', { name: 'Backing up' })).not.toBeNull()
    expect(screen.getByText('65%')).not.toBeNull()
  })

  it('has no value while the length is unknown', () => {
    render(<Progress value={null} aria-label="Working" />)
    expect(screen.getByRole('progressbar', { name: 'Working' }).getAttribute('aria-valuenow')).toBeNull()
  })

  it('draws its own track and indicator when it has no children, and takes a class', () => {
    render(<Progress value={10} aria-label="Quiet" className="max-w-xs" />)
    expect(screen.getByRole('progressbar').className).toContain('max-w-xs')
    expect(document.querySelector('[data-slot="progress-indicator"]')).not.toBeNull()
  })
})

describe('Meter', () => {
  it('is a meter with its value, range and label', () => {
    render(
      <Meter value={80} min={0} max={200}>
        <MeterLabel>Plan used</MeterLabel>
        <MeterValue />
        <MeterTrack>
          <MeterIndicator />
        </MeterTrack>
      </Meter>,
    )
    const meter = screen.getByRole('meter', { name: 'Plan used' })
    expect(meter.getAttribute('aria-valuenow')).toBe('80')
    expect(meter.getAttribute('aria-valuemax')).toBe('200')
    expect(screen.getByText('40%')).not.toBeNull()
  })

  it('draws a plain bar when it has no children', () => {
    render(<Meter value={25} aria-label="Disk" />)
    expect(screen.getByRole('meter', { name: 'Disk' }).getAttribute('aria-valuenow')).toBe('25')
    expect(document.querySelector('[data-slot="meter-indicator"]')).not.toBeNull()
  })

  it('reports a full and an empty meter as they are', () => {
    render(
      <>
        <Meter value={0} aria-label="Empty" />
        <Meter value={100} aria-label="Full" />
      </>,
    )
    expect(screen.getByRole('meter', { name: 'Empty' }).getAttribute('aria-valuenow')).toBe('0')
    expect(screen.getByRole('meter', { name: 'Full' }).getAttribute('aria-valuenow')).toBe('100')
  })
})

describe('ReferenceSection', () => {
  it('is a region named by its heading, with the body under it', () => {
    render(
      <ReferenceSection title="Sources" icon={<Brain data-testid="mark" />}>
        <p>Where this came from.</p>
      </ReferenceSection>,
    )
    const region = screen.getByRole('region', { name: 'Sources' })
    expect(within(region).getByRole('heading', { level: 3, name: 'Sources' })).not.toBeNull()
    expect(within(region).getByText('Where this came from.')).not.toBeNull()
    expect(screen.getByTestId('mark')).not.toBeNull()
  })

  it('gives two sections their own headings, so each region keeps its name', () => {
    render(
      <>
        <ReferenceSection title="First">
          <p>One</p>
        </ReferenceSection>
        <ReferenceSection title="Second">
          <p>Two</p>
        </ReferenceSection>
      </>,
    )
    expect(within(screen.getByRole('region', { name: 'First' })).getByText('One')).not.toBeNull()
    expect(within(screen.getByRole('region', { name: 'Second' })).getByText('Two')).not.toBeNull()
  })

  it('lets a long unbroken value wrap inside its body', () => {
    const id = 'a'.repeat(120)
    render(
      <ReferenceSection title="Technical details">
        <p>{id}</p>
      </ReferenceSection>,
    )
    expect(screen.getByText(id).parentElement!.className).toContain('[overflow-wrap:anywhere]')
  })
})

describe('MessageActionButton', () => {
  it('is an icon button named by its label that runs its action', () => {
    const onClick = vi.fn()
    render(
      <MessageActionButton label="Copy message" onClick={onClick}>
        <Brain />
      </MessageActionButton>,
    )
    const button = screen.getByRole('button', { name: 'Copy message' })
    expect(button.getAttribute('type')).toBe('button')
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does not run while disabled', () => {
    const onClick = vi.fn()
    render(
      <MessageActionButton label="Copy message: Nothing to copy." disabled onClick={onClick}>
        <Brain />
      </MessageActionButton>,
    )
    const button = screen.getByRole('button', { name: 'Copy message: Nothing to copy.' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('shows a pressed state when the caller marks it pressed, and its own class beside the default', () => {
    render(
      <MessageActionButton label="Pin" aria-pressed className="text-primary">
        <Brain />
      </MessageActionButton>,
    )
    const button = screen.getByRole('button', { name: 'Pin' })
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(button.className).toContain('text-primary')
  })
})

describe('DataTablePagination', () => {
  type Row = { id: number }
  function Pager({ rows, pageSize = 10 }: { rows: number; pageSize?: number }) {
    const data = Array.from({ length: rows }, (_, index): Row => ({ id: index }))
    const table = useReactTable({ data, columns: [{ accessorKey: 'id' }], getCoreRowModel: getCoreRowModel(), getPaginationRowModel: getPaginationRowModel(), initialState: { pagination: { pageIndex: 0, pageSize } } })
    return <DataTablePagination table={table} />
  }
  const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement

  it('shows the page, the page count and the selection count', () => {
    render(<Pager rows={95} />)
    expect(screen.getByText('Page 1 of 10')).not.toBeNull()
    expect(screen.getByText(/0 of 95 row\(s\) selected\./)).not.toBeNull()
  })

  it('starts on the first page: no way back, a way forward', () => {
    render(<Pager rows={95} />)
    expect(button('Go to first page').disabled).toBe(true)
    expect(button('Go to previous page').disabled).toBe(true)
    expect(button('Go to next page').disabled).toBe(false)
    expect(button('Go to last page').disabled).toBe(false)
  })

  it('moves a page at a time, and to either end', () => {
    render(<Pager rows={95} />)
    fireEvent.click(button('Go to next page'))
    expect(screen.getByText('Page 2 of 10')).not.toBeNull()
    fireEvent.click(button('Go to last page'))
    expect(screen.getByText('Page 10 of 10')).not.toBeNull()
    expect(button('Go to next page').disabled).toBe(true)
    expect(button('Go to last page').disabled).toBe(true)
    fireEvent.click(button('Go to previous page'))
    expect(screen.getByText('Page 9 of 10')).not.toBeNull()
    fireEvent.click(button('Go to first page'))
    expect(screen.getByText('Page 1 of 10')).not.toBeNull()
  })

  it('has one page and nowhere to go when everything fits', () => {
    render(<Pager rows={3} />)
    expect(screen.getByText('Page 1 of 1')).not.toBeNull()
    for (const name of ['Go to first page', 'Go to previous page', 'Go to next page', 'Go to last page']) expect(button(name).disabled).toBe(true)
  })

  it('shows page 1 of 0 for an empty table, with nothing to press', () => {
    render(<Pager rows={0} />)
    expect(screen.getByText('Page 1 of 0')).not.toBeNull()
    expect(button('Go to next page').disabled).toBe(true)
  })

  it('names the rows-per-page choice and shows the current size', () => {
    render(<Pager rows={95} pageSize={20} />)
    expect(screen.getByRole('combobox', { name: 'Rows per page' }).textContent).toBe('20')
  })

  it('changes the page size from its menu and recounts the pages', async () => {
    render(<Pager rows={95} />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Rows per page' }))
    const option = await screen.findByRole('option', { name: '50' })
    fireEvent.pointerDown(option)
    fireEvent.mouseDown(option)
    fireEvent.pointerUp(option)
    fireEvent.mouseUp(option)
    fireEvent.click(option)
    expect(await screen.findByText('Page 1 of 2')).not.toBeNull()
  })
})
