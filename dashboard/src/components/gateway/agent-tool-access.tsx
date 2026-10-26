import { useEffect, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ToolAccessLevel } from '@/lib/gateway/access'
import type { AgentConfiguration, GatewayControlClient, ToolInventory } from '@/lib/gateway/control'
import { DEFAULT_ACCESS, TOOL_ACCESS } from './access-labels'

type Tool = ToolInventory['results'][number]

/** This agent's setting for each tool it can use, over the tool's own setting. */
export function AgentToolAccess({ client, value, onChange, disabled, companion }: { client: GatewayControlClient; value: AgentConfiguration; onChange: (value: AgentConfiguration) => void; disabled: boolean; companion: boolean }) {
  const [tools, setTools] = useState<Tool[] | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    client.tools(controller.signal).then(inventory => { if (!controller.signal.aborted) setTools(inventory.results) }).catch(() => { if (!controller.signal.aborted) setTools([]) })
    return () => controller.abort()
  }, [client])
  // The companion can use every tool; another agent only the ones in its toolkit.
  const visible = (tools ?? []).filter(tool => companion || value.toolIds.includes(tool.id))
  const access = value.toolAccess ?? {}
  const set = (id: string, level: ToolAccessLevel | 'own') => {
    const next = { ...access }
    if (level === 'own') delete next[id]; else next[id] = level
    onChange({ ...value, toolAccess: next })
  }
  return <div className="space-y-2">
    <p className="text-sm font-medium">Access per tool</p>
    <p className="text-xs leading-5 text-muted-foreground">What this agent may do without asking you. A chat’s access switch can override it; tools set to always ask you still ask.</p>
    {tools === null ? <p role="status" className="text-xs text-muted-foreground">Loading tools…</p>
      : !visible.length ? <p className="text-xs text-muted-foreground">{companion ? 'No tools are connected yet.' : 'Add tool IDs above to set their access.'}</p>
        : <ul className="divide-y rounded-lg border">{visible.map(tool => {
          const own = `Its own: ${DEFAULT_ACCESS[tool.authorization ?? 'owner_confirmation']}`
          return <li key={tool.id} className="flex items-center justify-between gap-3 p-2.5">
            <Label htmlFor={`tool-access-${tool.id}`} className="min-w-0 flex-col items-start gap-0"><span className="block truncate text-sm">{tool.name || tool.id}</span>{tool.sensitive && <span className="block text-xs font-normal text-muted-foreground">Always asks you</span>}</Label>
            <Select disabled={disabled || tool.sensitive === true} value={access[tool.id] ?? 'own'} onValueChange={level => { if (level !== null) set(tool.id, level as ToolAccessLevel | 'own') }} items={[{ value: 'own', label: own }, ...TOOL_ACCESS]}>
              <SelectTrigger id={`tool-access-${tool.id}`} aria-label={`Access for ${tool.name || tool.id}`} className="w-40 shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="own">{own}</SelectItem>{TOOL_ACCESS.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
            </Select>
          </li>
        })}</ul>}
  </div>
}
