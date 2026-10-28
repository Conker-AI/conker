import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cardLabels, cardTemplates, type CardTemplate } from '@/lib/inbox-buttons'
import { PageHeader, WorkspaceSection } from '@/components/design-system/primitives'
import type { AccessState, ToolAccessState } from '@/lib/gateway/access'
import type { GatewayControlClient, ToolInventory } from '@/lib/gateway/control'
import { gatewayError } from '@/lib/gateway/transport'
import { GatewayPageFrame } from './page-frame'
import { DEFAULT_ACCESS } from './access-labels'

type Tool = ToolInventory['results'][number]
type Usable = { id: string; name: string; description: string; access: ToolAccessState | null }

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
    id: item.id, name: item.name || item.id, description: item.description,
    access: await client.access.toolAccess(item.id, signal).catch(() => null),
  })))
}

/** Settings, Access: whether Conker decides by your settings, and the tools that always ask you. */
export function GatewayAccessSettings({ client }: { client: GatewayControlClient }) {
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
  async function delegate(enabled: boolean) {
    setPending('delegate'); setError('')
    try { const value = await client.access.setDelegate(enabled); setState(current => current && { ...current, delegate: value }) }
    catch (cause) { setError(gatewayError(cause).message) }
    finally { setPending(null) }
  }
  async function use(tool: Usable, value: boolean) {
    if (!tool.access) return
    setPending(`use:${tool.id}`); setError('')
    try {
      const saved = await client.access.setToolAccess(tool.id, value, tool.access.digest)
      setUsable(current => current && current.map(item => item.id === tool.id ? { ...item, access: saved } : item))
      setRetry(count => count + 1)
    } catch (cause) { setError(gatewayError(cause).message) }
    finally { setPending(null) }
  }
  async function sensitive(id: string, value: boolean) {
    setPending(id); setError('')
    try {
      const saved = await client.access.setSensitive(id, value)
      setState(current => current && { ...current, sensitive: saved ? [...current.sensitive, id] : current.sensitive.filter(item => item !== id) })
    } catch (cause) { setError(gatewayError(cause).message) }
    finally { setPending(null) }
  }
  async function card(id: string, template: CardTemplate) {
    setPending(`card:${id}`); setError('')
    try {
      const saved = await client.access.setCard(id, template)
      setState(current => {
        if (!current) return current
        const cards = { ...current.cards }
        if (saved === 'do') delete cards[id]
        else cards[id] = saved
        return { ...current, cards }
      })
    } catch (cause) { setError(gatewayError(cause).message) }
    finally { setPending(null) }
  }
  const buttons = (template: CardTemplate) => `${cardLabels[template].yes} / ${cardLabels[template].no}`
  if (!state) return <GatewayPageFrame>{error ? <div className="space-y-2"><p role="alert">{error}</p><Button variant="outline" onClick={() => setRetry(value => value + 1)}>Try again</Button></div> : <p role="status">Loading access settings…</p>}</GatewayPageFrame>
  return <GatewayPageFrame><div className="max-w-3xl space-y-6">
    <PageHeader title="Access" description="What Conker may do without asking you. Your settings decide; the AI never changes them." />
    <WorkspaceSection title="Let Conker decide by your settings">
      <div className="flex items-start justify-between gap-4">
        <Label htmlFor="access-delegate" className="min-w-0 flex-col items-start gap-1">
          <span className="text-sm">{state.delegate ? 'On' : 'Off'}</span>
          <span className="text-sm font-normal leading-6 text-muted-foreground">{state.delegate
            ? 'Your chat switch, each agent’s settings and each tool’s own setting decide what runs without asking. What ran is listed in Inbox, Handled.'
            : 'Off: every tool follows only its own setting, and anything that asks, asks you. Conker’s memories and cron jobs still follow your settings.'}</span>
        </Label>
        <Switch id="access-delegate" checked={state.delegate} disabled={pending !== null} onCheckedChange={value => void delegate(value)} />
      </div>
    </WorkspaceSection>
    <WorkspaceSection title="How it decides" description="The most specific setting wins: this chat’s switch, then the agent’s setting for the tool, then the tool’s own.">
      <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
        <li>Reading and searching are free. Remembering and making cron jobs are free and listed in Handled.</li>
        <li>When you typed the request yourself, an action that matches your words goes ahead.</li>
        <li>Tools marked “Always ask me” below, and system controls, always ask you, whatever else says.</li>
        <li>After a chat reads outside content (a web page, an email, someone’s message), it is one step stricter.</li>
      </ul>
    </WorkspaceSection>
    <WorkspaceSection title="Tools Conker can use" description="Off: Conker can’t see or call the tool at all. On: your settings above decide whether it asks you first.">
      {usable === null ? <p role="status" className="text-sm text-muted-foreground">Loading tools…</p>
        : usable.length === 0 ? <p className="text-sm text-muted-foreground">No tools yet. <Link className="underline underline-offset-4" to="/tools">Tools</Link></p>
        : <ul className="divide-y rounded-lg border">{usable.map(tool => <li key={tool.id} className="flex items-center justify-between gap-4 p-3">
          <Label htmlFor={`use-${tool.id}`} className="min-w-0 flex-col items-start gap-0">
            <span className="block truncate text-sm">{tool.name}</span>
            <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{tool.access === null ? 'Couldn’t check this tool' : tool.access.enabled ? 'Conker can use it' : 'Conker can’t use it'}</span>
          </Label>
          <Switch id={`use-${tool.id}`} aria-label={`Let Conker use ${tool.name}`} checked={tool.access?.enabled ?? false} disabled={pending !== null || tool.access === null} onCheckedChange={value => void use(tool, value)} />
        </li>)}</ul>}
    </WorkspaceSection>
    <WorkspaceSection title="Always ask me" description="Turn this on for anything that spends money, deletes for good, or signs in to accounts.">
      {tools.length === 0 ? <p className="text-sm text-muted-foreground">No tools are connected yet. <Link className="underline underline-offset-4" to="/tools">Tools</Link></p>
        : <ul className="divide-y rounded-lg border">{tools.map(tool => {
          const marked = state.sensitive.includes(tool.id)
          return <li key={tool.id} className="flex items-center justify-between gap-4 p-3">
            <Label htmlFor={`sensitive-${tool.id}`} className="min-w-0 flex-col items-start gap-0">
              <span className="block truncate text-sm">{tool.name || tool.id}</span>
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{marked ? 'Always asks you' : `Its own setting: ${DEFAULT_ACCESS[tool.authorization ?? 'owner_confirmation']}`}</span>
            </Label>
            <Switch id={`sensitive-${tool.id}`} aria-label={`Always ask me before ${tool.name || tool.id}`} checked={marked} disabled={pending !== null} onCheckedChange={value => void sensitive(tool.id, value)} />
          </li>
        })}</ul>}
    </WorkspaceSection>
    <WorkspaceSection title="Inbox buttons" description="The buttons a tool’s card shows when it asks you. Change is always there. The yes button still runs only the exact action shown." divided={false}>
      {tools.length === 0 ? <p className="text-sm text-muted-foreground">No tools are connected yet.</p>
        : <ul className="divide-y rounded-lg border">{tools.map(tool => {
          const current = state.cards[tool.id] ?? 'do'
          return <li key={tool.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-3">
            <span className="min-w-0 truncate text-sm">{tool.name || tool.id}</span>
            <Select value={current} disabled={pending !== null} onValueChange={value => { if (value && value !== current) void card(tool.id, value as CardTemplate) }}
              items={cardTemplates.map(template => ({ value: template, label: buttons(template) }))}>
              <SelectTrigger aria-label={`Inbox buttons for ${tool.name || tool.id}`} className="w-48"><SelectValue>{buttons(current)}</SelectValue></SelectTrigger>
              <SelectContent>{cardTemplates.map(template => <SelectItem key={template} value={template}>{buttons(template)}</SelectItem>)}</SelectContent>
            </Select>
          </li>
        })}</ul>}
    </WorkspaceSection>
    {error && <p role="alert" className="text-sm text-destructive-foreground">{error}</p>}
  </div></GatewayPageFrame>
}
