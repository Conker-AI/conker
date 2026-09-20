import { useId, useState } from "react"
import { CollectionSearch } from "@/components/design-system"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useConker } from "@/lib/api/store"
import type { AgentInput } from "@/lib/api/models"
import type { CollaborationBudget } from "@/lib/api/agent-collaboration-types"
import { AgentFields } from "../agent-fields"

export function MultiChoice({ label, options, value, onChange }: { label: string; options: { id: string; label: string }[]; value: string[]; onChange: (ids: string[]) => void }) {
  const id = useId(), [query, setQuery] = useState("")
  const available = options.filter(option => option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const missing = value.filter(item => !options.some(option => option.id === item))
  return <fieldset className="min-w-0 space-y-3"><legend className="mb-2 text-sm font-medium">{label} · {value.length} selected</legend><CollectionSearch label={`Search ${label.toLocaleLowerCase()}`} placeholder={`Search ${label.toLocaleLowerCase()}…`} value={query} onChange={event => setQuery(event.target.value)} /><div className="max-h-48 space-y-3 overflow-auto rounded-md border p-3">{available.map((option, index) => <div key={option.id} className="flex items-start gap-3"><Checkbox id={`${id}-${index}`} checked={value.includes(option.id)} onCheckedChange={checked => onChange(checked === true ? [...value, option.id] : value.filter(item => item !== option.id))} /><Label htmlFor={`${id}-${index}`} className="block min-w-0 leading-5 break-words">{option.label}</Label></div>)}{missing.map((item, index) => <div key={item} className="flex items-start gap-3"><Checkbox id={`${id}-missing-${index}`} checked onCheckedChange={() => onChange(value.filter(selected => selected !== item))} /><Label htmlFor={`${id}-missing-${index}`} className="block min-w-0 leading-5 break-words">Unavailable reference · {item}</Label></div>)}{!available.length && !missing.length && <p className="text-xs text-muted-foreground">No matching options.</p>}</div></fieldset>
}

export function MemoryFields({ value, onChange, allowedScopes = ["none", "conversation", "selected"], allowedIds }: { value: AgentInput["memory"]; onChange: (memory: AgentInput["memory"]) => void; allowedScopes?: AgentInput["memory"]["scope"][]; allowedIds?: string[] }) {
  const id = useId(), memories = useConker(data => data.memories)
  return <div className="space-y-3"><Label htmlFor={id}>Memory scope</Label><Select value={value.scope} onValueChange={scope => onChange({ scope: scope as AgentInput["memory"]["scope"], memoryIds: scope === "selected" ? value.memoryIds : [] })}><SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger><SelectContent>{[...new Set([...allowedScopes, value.scope])].map(scope => <SelectItem key={scope} value={scope} disabled={!allowedScopes.includes(scope)}>{scope === "none" ? "No memory" : scope === "conversation" ? "Conversation context" : "Selected records"}</SelectItem>)}</SelectContent></Select>{value.scope === "selected" && <MultiChoice label="Memory records" options={memories.filter(memory => !allowedIds || allowedIds.includes(memory.id)).map(memory => ({ id: memory.id, label: memory.title || memory.text }))} value={value.memoryIds} onChange={memoryIds => onChange({ ...value, memoryIds })} />}</div>
}

export function ConfigurationFields({ value, onChange }: { value: AgentInput; onChange: (value: AgentInput) => void }) {
  const tools = useConker(data => data.tools)
  return <div className="grid min-w-0 items-start gap-6 lg:grid-cols-2"><AgentFields value={value} onChange={onChange} /><div className="min-w-0 space-y-6"><MultiChoice label="Tools" options={tools.map(tool => ({ id: tool.id, label: `${tool.name} · v${tool.publishedVersion}` }))} value={value.toolIds} onChange={toolIds => onChange({ ...value, toolIds })} /><MemoryFields value={value.memory} onChange={memory => onChange({ ...value, memory })} /><p className="text-xs text-muted-foreground">Only agent-visible published tools are available; publish them in Tools first. Selections name tools and do not pin versions. These are requested configuration scopes. They grant no authority and do not connect memory retrieval.</p></div></div>
}

export function BudgetFields({ value, onChange, label }: { value: CollaborationBudget; onChange: (budget: CollaborationBudget) => void; label: string }) {
  const id = useId()
  return <fieldset className="space-y-3"><legend className="mb-2 text-sm font-medium">{label}</legend><div className="grid gap-3 sm:grid-cols-3">{([{ key: "maxTurns", label: "Maximum turns", min: 1, max: 200 }, { key: "maxTokens", label: "Maximum tokens", min: 1, max: 1000000 }, { key: "maxCostCents", label: "Maximum cost (cents)", min: 0, max: 1000000 }] as const).map(field => <div key={field.key} className="space-y-2"><Label htmlFor={`${id}-${field.key}`}>{field.label}</Label><Input id={`${id}-${field.key}`} type="number" required min={field.min} max={field.max} step={1} value={value[field.key]} onChange={event => onChange({ ...value, [field.key]: Number(event.target.value) })} /></div>)}</div><p className="text-xs text-muted-foreground">Zero cents means no paid usage. These preview limits are not live metering.</p></fieldset>
}
