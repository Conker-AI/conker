import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { AccessState, ToolAccessState } from '@/lib/gateway/access'
import type { GatewayControlClient, ToolInventory } from '@/lib/gateway/control'
import { gatewayError } from '@/lib/gateway/transport'
import { cardLabels, cardTemplates, type CardTemplate } from '@/lib/inbox-buttons'
import { DEFAULT_ACCESS } from '@/components/gateway/access-labels'

type Tool = ToolInventory['results'][number]
type Usable = { id: string; name: string; access: ToolAccessState | null }
type Access = {
  state: AccessState | null; tools: Tool[]; usable: Usable[] | null; pending: string | null; error: string
  delegate: (enabled: boolean) => void; use: (tool: Usable, enabled: boolean) => void
  sensitive: (id: string, value: boolean) => void; card: (id: string, template: CardTemplate) => void
}

const AccessContext = createContext<Access | null>(null)

/** Every tool you have, whether Conker may use it or not, with its current switch. */
async function usableTools(client: GatewayControlClient, signal: AbortSignal): Promise<Usable[]> {
  const items = []
  let after: string | undefined
  for (let page = 0; page < 4; page++) {
    const result = await client.editorDrafts.capabilities('tool', '', after, signal)
    items.push(...result.items)
    if (!result.next_after) break
    after = result.next_after
  }
  return Promise.all(items.filter(item => !item.id.startsWith('conker.')).map(async item => ({
    id: item.id, name: item.name || item.id, access: await client.access.toolAccess(item.id, signal).catch(() => null),
  })))
}

/** One read of ToolGate's access state for the Access and Inbox rows; each switch asks for the password. */
export function AccessProvider({ client, children }: { client: GatewayControlClient; children: ReactNode }) {
  const [state, setState] = useState<AccessState | null>(null), [tools, setTools] = useState<Tool[]>([]), [usable, setUsable] = useState<Usable[] | null>(null)
  const [pending, setPending] = useState<string | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([client.access.state(controller.signal), client.tools(controller.signal)]).then(([access, inventory]) => {
      if (controller.signal.aborted) return
      setState(access); setTools(inventory.results.filter(tool => !tool.id.startsWith('conker.'))); setError('')
    }).catch(cause => { if (!controller.signal.aborted) setError(gatewayError(cause).message) })
    usableTools(client, controller.signal).then(value => { if (!controller.signal.aborted) setUsable(value) }).catch(() => { if (!controller.signal.aborted) setUsable([]) })
    return () => controller.abort()
  }, [client, retry])
  const run = useCallback(async (key: string, work: () => Promise<void>) => {
    setPending(key); setError('')
    try { await work() } catch (cause) { setError(gatewayError(cause).message) } finally { setPending(null) }
  }, [])
  const value: Access = {
    state, tools, usable, pending, error,
    delegate: enabled => void run('delegate', async () => { const saved = await client.access.setDelegate(enabled); setState(current => current && { ...current, delegate: saved }) }),
    use: (tool, enabled) => { if (tool.access) void run(`use:${tool.id}`, async () => {
      const saved = await client.access.setToolAccess(tool.id, enabled, tool.access!.digest)
      setUsable(current => current && current.map(item => item.id === tool.id ? { ...item, access: saved } : item)); setRetry(count => count + 1)
    }) },
    sensitive: (id, marked) => void run(`sensitive:${id}`, async () => {
      const saved = await client.access.setSensitive(id, marked)
      setState(current => current && { ...current, sensitive: saved ? [...current.sensitive, id] : current.sensitive.filter(item => item !== id) })
    }),
    card: (id, template) => void run(`card:${id}`, async () => {
      const saved = await client.access.setCard(id, template)
      setState(current => { if (!current) return current; const cards = { ...current.cards }; if (saved === 'do') delete cards[id]; else cards[id] = saved; return { ...current, cards } })
    }),
  }
  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>
}

function useAccess(): Access {
  const value = useContext(AccessContext)
  if (!value) throw new Error('useAccess needs an AccessProvider')
  return value
}

