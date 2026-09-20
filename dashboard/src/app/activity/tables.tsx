import type { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/data-table"
import { RecordItem } from "@/components/design-system"
import { Badge } from "@/components/ui/badge"
import type { ActivityEventRecord, ActivityRunRecord, TaskRecord } from "@/lib/api/task-types"
import { Provenance, TaskStatusBadge } from "./presentation"
import { displayTime } from "./format"

function OpenRecord({ children, onClick }: { children: React.ReactNode; onClick: () => void }) { return <button type="button" onClick={onClick} className="rounded-sm text-left font-medium break-words hover:underline focus-visible:outline-2 focus-visible:outline-ring">{children}</button> }
export function TasksTable({ tasks, agentName, open, toolbar }: { tasks: TaskRecord[]; agentName: (id: string) => string; open: (task: TaskRecord) => void; toolbar: React.ReactNode }) {
  const columns: ColumnDef<TaskRecord>[] = [
    { id: "outcome", header: "Desired outcome", accessorFn: task => `${task.outcome} ${task.criteria.map(item => item.text).join(" ")} ${agentName(task.agentId)}`, cell: ({ row }) => <div className="max-w-xl space-y-1"><OpenRecord onClick={() => open(row.original)}>{row.original.outcome}</OpenRecord><p className="text-xs text-muted-foreground">{row.original.criteria.length} criteria · {row.original.runIds.length} linked attempts{row.original.parentTaskId ? " · Child task" : ""}</p></div> },
    { accessorKey: "status", header: "Owner-reported status", cell: ({ row }) => <TaskStatusBadge status={row.original.status} /> },
    { id: "agent", accessorFn: task => agentName(task.agentId), header: "Assigned to" },
    { accessorKey: "updatedAt", header: "Updated", cell: ({ row }) => <span className="text-xs text-muted-foreground tabular-nums">{displayTime(row.original.updatedAt)}</span> },
  ]
  return <DataTable columns={columns} data={tasks} searchColumn="outcome" searchPlaceholder="Search outcomes, criteria or agents…" itemLabel="tasks" toolbarAction={toolbar} renderItem={task => <RecordItem title={task.outcome} description={`${task.criteria.length} completion criteria · ${task.runIds.length} linked attempts`} onOpen={() => open(task)} meta={<><TaskStatusBadge status={task.status} /><span>{agentName(task.agentId)}</span>{task.archivedAt && <Badge variant="outline">Archived</Badge>}<span>{displayTime(task.updatedAt)}</span></>} />} />
}

export function RunsTable({ runs, open }: { runs: ActivityRunRecord[]; open: (run: ActivityRunRecord) => void }) {
  const columns: ColumnDef<ActivityRunRecord>[] = [
    { id: "label", header: "Attempt", accessorFn: run => `${run.label} ${run.source.kind} ${run.source.runId}`, cell: ({ row }) => <div className="max-w-lg space-y-1"><OpenRecord onClick={() => open(row.original)}>{row.original.label}</OpenRecord><p className="text-xs text-muted-foreground">{row.original.source.kind}{row.original.parentRunId ? " · Nested attempt" : ""}</p></div> },
    { accessorKey: "status", header: "Status", filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)), cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge> },
    { accessorKey: "provenance", header: "Source", filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)), cell: ({ row }) => <Provenance value={row.original.provenance} /> },
    { accessorKey: "startedAt", header: "Started", cell: ({ row }) => <span className="text-xs text-muted-foreground tabular-nums">{displayTime(row.original.startedAt)}</span> },
  ]
  return <DataTable columns={columns} data={runs} searchColumn="label" searchPlaceholder="Search attempts or source IDs…" itemLabel="runs" filters={[
    { column: "status", title: "Status", options: ["running", "completed", "stopped", "failed"].map(value => ({ label: value[0].toUpperCase() + value.slice(1), value })) },
    { column: "provenance", title: "Provenance", options: ["sample", "preview", "recorded", "live"].map(value => ({ label: value[0].toUpperCase() + value.slice(1), value })) },
  ]} renderItem={run => <RecordItem title={run.label} description={`${run.source.kind}${run.parentRunId ? " · Nested attempt" : ""}`} onOpen={() => open(run)} meta={<><Badge variant="outline">{run.status}</Badge><Provenance value={run.provenance} /><span>{displayTime(run.startedAt)}</span></>} />} />
}

export function EventsTable({ events, open }: { events: ActivityEventRecord[]; open: (event: ActivityEventRecord) => void }) {
  const actors = [...new Set(events.map(event => event.actor).filter((actor): actor is string => !!actor))]
  const columns: ColumnDef<ActivityEventRecord>[] = [
    { id: "label", header: "Event", accessorFn: event => `${event.label} ${event.detail} ${event.actor ?? ""}`, cell: ({ row }) => <div className="max-w-xl space-y-1"><OpenRecord onClick={() => open(row.original)}>{row.original.label}</OpenRecord><p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{row.original.detail}</p></div> },
    { accessorKey: "actor", header: "Actor", filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)), cell: ({ row }) => row.original.actor ?? "Not recorded" },
    { accessorKey: "provenance", header: "Source", filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)), cell: ({ row }) => <Provenance value={row.original.provenance} /> },
    { id: "time", accessorFn: event => event.occurredAt ?? event.displayTime ?? "", header: "Time", cell: ({ row }) => <span className="text-xs text-muted-foreground tabular-nums">{row.original.displayTime ?? displayTime(row.original.occurredAt)}</span> },
  ]
  return <DataTable columns={columns} data={events} searchColumn="label" searchPlaceholder="Search events, details or actors…" itemLabel="events" filters={[
    { column: "actor", title: "Actor", options: actors.map(value => ({ value, label: value })) },
    { column: "provenance", title: "Provenance", options: ["sample", "preview", "recorded", "live"].map(value => ({ label: value[0].toUpperCase() + value.slice(1), value })) },
  ]} renderItem={event => <RecordItem title={event.label} description={event.detail} onOpen={() => open(event)} meta={<><span>{event.actor ?? "Actor not recorded"}</span><Provenance value={event.provenance} /><span>{event.displayTime ?? displayTime(event.occurredAt)}</span></>} />} />
}
