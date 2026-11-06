import { Archive, ListChecks, RotateCcw } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/data-table'
import { RecordItem } from '@/components/design-system/primitives'
import { FilterChip, ListCard, ListLine, ListLineMenu } from '@/components/design-system'
import { useListSelection } from '@/components/design-system/list-selection'
import { byName, byNewest, useListView } from '@/components/design-system/list-view'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import type { GatewayActivityEvent, GatewayActivityRun, GatewayTask } from '@/lib/gateway/activity'
import { isTerminalTask, taskStatusLabels, taskTitle } from './activity-state'
import { plainStatus } from './plain-status'

const date = (value: string) => new Date(value).toLocaleString()
const when = (value: string) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value))
const runTitle = (run: GatewayActivityRun) => `Attempt from ${date(run.startedAt)}`

export type TaskFilter = 'active' | 'history' | 'archived' | 'all'
const TASK_TEXT = (task: GatewayTask) => [taskTitle(task), taskStatusLabels[task.status]]
const TASK_SORTS = {
  updated: { label: 'Recently updated', compare: byNewest<GatewayTask>(task => task.updatedAt) },
  outcome: { label: 'Outcome (A to Z)', compare: byName<GatewayTask>(taskTitle) },
}
const inFilter = (task: GatewayTask, filter: TaskFilter) => filter === 'all' || (filter === 'archived' ? !!task.archivedAt : !task.archivedAt && (filter === 'history') === isTerminalTask(task))
const FILTERS: [TaskFilter, string][] = [['active', 'Active'], ['history', 'Done or cancelled'], ['archived', 'Archived'], ['all', 'All']]

/**
 * Tasks as one list: search, order, lifecycle chips, select several, then Archive or Restore them
 * (one write per task with its revision; one toast with Undo). The row opens its details in place.
 */
export function GatewayTasksTable({ tasks, filter, onFilter, linkFor, onArchive, disabled, emptyAction }: {
  tasks: GatewayTask[]; filter: TaskFilter; onFilter: (filter: TaskFilter) => void; linkFor: (task: GatewayTask) => string
  onArchive: (tasks: GatewayTask[], archived: boolean) => Promise<void>; disabled?: boolean; emptyAction?: ReactNode
}) {
  const view = useListView(useMemo(() => tasks.filter(task => inFilter(task, filter)), [tasks, filter]), { text: TASK_TEXT, sorts: TASK_SORTS })
  const shown = view.rows
  const selection = useListSelection(shown.map(task => task.id))
  const [writing, setWriting] = useState(false)
  const busy = writing || !!disabled
  const picked = shown.filter(task => selection.has(task.id))
  const toArchive = picked.filter(task => !task.archivedAt), toRestore = picked.filter(task => task.archivedAt)
  async function archive(items: GatewayTask[], archived: boolean) {
    setWriting(true)
    try { await onArchive(items, archived); selection.stop() } finally { setWriting(false) }
  }
  const rowMenu = (task: GatewayTask) => <ListLineMenu label={`More actions for ${taskTitle(task)}`}>
    {task.archivedAt
      ? <DropdownMenuItem disabled={busy} onClick={() => void archive([task], false)}><RotateCcw aria-hidden="true" />Restore</DropdownMenuItem>
      : <DropdownMenuItem disabled={busy} onClick={() => void archive([task], true)}><Archive aria-hidden="true" />Archive</DropdownMenuItem>}
  </ListLineMenu>
  const searching = !!view.query.trim()
  return <ListCard count={shown.length} unit={shown.length === 1 ? 'task' : 'tasks'} query={view.query} onQueryChange={view.setQuery} label="Search tasks" placeholder="Search tasks" sort={view.sort} selection={selection}
    bulkActions={<>
      {filter !== 'archived' && <Button type="button" size="sm" variant="outline" disabled={!toArchive.length || busy} onClick={() => void archive(toArchive, true)}><Archive />Archive</Button>}
      {(filter === 'archived' || filter === 'all') && <Button type="button" size="sm" variant="outline" disabled={!toRestore.length || busy} onClick={() => void archive(toRestore, false)}><RotateCcw />Restore</Button>}
    </>}
    filters={<>{FILTERS.map(([value, text]) => <FilterChip key={value} active={filter === value} count={tasks.filter(task => inFilter(task, value)).length} onClick={() => { selection.stop(); onFilter(value) }}>{text}</FilterChip>)}</>}
    emptyTitle={searching ? 'No matching tasks' : !tasks.length ? 'No tasks yet' : filter === 'archived' ? 'No archived tasks' : filter === 'history' ? 'Nothing done or cancelled yet' : 'No active tasks'}
    emptyDescription={!tasks.length ? 'Write what you want done and how you’ll know it’s finished. Each task links to a chat.' : filter === 'archived' ? 'Archived tasks keep their history.' : 'Try another filter.'}
    emptyAction={!tasks.length && !searching ? emptyAction : undefined} icon={<ListChecks />}>
    {shown.map(task => <ListLine key={task.id} id={task.id} selection={selection} to={linkFor(task)} actions={rowMenu(task)} icon={<ListChecks />}
      title={taskTitle(task)} sub={taskStatusLabels[task.status]} badge={filter === 'all' && task.archivedAt ? 'Archived' : undefined} meta={when(task.updatedAt)} />)}
  </ListCard>
}

