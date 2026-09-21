import { useEffect, useRef, useState } from "react"
import { Dialog } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TaskDialogContent, OverlayBody, FormActions } from "@/components/design-system"
import type { PortMappingInput, RuntimePort, SystemRuntimeSnapshot } from "@/lib/api/system-runtime-types"
import { validatePortMapping } from "@/lib/api/system-runtime-fixture"

export function PortEditor({ port, snapshot, busy, error, onSave, onClose }: { port?: RuntimePort; snapshot: SystemRuntimeSnapshot; busy: boolean; error: string; onSave: (input: PortMappingInput) => Promise<void>; onClose: () => void }) {
  const [value, setValue] = useState<PortMappingInput>(() => ({ containerId: port?.containerId || snapshot.containers[0]?.id || "", hostAddress: port?.hostAddress || "127.0.0.1", hostPort: port?.hostPort || 8081, containerPort: port?.targetPort || 8080, protocol: port?.protocol || "tcp" }))
  const [validation, setValidation] = useState("")
  const alert = useRef<HTMLParagraphElement>(null)
  useEffect(() => { if (validation || error) alert.current?.scrollIntoView({ block: "nearest" }) }, [validation, error])
  const change = <K extends keyof PortMappingInput>(key: K, next: PortMappingInput[K]) => { setValue(current => ({ ...current, [key]: next })); setValidation("") }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
    <TaskDialogContent title={port ? "Edit port mapping" : "New port mapping"} description="Simulated container binding · no network or firewall change." showCloseButton={!busy} onInteractOutside={event => event.preventDefault()}>
      <form className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={event => {
        event.preventDefault()
        try { validatePortMapping(value, snapshot, port?.id); setValidation(""); void onSave(value) }
        catch (cause) { setValidation(cause instanceof Error ? cause.message : "Check this mapping.") }
      }}>
        <OverlayBody><fieldset disabled={busy} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="mapping-container">Container</Label><Select value={value.containerId} onValueChange={next => change("containerId", next)} disabled={busy}><SelectTrigger id="mapping-container" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{snapshot.containers.map(item => <SelectItem key={item.id} value={item.id}>{item.name} · {item.status}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label htmlFor="mapping-address">Host address</Label><Select value={value.hostAddress} onValueChange={next => change("hostAddress", next as PortMappingInput["hostAddress"])} disabled={busy}><SelectTrigger id="mapping-address" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="127.0.0.1">127.0.0.1 · Loopback</SelectItem><SelectItem value="0.0.0.0">0.0.0.0 · All interfaces</SelectItem></SelectContent></Select><p className="text-xs text-muted-foreground">All interfaces describes the draft only; it does not expose a real service.</p></div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="mapping-host-port">Host port</Label><Input id="mapping-host-port" type="number" min={1} max={65535} required value={Number.isNaN(value.hostPort) ? "" : value.hostPort} onChange={event => change("hostPort", event.target.valueAsNumber)} /></div><div className="space-y-2"><Label htmlFor="mapping-target-port">Container port</Label><Input id="mapping-target-port" type="number" min={1} max={65535} required value={Number.isNaN(value.containerPort) ? "" : value.containerPort} onChange={event => change("containerPort", event.target.valueAsNumber)} /></div></div>
          <div className="space-y-2"><Label htmlFor="mapping-protocol">Protocol</Label><Select value={value.protocol} onValueChange={next => change("protocol", next as PortMappingInput["protocol"])} disabled={busy}><SelectTrigger id="mapping-protocol" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="tcp">TCP</SelectItem><SelectItem value="udp">UDP</SelectItem></SelectContent></Select></div>
          <p className="text-xs text-muted-foreground">Stopped mappings still reserve their host port in this preview.</p>
          {(validation || error) && <p ref={alert} role="alert" className="text-sm text-destructive">{validation || error}</p>}
        </fieldset></OverlayBody>
        <FormActions inset description="Preview changes reset on reload."><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy}>{busy ? "Saving…" : "Save mapping"}</Button></FormActions>
      </form>
    </TaskDialogContent>
  </Dialog>
}
