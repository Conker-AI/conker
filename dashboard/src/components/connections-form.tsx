import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/status-badge"
import { serviceNames, type Connections } from "@/lib/api/config"

const labels = { memorygate: "MemoryGate", toolgate: "ToolGate", pi: "Pi" }
const descriptions = { memorygate: "Evidence and long-term memory", toolgate: "Tools, grants, and approvals", pi: "Conversations and inference" }

export function ConnectionsFields({ value, onChange }: { value: Connections; onChange: (value: Connections) => void }) {
  const [showKeys, setShowKeys] = useState(false)
  return <div className="space-y-6">
    <p className="text-sm leading-6 text-muted-foreground">Optional in this preview. Endpoints and keys stay in memory until reload. No service is contacted.</p>
    {serviceNames.map(name => <fieldset key={name} className="min-w-0 space-y-4 border-t pt-4">
      <legend className="sr-only">{labels[name]}</legend>
      <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-medium">{labels[name]}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{descriptions[name]}</p></div><StatusBadge>Not connected</StatusBadge></div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2"><Label htmlFor={`${name}-endpoint`}>Endpoint</Label><Input id={`${name}-endpoint`} type="url" placeholder={`https://${name}.example`} value={value[name].endpoint} onChange={event => onChange({ ...value, [name]: { ...value[name], endpoint: event.target.value } })} /></div>
        <div className="space-y-2"><Label htmlFor={`${name}-key`}>API key</Label><Input id={`${name}-key`} type={showKeys ? "text" : "password"} autoComplete="off" placeholder="Optional service key" value={value[name].apiKey} onChange={event => onChange({ ...value, [name]: { ...value[name], apiKey: event.target.value } })} /></div>
      </div>
    </fieldset>)}
    <Button type="button" size="sm" variant="outline" aria-pressed={showKeys} onClick={() => setShowKeys(!showKeys)}>{showKeys ? "Hide keys" : "Show keys"}</Button>
  </div>
}
