import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Box, Cpu, Network, Plus } from "lucide-react"
import { conkerClient } from "@/lib/api"
import type { RuntimeAction, RuntimePort, SystemRuntimeSnapshot } from "@/lib/api/system-runtime-types"
import { DataTable } from "@/components/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ConfirmationDialog, DetailPanel, OverlayBody, RecordItem } from "@/components/design-system"
import { ReferenceSection } from "@/components/reference-section"
import { PortEditor } from "./port-editor"

export type RuntimeSection = "processes" | "ports" | "containers"
type Selection = { kind: RuntimeSection; id: string }
type Row = Selection & { name: string; description: string; status: string; detail: string; editable?: boolean }
type Confirmation = { target: Row; action: "stop" | "remove" }
const client = conkerClient.systemRuntime

export function SystemRuntime({ section }: { section: RuntimeSection }) {
  const [snapshot, setSnapshot] = useState<SystemRuntimeSnapshot | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState("")
  const [selection, setSelection] = useState<Selection | null>(null)
  const [editor, setEditor] = useState<RuntimePort | "new" | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const region = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let active = true
    const refresh = () => { void client.load().then(value => { if (active) { setSnapshot(value); setError("") } }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Could not load runtime preview.") }) }
    refresh()
    const unsubscribe = client.subscribe(refresh)
    return () => { active = false; unsubscribe() }
  }, [])
  const inspect = useCallback((item: Selection) => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setSelection(item); setError("") }, [])
  const restoreFocus = (event: Event) => {
    event.preventDefault()
    requestAnimationFrame(() => {
      if (document.querySelector('[role="dialog"][data-state="open"]')) return
      const target = returnFocus.current
      ;(target?.isConnected ? target : region.current)?.focus()
    })
  }
  const perform = async (action: () => Promise<unknown>, message: string) => {
    if (busy) return false
    setBusy(true); setError("")
    try { await action(); setSnapshot(await client.load()); setFeedback(message); return true }
    catch (cause) { setError(cause instanceof Error ? cause.message : "This preview action failed. Try again."); return false }
    finally { setBusy(false) }
  }
  const rows = useMemo<Row[]>(() => {
    if (!snapshot) return []
    if (section === "processes") return snapshot.processes.map(item => ({ kind: section, id: item.id, name: item.name, description: `PID ${item.pid} · ${item.command}`, status: item.status, detail: `${item.cpuPercent}% CPU · ${item.memoryMb} MB · ${item.user}` }))
    if (section === "containers") return snapshot.containers.map(item => ({ kind: section, id: item.id, name: item.name, description: item.image, status: item.status, detail: `${item.restarts} restarts · ${snapshot.ports.filter(port => port.containerId === item.id).length} mappings` }))
    return snapshot.ports.map(item => ({ kind: section, id: item.id, name: `${item.hostAddress}:${item.hostPort}/${item.protocol}`, description: item.containerId ? `${item.containerId}:${item.targetPort}` : `${snapshot.processes.find(process => process.id === item.processId)?.name || item.processId} · host listener`, status: item.listening ? "Listening" : "Inactive", detail: item.containerId ? "Container mapping" : "Read-only host listener", editable: !!item.containerId }))
  }, [snapshot, section])
  const columns = useMemo<ColumnDef<Row>[]>(() => [
    { id: "name", accessorFn: row => `${row.name} ${row.description} ${row.detail}`, header: section === "ports" ? "Host binding" : section === "containers" ? "Container" : "Process", cell: ({ row: { original: item } }) => <div className="min-w-0"><button className="text-left text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring" onClick={() => inspect(item)}>{item.name}</button><p className="mt-1 break-words text-xs text-muted-foreground">{item.description}</p></div> },
    { accessorKey: "status", header: "Preview status", cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>, filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)) },
    { accessorKey: "detail", header: section === "processes" ? "Sample resources" : "Details", cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.detail}</span> },
  ], [inspect, section])
  const process = snapshot?.processes.find(item => selection?.kind === "processes" && item.id === selection.id)
  const container = snapshot?.containers.find(item => selection?.kind === "containers" && item.id === selection.id)
  const port = snapshot?.ports.find(item => selection?.kind === "ports" && item.id === selection.id)
  const name = process?.name || container?.name || (port ? `${port.hostAddress}:${port.hostPort}/${port.protocol}` : "Runtime item")
  const selectedRow: Row | undefined = selection && (process || container || port) ? { ...selection, name, description: "", status: process?.status || container?.status || (port?.listening ? "Listening" : "Inactive"), detail: "" } : undefined
  const act = (target: Row, action: RuntimeAction) => {
    if (action === "stop") { setError(""); setConfirmation({ target, action }); return }
    void perform(() => client.act(target.kind === "containers" ? "container" : "process", target.id, action), `${target.name}: ${action === "start" ? "started" : "restarted"} in the preview. No host action ran.`)
  }
  const openEditor = (value: RuntimePort | "new") => { setError(""); if (!selection) returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setEditor(value) }
  const Icon = section === "processes" ? Cpu : section === "containers" ? Box : Network
  return <div ref={region} tabIndex={-1} className="space-y-4 focus-visible:outline-2 focus-visible:outline-ring">
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Badge variant="outline">Preview</Badge><span>Sample runtime · actions are simulated · changes reset on reload.</span></div>
    {error && !editor && !confirmation && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!snapshot ? <p role="status" className="text-sm text-muted-foreground">{error ? "Runtime preview unavailable." : "Loading runtime preview…"}</p> : <DataTable columns={columns} data={rows} itemLabel={section} searchColumn="name" searchPlaceholder={`Search ${section}…`} filters={[{ column: "status", title: "Status", options: (section === "ports" ? ["Listening", "Inactive"] : ["Running", "Stopped"]).map(value => ({ label: value, value })) }]} toolbarAction={section === "ports" ? <Button onClick={() => openEditor("new")} disabled={busy}><Plus />New mapping</Button> : undefined} renderItem={item => <RecordItem title={item.name} description={item.description} onOpen={() => inspect(item)} leading={<Icon className="size-4" />} meta={<><Badge variant="outline">{item.status}</Badge><span>{item.detail}</span></>} />} />}
    <p role="status" className="text-xs text-muted-foreground">{feedback || "Open an item to inspect its relationships and available preview actions. Resource values are illustrative, not live metrics."}</p>
    {!!snapshot?.receipts.length && <ReferenceSection title="Recent preview actions"><ol className="divide-y">{snapshot.receipts.slice(0, 5).map(receipt => <li key={receipt.id} className="py-2 text-sm"><p>{receipt.action} · {receipt.targetName}</p><time className="text-xs text-muted-foreground" dateTime={receipt.createdAt}>{new Date(receipt.createdAt).toLocaleString()}</time></li>)}</ol></ReferenceSection>}
    <DetailPanel open={!!selection && !editor && !confirmation} onOpenChange={open => { if (!open) setSelection(null) }} title={name} description="Sample runtime record · no live host connection" busy={busy} onCloseAutoFocus={restoreFocus}>
      {selectedRow && <div className="flex shrink-0 flex-wrap gap-2 border-b px-5 py-3">
        {port ? port.containerId ? <><Button size="sm" variant="outline" disabled={busy} onClick={() => openEditor(port)}>Edit mapping</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => { setError(""); setConfirmation({ target: selectedRow, action: "remove" }) }}>Remove mapping</Button></> : <span className="text-xs text-muted-foreground">Host listener is read-only.</span> : process && !process.controlTarget?.actions.length ? <span className="text-xs text-muted-foreground">Inspect-only process. No managed lifecycle target is configured.</span> : <><Button size="sm" variant="outline" disabled={busy || (!!process && !process.controlTarget?.actions.includes(selectedRow.status === "Running" ? "stop" : "start"))} onClick={() => act(selectedRow, selectedRow.status === "Running" ? "stop" : "start")}>{selectedRow.status === "Running" ? "Stop preview" : "Start preview"}</Button><Button size="sm" variant="outline" disabled={busy || (!!process && !process.controlTarget?.actions.includes("restart"))} onClick={() => act(selectedRow, "restart")}>Restart preview</Button></>}
      </div>}
      <OverlayBody>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}{process ? <><ReferenceSection title="Process"><dl className="space-y-2 text-sm"><div><dt className="text-muted-foreground">Sample PID / user</dt><dd>{process.pid} · {process.user}</dd></div><div><dt className="text-muted-foreground">Command</dt><dd className="break-all font-mono text-xs">{process.command}</dd></div><div><dt className="text-muted-foreground">Preview state</dt><dd>{process.status} · {process.restarts} restarts</dd></div><div><dt className="text-muted-foreground">Illustrative usage</dt><dd>{process.cpuPercent}% CPU · {process.memoryMb} MB memory</dd></div></dl></ReferenceSection>{process.controlTarget && <ReferenceSection title="Lifecycle target"><p className="break-words text-sm">{process.controlTarget.kind === "container" ? "Container" : "Managed service"}: {process.controlTarget.id}</p><p className="text-xs text-muted-foreground">Preview actions apply to this managed target and its related records.</p></ReferenceSection>}{process.containerId && <ReferenceSection title="Container"><Button variant="outline" size="sm" onClick={() => setSelection({ kind: "containers", id: process.containerId! })}>{process.containerId}</Button></ReferenceSection>}</> : container ? <ReferenceSection title="Container"><p className="break-all font-mono text-xs">{container.image}</p><p>{container.status} · {container.restarts} restarts</p><Button size="sm" variant="outline" onClick={() => setSelection({ kind: "processes", id: container.processId })}>Inspect main process</Button><p className="text-xs text-muted-foreground">Lifecycle actions update its sample process and mapped port statuses together.</p></ReferenceSection> : port ? <ReferenceSection title="Port binding"><p className="break-all font-mono text-xs">{port.hostAddress}:{port.hostPort} → {port.containerId || "host"}:{port.targetPort} / {port.protocol.toUpperCase()}</p><p>{port.listening ? "Listening in preview" : "Inactive in preview"}</p><p className="text-xs text-muted-foreground">Configured mappings stay reserved when stopped. No real socket or firewall rule is created.</p><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setSelection({ kind: "processes", id: port.processId })}>Inspect process</Button>{port.containerId && <Button size="sm" variant="outline" onClick={() => setSelection({ kind: "containers", id: port.containerId! })}>Inspect container</Button>}</div></ReferenceSection> : <p>This record is no longer available.</p>}
        {(process || container) && <ReferenceSection title="Ports">{snapshot?.ports.filter(item => item.processId === (process?.id || container?.processId)).length ? <div className="flex flex-wrap gap-2">{snapshot.ports.filter(item => item.processId === (process?.id || container?.processId)).map(item => <Button key={item.id} variant="outline" size="sm" onClick={() => setSelection({ kind: "ports", id: item.id })}>{item.hostPort}/{item.protocol} · {item.listening ? "Listening" : "Inactive"}</Button>)}</div> : <p className="text-sm text-muted-foreground">No mapped ports in this preview.</p>}</ReferenceSection>}
        <ReferenceSection title="Preview boundary"><p className="text-sm text-muted-foreground">These are fictional runtime records. Actions change this tab’s fixture only; no host process, container, network, or existing overview health snapshot changes.</p></ReferenceSection>
      </OverlayBody>
    </DetailPanel>
    {editor && snapshot && <PortEditor key={editor === "new" ? "new" : editor.id} port={editor === "new" ? undefined : editor} snapshot={snapshot} busy={busy} error={error} onClose={() => setEditor(null)} onSave={async input => {
      let saved: RuntimePort | undefined
      if (await perform(async () => { saved = await client.savePort(input, editor === "new" ? undefined : editor.id) }, "Port mapping saved in preview. No network binding changed.")) { setEditor(null); if (saved) setSelection({ kind: "ports", id: saved.id }) }
    }} />}
    <ConfirmationDialog open={!!confirmation} onOpenChange={open => { if (!open) setConfirmation(null) }} title={confirmation?.action === "remove" ? "Remove preview mapping?" : "Stop this preview item?"} description={confirmation?.action === "remove" ? "Remove only this simulated binding. The container and process remain unchanged." : "The related sample process, container, and ports will become inactive. No host operation will run."} actionLabel={confirmation?.action === "remove" ? "Remove mapping" : "Stop preview"} pending={busy} error={error} onCloseAutoFocus={restoreFocus} onConfirm={async () => {
      if (!confirmation) return
      const target = confirmation.target
      const action = confirmation.action === "remove" ? () => client.removePort(target.id) : () => client.act(target.kind === "containers" ? "container" : "process", target.id, "stop")
      if (await perform(action, `${target.name}: preview ${confirmation.action === "remove" ? "mapping removed" : "stopped"}. No host action ran.`)) { if (confirmation.action === "remove") setSelection(null); setConfirmation(null) }
    }}><p className="break-words text-sm font-medium">{confirmation?.target.name}</p></ConfirmationDialog>
  </div>
}
