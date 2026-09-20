import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/data-table'
import { RecordItem } from '@/components/design-system/primitives'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { GatewayActivityEvent, GatewayActivityRun, GatewayTask } from '@/lib/gateway/activity'
import { activityLabel, eventLabel, taskStatusLabels, taskTitle } from './activity-state'

const date = (value: string) => new Date(value).toLocaleString()

export function GatewayTasksTable({ tasks, onOpen }: { tasks: GatewayTask[]; onOpen: (task: GatewayTask) => void }) {
  const rows = tasks.map(task => ({ ...task, search: `${taskTitle(task)} ${task.id} ${taskStatusLabels[task.status]}` }))
  const columns = useMemo<ColumnDef<(typeof rows)[number]>[]>(() => [
    { accessorKey: 'search', header: 'Outcome', cell: ({ row }) => <Button variant="link" className="h-auto max-w-full justify-start whitespace-normal p-0 text-left" onClick={() => onOpen(row.original)}>{taskTitle(row.original)}</Button> },
    { accessorKey: 'status', header: 'Owner-reported status', cell: ({ row }) => <Badge variant="outline">{taskStatusLabels[row.original.status]}</Badge> },
    { accessorKey: 'sessionId', header: 'Conversation', cell: ({ row }) => <span className="break-all text-xs">{row.original.sessionId}</span> },
    { accessorKey: 'updatedAt', header: 'Updated', cell: ({ row }) => date(row.original.updatedAt) },
  ], [onOpen])
  return <DataTable columns={columns} data={rows} searchColumn="search" searchPlaceholder="Search loaded tasks…" itemLabel="tasks" renderItem={task => <RecordItem title={taskTitle(task)} description={taskStatusLabels[task.status]} meta={<><span>Owner-reported</span>{task.archivedAt && <span>Archived</span>}<span>{date(task.updatedAt)}</span></>} onOpen={() => onOpen(task)} />} />
}

export function GatewayRunsTable({ runs, onOpen }: { runs: GatewayActivityRun[]; onOpen: (run: GatewayActivityRun) => void }) {
  const rows = runs.map(run => ({ ...run, search: `${run.id} ${run.status} ${run.model ?? ''} ${run.sessionId}` }))
  const columns = useMemo<ColumnDef<(typeof rows)[number]>[]>(() => [
    { accessorKey: 'search', header: 'Recorded turn', cell: ({ row }) => <Button variant="link" className="h-auto max-w-full justify-start whitespace-normal break-all p-0 text-left" onClick={() => onOpen(row.original)}>{row.original.id}</Button> },
    { accessorKey: 'status', header: 'Runtime status', cell: ({ row }) => activityLabel(row.original.status) },
    { accessorKey: 'model', header: 'Model', cell: ({ row }) => row.original.model || 'Not supplied' },
    { accessorKey: 'startedAt', header: 'Started', cell: ({ row }) => date(row.original.startedAt) },
  ], [onOpen])
  return <DataTable columns={columns} data={rows} searchColumn="search" searchPlaceholder="Search loaded runs…" itemLabel="runs" renderItem={run => <RecordItem title={run.id} description={activityLabel(run.status)} meta={<><span>{run.model || 'Model not supplied'}</span><span>{date(run.startedAt)}</span></>} onOpen={() => onOpen(run)} />} />
}

export function GatewayEventsTable({ events, onOpen }: { events: GatewayActivityEvent[]; onOpen: (event: GatewayActivityEvent) => void }) {
  const rows = events.map(event => ({ ...event, search: `${eventLabel(event)} ${event.id} ${event.taskId ?? ''} ${event.runId ?? ''} ${event.sessionId}` }))
  const columns = useMemo<ColumnDef<(typeof rows)[number]>[]>(() => [
    { accessorKey: 'search', header: 'Event', cell: ({ row }) => <Button variant="link" className="h-auto justify-start whitespace-normal p-0 text-left" onClick={() => onOpen(row.original)}>{eventLabel(row.original)}</Button> },
    { accessorKey: 'sequence', header: 'Sequence' },
    { accessorKey: 'sessionId', header: 'Conversation', cell: ({ row }) => <span className="break-all text-xs">{row.original.sessionId}</span> },
    { accessorKey: 'occurredAt', header: 'Recorded', cell: ({ row }) => date(row.original.occurredAt) },
  ], [onOpen])
  return <DataTable columns={columns} data={rows} searchColumn="search" searchPlaceholder="Search loaded events…" itemLabel="events" renderItem={event => <RecordItem title={eventLabel(event)} description={`Sequence ${event.sequence}`} meta={<span>{date(event.occurredAt)}</span>} onOpen={() => onOpen(event)} />} />
}