function Loading({ error }: { error: string }) {
  return <p role={error ? 'alert' : 'status'} className={error ? 'text-sm text-destructive-foreground' : 'text-sm text-muted-foreground'}>{error || 'Loading…'}</p>
}

function ToolList<T extends { id: string }>({ items, empty, row }: { items: T[]; empty: ReactNode; row: (item: T) => ReactNode }) {
  return items.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p>
    : <ul className="divide-y rounded-lg border">{items.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2.5">{row(item)}</li>)}</ul>
}

export function AccessDelegateBlock() {
  const { state, pending, error, delegate } = useAccess()
  if (!state) return <Loading error={error} />
  return <div className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
    <Label htmlFor="access-delegate" className="font-normal">{state.delegate ? 'On: your settings decide what runs without asking.' : 'Off: every tool follows only its own setting.'}</Label>
    <Switch id="access-delegate" checked={state.delegate} disabled={pending !== null} onCheckedChange={value => delegate(value)} />
    {error && <p role="alert" className="w-full text-sm text-destructive-foreground">{error}</p>}
  </div>
}

export function ToolsUsableBlock() {
  const { usable, pending, error, use } = useAccess()
  if (usable === null) return <Loading error={error} />
  return <ToolList items={usable} empty={<>No tools yet. <Link className="underline underline-offset-4" to="/tools">Tools</Link></>} row={tool => <>
    <Label htmlFor={`use-${tool.id}`} className="min-w-0 flex-col items-start gap-0 font-normal">
      <span className="block truncate text-sm">{tool.name}</span>
      <span className="block text-xs text-muted-foreground">{tool.access === null ? 'Couldn’t check this tool' : tool.access.enabled ? 'Conker can use it' : 'Conker can’t use it'}</span>
    </Label>
    <Switch id={`use-${tool.id}`} aria-label={`Let Conker use ${tool.name}`} checked={tool.access?.enabled ?? false} disabled={pending !== null || tool.access === null} onCheckedChange={value => use(tool, value)} />
  </>} />
}

export function AlwaysAskBlock() {
  const { state, tools, pending, error, sensitive } = useAccess()
  if (!state) return <Loading error={error} />
  return <ToolList items={tools} empty="No tools are connected yet." row={tool => {
    const marked = state.sensitive.includes(tool.id)
    return <>
      <Label htmlFor={`sensitive-${tool.id}`} className="min-w-0 flex-col items-start gap-0 font-normal">
        <span className="block truncate text-sm">{tool.name || tool.id}</span>
        <span className="block text-xs text-muted-foreground">{marked ? 'Always asks you' : `Its own setting: ${DEFAULT_ACCESS[tool.authorization ?? 'owner_confirmation']}`}</span>
      </Label>
      <Switch id={`sensitive-${tool.id}`} aria-label={`Always ask me before ${tool.name || tool.id}`} checked={marked} disabled={pending !== null} onCheckedChange={value => sensitive(tool.id, value)} />
    </>
  }} />
}

export function InboxButtonsBlock() {
  const { state, tools, pending, error, card } = useAccess()
  if (!state) return <Loading error={error} />
  const buttons = (template: CardTemplate) => `${cardLabels[template].yes} / ${cardLabels[template].no}`
  return <ToolList items={tools} empty="No tools are connected yet." row={tool => {
    const current = state.cards[tool.id] ?? 'do'
    return <>
      <span className="min-w-0 truncate text-sm">{tool.name || tool.id}</span>
      <Select value={current} disabled={pending !== null} onValueChange={value => { if (value && value !== current) card(tool.id, value as CardTemplate) }}
        items={cardTemplates.map(template => ({ value: template, label: buttons(template) }))}>
        <SelectTrigger aria-label={`Inbox buttons for ${tool.name || tool.id}`} className="w-48"><SelectValue>{buttons(current)}</SelectValue></SelectTrigger>
        <SelectContent>{cardTemplates.map(template => <SelectItem key={template} value={template}>{buttons(template)}</SelectItem>)}</SelectContent>
      </Select>
    </>
  }} />
}
