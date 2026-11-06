import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Cable, Power, PowerOff, RefreshCw } from 'lucide-react'
import { CollectionLoading, FilterChip, FormActions, InlineDetails, ListCard, ListLine, ListLineMenu, OverlayBody, PageHeader, TaskDialogContent, WorkspaceAction } from '@/components/design-system'
import { IdentityMark } from '@/components/brand/identity-mark'
import { serviceIn } from '@/components/brand/service'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ReferenceSection } from '@/components/reference-section'
import { gatewayError } from '@/lib/gateway/transport'
import type { GatewayMcpClient, McpAccess, McpDiscovery, McpTool } from '@/lib/gateway/mcp'
import { useListSelection } from '@/components/design-system/list-selection'
import { byName, useListView } from '@/components/design-system/list-view'
import { runBulk } from '@/components/design-system/list-bulk'
import { GatewayPageFrame } from './page-frame'

// Getters keep the compare helpers out of module load, so a harness that stubs imports can still
// load this file without building a real sorter; `useListView` reads them only while sorting.
const MCP_SORTS = { name: { label: 'Name', compare: byName((tool: McpTool) => tool.name) } }
const MCP_TEXT = (tool: McpTool) => [tool.name, tool.url]
const toolCount = (count: number) => count === 1 ? 'MCP tool' : `${count} MCP tools`

function message(cause: unknown) {
  const error = gatewayError(cause)
  if (error.status === 409) return 'The tool changed or this ID is already used. Reload its saved state before trying again.'
  if (error.status === 422) return 'The endpoint or tool schema is not supported. Use a public HTTPS Streamable HTTP endpoint; schema references, regular expressions and formats are not supported yet.'
  return error.message
}

function McpConnect({ client, onSaved, onBusy, onCancel }: { client: GatewayMcpClient; onSaved: (value: McpTool) => void; onBusy: (value: boolean) => void; onCancel: () => void }) {
  const [url, setUrl] = useState(''), [secret, setSecret] = useState(''), [found, setFound] = useState<McpDiscovery | null>(null)
  const [selected, setSelected] = useState(''), [id, setId] = useState(''), [pending, setPending] = useState(false), [error, setError] = useState('')
  const busy = useRef(false), mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const chosen = found?.tools.find(item => item.name === selected)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy.current) return
    busy.current = true; setPending(true); onBusy(true); setError('')
    try {
      if (found && chosen) { const result = await client.import(found, chosen.name, id, secret.trim() || null); if (mounted.current) onSaved(result) }
      else { const result = await client.discover(url.trim(), secret.trim() || null); if (mounted.current) setFound(result) }
    } catch (cause) { if (mounted.current) setError(message(cause)) }
    finally { busy.current = false; onBusy(false); if (mounted.current) setPending(false) }
  }
  return <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
    <OverlayBody>
      {!found ? <>
        <div className="space-y-2"><Label htmlFor="mcp-url">Server URL</Label><Input id="mcp-url" type="url" placeholder="https://example.com/mcp" value={url} disabled={pending} onChange={event => setUrl(event.target.value)} required /><p className="text-xs text-muted-foreground">Public HTTPS · Streamable HTTP. Local processes and private network servers are not supported yet.</p></div>
        <div className="space-y-2"><Label htmlFor="mcp-secret">Vault reference (optional)</Label><Input id="mcp-secret" placeholder="DOCS_API_TOKEN" value={secret} disabled={pending} onChange={event => setSecret(event.target.value)} /><p className="text-xs text-muted-foreground">Use a saved secret reference, never paste a password or API key here.</p></div>
      </> : <>
        <p className="break-words text-sm"><strong>{found.server.name}</strong> · {found.tools.length} tools<br /><span className="text-muted-foreground">{found.server.url}</span></p>
        {!found.tools.length && <p role="status">This server returned no compatible tools.</p>}
        {!!found.unsupportedTools?.length && <details className="text-sm"><summary className="cursor-pointer">{found.unsupportedTools.length} tools are not supported yet</summary><ul className="mt-2 space-y-2">{found.unsupportedTools.map(item => <li key={item.name}><strong>{item.name}</strong>: {item.reason}</li>)}</ul></details>}
        <div className="space-y-2"><Label htmlFor="mcp-remote-tool">Tool to import</Label><select id="mcp-remote-tool" className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm" value={selected} disabled={pending} onChange={event => { const name = event.target.value; const slug = name.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '').slice(0, 70) || 'tool'; setSelected(name); setId(`mcp.${slug.length < 2 ? `${slug}-tool` : slug}`) }}><option value="">Choose a tool</option>{found.tools.map(tool => <option key={tool.name} value={tool.name}>{tool.name}</option>)}</select></div>
        {chosen && <><p className="whitespace-pre-wrap break-words text-sm">{chosen.description}</p><div className="space-y-2"><Label htmlFor="mcp-id">Conker tool ID</Label><Input id="mcp-id" value={id} disabled={pending} onChange={event => setId(event.target.value)} required pattern="mcp\.[a-z0-9][a-z0-9.\-]{1,74}" /></div><ReferenceSection title="Input schema"><pre className="whitespace-pre-wrap break-words rounded-md border bg-muted p-3 font-mono text-xs">{JSON.stringify(chosen.inputSchema, null, 2)}</pre></ReferenceSection><p className="text-sm text-muted-foreground">Import saves this exact tool schema. You can then make it available in chats; each call requires an Inbox approval.</p></>}
      </>}
      {error && <p role="alert" className="text-sm text-destructive-foreground">{error}</p>}
    </OverlayBody>
    <FormActions inset><Button type="button" variant="outline" disabled={pending} onClick={onCancel}>Cancel</Button>{found && <Button type="button" variant="outline" disabled={pending} onClick={() => { setFound(null); setSelected(''); setError('') }}>Change server</Button>}<Button type="submit" disabled={pending || (found ? !chosen || !id : !url.trim())}>{pending ? 'Working…' : found ? 'Import tool' : 'Discover tools'}</Button></FormActions>
  </form>
}