export function GatewayRunsTable({ runs, onOpen }: { runs: GatewayActivityRun[]; onOpen: (run: GatewayActivityRun) => void }) {
  const rows = runs.map(run => ({ ...run, search: `${run.id} ${run.status} ${run.model ?? ''} ${run.sessionId}` }))
  const columns = useMemo<ColumnDef<(typeof rows)[number]>[]>(() => [
    { accessorKey: 'search', header: 'Attempt', cell: ({ row }) => <Button variant="link" className="h-auto max-w-full justify-start whitespace-normal p-0 text-left" onClick={() => onOpen(row.original)}>{runTitle(row.original)}</Button> },
    { accessorKey: 'status', header: 'Status', cell: ({ row }) => plainStatus(row.original.status) },
    { accessorKey: 'model', header: 'Answer model', cell: ({ row }) => row.original.model || 'Not supplied' },
    { accessorKey: 'startedAt', header: 'Started', cell: ({ row }) => date(row.original.startedAt) },
  ], [onOpen])
  return <DataTable columns={columns} data={rows} itemLabel="attempts" renderItem={run => <RecordItem title={runTitle(run)} description={plainStatus(run.status)} meta={<><span>{run.model || 'Model not supplied'}</span><span>{date(run.startedAt)}</span></>} onOpen={() => onOpen(run)} />} />
}

export function GatewayEventsTable({ events, onOpen }: { events: GatewayActivityEvent[]; onOpen: (event: GatewayActivityEvent) => void }) {
  const rows = events.map(event => ({ ...event, search: `${plainStatus(event.kind)} ${event.id} ${event.taskId ?? ''} ${event.runId ?? ''} ${event.sessionId}` }))
  const columns = useMemo<ColumnDef<(typeof rows)[number]>[]>(() => [
    { accessorKey: 'search', header: 'Activity', cell: ({ row }) => <Button variant="link" className="h-auto justify-start whitespace-normal p-0 text-left" onClick={() => onOpen(row.original)}>{plainStatus(row.original.kind)}</Button> },
    { accessorKey: 'sequence', header: 'Order', cell: ({ row }) => row.original.sequence },
    { accessorKey: 'sessionId', header: 'Source', cell: () => <span className="text-xs text-muted-foreground">Conversation</span> },
    { accessorKey: 'occurredAt', header: 'Recorded', cell: ({ row }) => date(row.original.occurredAt) },
  ], [onOpen])
  return <DataTable columns={columns} data={rows} itemLabel="events" renderItem={event => <RecordItem title={plainStatus(event.kind)} description={`Order ${event.sequence}`} meta={<span>{date(event.occurredAt)}</span>} onOpen={() => onOpen(event)} />} />
}
