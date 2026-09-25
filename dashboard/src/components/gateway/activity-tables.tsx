import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/data-table'
import { RecordItem } from '@/components/design-system/primitives'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { GatewayActivityEvent, GatewayActivityRun, GatewayTask } from '@/lib/gateway/activity'
import { taskStatusLabels, taskTitle } from './activity-state'
import { plainStatus } from './plain-status'

const date = (value: string) => new Date(value).toLocaleString()
const runTitle = (run: GatewayActivityRun) => `Attempt from ${date(run.startedAt)}`

export function GatewayTasksTable({ tasks, onOpen }: { tasks: GatewayTask[]; onOpen: (task: GatewayTask) => void }) {
  const rows = tasks.map(task => ({ ...task, search: `${taskTitle(task)} ${task.id} ${taskStatusLabels[task.status]}` }))
  const columns = useMemo<ColumnDef<(typeof rows)[number]>[]>(() => [
    { accessorKey: 'search', header: 'Outcome', cell: ({ row }) => <Button variant="link" className="h-auto max-w-full justify-start whitespace-normal p-0 text-left" onClick={() => onOpen(row.original)}>{taskTitle(row.original)}</Button> },
    { accessorKey: 'status', header: 'Status', cell: ({ row }) => <Badge variant="outline">{taskStatusLabels[row.original.status]}</Badge> },
    { accessorKey: 'sessionId', header: 'Source', cell: () => <span className="text-xs text-muted-foreground">Conversation</span> },
    { accessorKey: 'updatedAt', header: 'Updated', cell: ({ row }) => date(row.original.updatedAt) },
  ], [onOpen])
  return <DataTable columns={columns} data={rows} searchColumn="search" searchPlaceholder="Search loaded tasks…" itemLabel="tasks" renderItem={task => <RecordItem title={taskTitle(task)} description={taskStatusLabels[task.status]} meta={<><span>Owner reviewed</span>{task.archivedAt && <span>Archived</span>}<span>{date(task.updatedAt)}</span></>} onOpen={() => onOpen(task)} />} />
}

export function GatewayRunsTable({ runs, onOpen }: { runs: GatewayActivityRun[]; onOpen: (run: GatewayActivityRun) => void }) {
  const rows = runs.map(run => ({ ...run, search: `${run.id} ${run.status} ${run.model ?? ''} ${run.sessionId}` }))
  const columns = useMemo<ColumnDef<(typeof rows)[number]>[]>(() => [
    { accessorKey: 'search', header: 'Attempt', cell: ({ row }) => <Button variant="link" className="h-auto max-w-full justify-start whitespace-normal p-0 text-left" onClick={() => onOpen(row.original)}>{runTitle(row.original)}</Button> },
    { accessorKey: 'status', header: 'Status', cell: ({ row }) => plainStatus(row.original.status) },
    { accessorKey: 'model', header: 'Answer model', cell: ({ row }) => row.original.model || 'Not supplied' },
    { accessorKey: 'startedAt', header: 'Started', cell: ({ row }) => date(row.original.startedAt) },
  ], [onOpen])
  return <DataTable columns={columns} data={rows} searchColumn="search" searchPlaceholder="Search loaded attempts…" itemLabel="attempts" renderItem={run => <RecordItem title={runTitle(run)} description={plainStatus(run.status)} meta={<><span>{run.model || 'Model not supplied'}</span><span>{date(run.startedAt)}</span></>} onOpen={() => onOpen(run)} />} />
}

export function GatewayEventsTable({ events, onOpen }: { events: GatewayActivityEvent[]; onOpen: (event: GatewayActivityEvent) => void }) {
  const rows = events.map(event => ({ ...event, search: `${plainStatus(event.kind)} ${event.id} ${event.taskId ?? ''} ${event.runId ?? ''} ${event.sessionId}` }))
  const columns = useMemo<ColumnDef<(typeof rows)[number]>[]>(() => [
    { accessorKey: 'search', header: 'Activity', cell: ({ row }) => <Button variant="link" className="h-auto justify-start whitespace-normal p-0 text-left" onClick={() => onOpen(row.original)}>{plainStatus(row.original.kind)}</Button> },
    { accessorKey: 'sequence', header: 'Order', cell: ({ row }) => row.original.sequence },
    { accessorKey: 'sessionId', header: 'Source', cell: () => <span className="text-xs text-muted-foreground">Conversation</span> },
    { accessorKey: 'occurredAt', header: 'Recorded', cell: ({ row }) => date(row.original.occurredAt) },
  ], [onOpen])
  return <DataTable columns={columns} data={rows} searchColumn="search" searchPlaceholder="Search loaded activity…" itemLabel="events" renderItem={event => <RecordItem title={plainStatus(event.kind)} description={`Order ${event.sequence}`} meta={<span>{date(event.occurredAt)}</span>} onOpen={() => onOpen(event)} />} />
}