function McpDetail({ client, tool, onSaved, onClose, onReload }: { client: GatewayMcpClient; tool: McpTool; onSaved: (value: McpTool) => void; onClose: () => void; onReload: () => void }) {
  const [access, setAccess] = useState<McpAccess | null>(null), [error, setError] = useState(''), [pending, setPending] = useState(false)
  const busy = useRef(false), mounted = useRef(true), accessGeneration = useRef(0)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    const controller = new AbortController(), generation = ++accessGeneration.current
    client.access(tool, controller.signal).then(value => {
      if (!controller.signal.aborted && generation === accessGeneration.current) { setAccess(value); setError('') }
    }).catch(cause => { if (!controller.signal.aborted && generation === accessGeneration.current) setError(message(cause)) })
    return () => controller.abort()
  }, [client, tool])
  async function change(kind: 'state' | 'access') {
    if (busy.current) return
    // A pending older access read cannot undo the result of this explicit change.
    accessGeneration.current++
    busy.current = true; setPending(true); setError('')
    try {
      if (kind === 'state') { const result = await client.setEnabled(tool, tool.status !== 'active'); if (mounted.current) onSaved(result) }
      else { const result = await client.setAccess(tool, !access?.enabled); if (mounted.current) setAccess(result) }
    } catch (cause) { if (mounted.current) setError(message(cause)) }
    finally { busy.current = false; if (mounted.current) setPending(false) }
  }
  return <InlineDetails onClose={onClose} busy={pending} title={tool.name} description={tool.description || 'Imported MCP tool'}>
    <OverlayBody>
      <ReferenceSection title="Chat access"><p>{access ? access.enabled ? 'Available to this Conker chat runtime.' : 'Not available in chats yet.' : 'Checking access…'}</p><p className="text-xs text-muted-foreground">Each call requires approval in the Inbox. {tool.status === 'disabled' && 'This tool is disabled for all new calls.'}</p></ReferenceSection>
      <ReferenceSection title="Server"><p className="break-all">{tool.url}</p><p>Remote tool: {tool.tool_name}</p><p>{tool.secret_ref ? `Vault reference: ${tool.secret_ref}` : 'No credential reference'}</p></ReferenceSection>
      <ReferenceSection title="Saved definition"><p>{tool.id} · version {tool.version}</p><p className="break-all font-mono text-xs">Schema SHA-256 {tool.schema_hash}</p><p className="text-xs text-muted-foreground">Conker checks this schema before a call. If it changes, import the updated tool with a new ID and disable this one.</p></ReferenceSection>
      {error && <div className="space-y-2"><p role="alert" className="text-sm text-destructive-foreground">{error}</p><Button variant="outline" disabled={pending} onClick={onReload}>Reload saved tool</Button></div>}
    </OverlayBody>
    <FormActions inset><Button variant="outline" disabled={pending} onClick={() => void change('state')}>{tool.status === 'active' ? 'Disable tool' : 'Enable tool'}</Button><Button disabled={pending || !access || (tool.status !== 'active' && !access.enabled)} onClick={() => void change('access')}>{pending ? 'Saving…' : access?.enabled ? 'Remove from chats' : 'Make available in chats'}</Button></FormActions>
  </InlineDetails>
}

export function GatewayMcpWorkspace({ client }: { client: GatewayMcpClient }) {
  const [tools, setTools] = useState<McpTool[] | null>(null), [error, setError] = useState(''), [reload, setReload] = useState(0)
  const [connecting, setConnecting] = useState(false), [connectingBusy, setConnectingBusy] = useState(false), [notice, setNotice] = useState('')
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState<'all' | 'active' | 'off'>('all'), [writing, setWriting] = useState(false)
  const listGeneration = useRef(0)
  const selected = tools?.find(tool => tool.id === params.get('tool'))
  useEffect(() => { const controller = new AbortController(), generation = ++listGeneration.current; client.list(controller.signal).then(value => { if (!controller.signal.aborted && generation === listGeneration.current) { setTools(value); setError('') } }).catch(cause => { if (!controller.signal.aborted && generation === listGeneration.current) setError(message(cause)) }); return () => controller.abort() }, [client, reload])
  function saved(value: McpTool) { listGeneration.current++; setTools(current => [...(current ?? []).filter(item => item.id !== value.id), value].sort((a, b) => a.name.localeCompare(b.name))); setConnecting(false); setParams({ view: 'mcp', tool: value.id }); setNotice(`Saved ${value.name}.`) }
  const rows = tools ?? []
  const activeCount = rows.filter(tool => tool.status === 'active').length, offCount = rows.length - activeCount
  // The chip a filter hides still counts its rows: All shows the whole list, chips pick a part of it.
  const showing = rows.filter(tool => filter === 'all' || (filter === 'active') === (tool.status === 'active'))
  const view = useListView(showing, { text: MCP_TEXT, sorts: MCP_SORTS })
  const selection = useListSelection(view.rows.map(tool => tool.id))
  // One async write for the row menu and the bulk bar; Undo replays it with the opposite state.
  const setEnabled = async (items: McpTool[], enabled: boolean, undo = true): Promise<void> => {
    if (!items.length) return
    setWriting(true)
    try {
      const done = await runBulk(items, item => client.setEnabled(item, enabled), { done: count => `${toolCount(count)} turned ${enabled ? 'on' : 'off'}`, failed: enabled ? 'Some tools were not turned on' : 'Some tools were not turned off' },
        undo ? results => void setEnabled(results, !enabled, false) : undefined)
      setTools(current => (current ?? []).map(tool => done.find(savedTool => savedTool.id === tool.id) ?? tool))
      selection.stop()
    } finally { setWriting(false) }
  }
  // Details open in place under the chosen tool; choosing it again closes them.
  const details = selected && <McpDetail key={`${selected.id}:${selected.digest}`} client={client} tool={selected} onSaved={saved} onReload={() => setReload(value => value + 1)} onClose={() => setParams({ view: 'mcp' })} />
  const shown = !!selected && view.rows.some(tool => tool.id === selected.id)
  const chip = (value: typeof filter, text: string, count: number) => <FilterChip key={value} active={filter === value} count={count} onClick={() => { selection.stop(); setFilter(value) }}>{text}</FilterChip>
  const picked = view.rows.filter(tool => selection.has(tool.id))
  const rowMenu = (tool: McpTool) => <ListLineMenu label={`More actions for ${tool.name}`}>
    {tool.status === 'active'
      ? <DropdownMenuItem disabled={writing} onClick={() => void setEnabled([tool], false)}><PowerOff aria-hidden="true" />Turn off</DropdownMenuItem>
      : <DropdownMenuItem disabled={writing} onClick={() => void setEnabled([tool], true)}><Power aria-hidden="true" />Turn on</DropdownMenuItem>}
  </ListLineMenu>
  return <GatewayPageFrame className="space-y-4">
    <PageHeader actionsOnly title="MCP tools" density="compact" actions={<><WorkspaceAction render={<Link to="/tools" />}>All tools</WorkspaceAction><WorkspaceAction iconOnly aria-label="Refresh MCP tools" onClick={() => setReload(value => value + 1)}><RefreshCw /></WorkspaceAction><WorkspaceAction keepVisible onClick={() => setConnecting(true)}><Cable />Connect server</WorkspaceAction></>} />
    {error && <p role="alert" className="text-sm text-destructive-foreground">{error}</p>}
    {!tools && !error && <CollectionLoading label="Loading MCP tools…" />}
    {tools && <>
      <ListCard count={view.rows.length} unit={view.rows.length === 1 ? 'tool' : 'tools'}
        query={view.query} onQueryChange={view.setQuery} label="Search MCP tools" placeholder="Search MCP tools" sort={view.sort} selection={selection}
        bulkActions={<>
          {filter !== 'off' && <Button type="button" size="sm" variant="outline" disabled={!picked.some(tool => tool.status === 'active') || writing} onClick={() => void setEnabled(picked.filter(tool => tool.status === 'active'), false)}><PowerOff />Turn off</Button>}
          {filter !== 'active' && <Button type="button" size="sm" variant="outline" disabled={!picked.some(tool => tool.status !== 'active') || writing} onClick={() => void setEnabled(picked.filter(tool => tool.status !== 'active'), true)}><Power />Turn on</Button>}
        </>}
        filters={<>{chip('all', 'All', rows.length)}{chip('active', 'Active', activeCount)}{chip('off', 'Off', offCount)}</>}
        emptyTitle={view.query.trim() || filter !== 'all' ? 'No matching MCP tools' : 'Connect your first MCP server'}
        emptyDescription={view.query.trim() || filter !== 'all' ? 'Try other words, or connect a public HTTPS server.' : 'Discover tools from a public HTTPS server, review their inputs, then choose which ones your chats can use.'}
        emptyAction={view.query.trim() || filter !== 'all' ? undefined : <Button onClick={() => setConnecting(true)}>Connect server</Button>} icon={<Cable />}>
        {view.rows.map(tool => <ListLine key={tool.id} id={tool.id} selection={selection} actions={rowMenu(tool)}
          to={selected?.id === tool.id ? '/tools?view=mcp' : `/tools?view=mcp&tool=${encodeURIComponent(tool.id)}`} expanded={selected?.id === tool.id} details={selected?.id === tool.id && details}
          icon={<IdentityMark brand={serviceIn(tool.name, tool.url)} kind="mcp" name={tool.name} />} title={tool.name} sub={tool.url} badge={tool.status === 'active' ? 'Enabled' : 'Disabled'} />)}
      </ListCard>
      <p className="text-xs text-muted-foreground">MCP calls use your existing tool approvals and execution history. Public HTTPS servers are supported; local stdio servers and MCP OAuth are not yet available.</p>
    </>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    {!shown && details}
    <Dialog open={connecting} onOpenChange={open => { if (!connectingBusy) setConnecting(open) }} disablePointerDismissal={connectingBusy}>{connecting && <TaskDialogContent title="Connect MCP server" description="Discover and review tools before adding them to Conker." size="wide"><McpConnect client={client} onSaved={saved} onBusy={setConnectingBusy} onCancel={() => setConnecting(false)} /></TaskDialogContent>}</Dialog>
  </GatewayPageFrame>
}
