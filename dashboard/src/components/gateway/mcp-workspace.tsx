import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Cable, RefreshCw } from 'lucide-react'
import { CollectionLoading, CollectionPanel, CollectionRow, CollectionSection, DetailPanel, FormActions, OverlayBody, PageHeader, TaskDialogContent, WorkspaceAction } from '@/components/design-system'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ReferenceSection } from '@/components/reference-section'
import { StatusBadge } from '@/components/status-badge'
import { gatewayError } from '@/lib/gateway/transport'
import type { GatewayMcpClient, McpAccess, McpDiscovery, McpTool } from '@/lib/gateway/mcp'
import { GatewayPageFrame } from './page-frame'

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
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
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
  return <DetailPanel open onOpenChange={open => { if (!open) onClose() }} busy={pending} title={tool.name} description={tool.description || 'Imported MCP tool'}>
    <OverlayBody>
      <ReferenceSection title="Chat access"><p>{access ? access.enabled ? 'Available to this Conker chat runtime.' : 'Not available in chats yet.' : 'Checking access…'}</p><p className="text-xs text-muted-foreground">Each call requires approval in the Inbox. {tool.status === 'disabled' && 'This tool is disabled for all new calls.'}</p></ReferenceSection>
      <ReferenceSection title="Server"><p className="break-all">{tool.url}</p><p>Remote tool: {tool.tool_name}</p><p>{tool.secret_ref ? `Vault reference: ${tool.secret_ref}` : 'No credential reference'}</p></ReferenceSection>
      <ReferenceSection title="Saved definition"><p>{tool.id} · version {tool.version}</p><p className="break-all font-mono text-xs">Schema SHA-256 {tool.schema_hash}</p><p className="text-xs text-muted-foreground">Conker checks this schema before a call. If it changes, import the updated tool with a new ID and disable this one.</p></ReferenceSection>
      {error && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="outline" disabled={pending} onClick={onReload}>Reload saved tool</Button></div>}
    </OverlayBody>
    <FormActions inset><Button variant="outline" disabled={pending} onClick={() => void change('state')}>{tool.status === 'active' ? 'Disable tool' : 'Enable tool'}</Button><Button disabled={pending || !access || (tool.status !== 'active' && !access.enabled)} onClick={() => void change('access')}>{pending ? 'Saving…' : access?.enabled ? 'Remove from chats' : 'Make available in chats'}</Button></FormActions>
  </DetailPanel>
}

export function GatewayMcpWorkspace({ client }: { client: GatewayMcpClient }) {
  const [tools, setTools] = useState<McpTool[] | null>(null), [query, setQuery] = useState(''), [error, setError] = useState(''), [reload, setReload] = useState(0)
  const [connecting, setConnecting] = useState(false), [connectingBusy, setConnectingBusy] = useState(false), [notice, setNotice] = useState('')
  const [params, setParams] = useSearchParams()
  const listGeneration = useRef(0)
  const selected = tools?.find(tool => tool.id === params.get('tool'))
  useEffect(() => { const controller = new AbortController(), generation = ++listGeneration.current; client.list(controller.signal).then(value => { if (!controller.signal.aborted && generation === listGeneration.current) { setTools(value); setError('') } }).catch(cause => { if (!controller.signal.aborted && generation === listGeneration.current) setError(message(cause)) }); return () => controller.abort() }, [client, reload])
  function saved(value: McpTool) { listGeneration.current++; setTools(current => [...(current ?? []).filter(item => item.id !== value.id), value].sort((a, b) => a.name.localeCompare(b.name))); setConnecting(false); setParams({ view: 'mcp', tool: value.id }); setNotice(`Saved ${value.name}.`) }
  const rows = (tools ?? []).filter(tool => `${tool.name} ${tool.url} ${tool.description}`.toLowerCase().includes(query.toLowerCase()))
  return <GatewayPageFrame className="space-y-4">
    <PageHeader actionsOnly title="MCP tools" density="compact" actions={<><WorkspaceAction asChild><Link to="/tools">All tools</Link></WorkspaceAction><WorkspaceAction iconOnly aria-label="Refresh MCP tools" onClick={() => setReload(value => value + 1)}><RefreshCw /></WorkspaceAction><WorkspaceAction onClick={() => setConnecting(true)}><Cable />Connect server</WorkspaceAction></>} />
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!tools && !error && <CollectionLoading label="Loading MCP tools…" />}
    {tools && <CollectionPanel query={query} onQueryChange={setQuery} label="Search MCP tools" placeholder="Search tools or servers…" count={rows.length} unit={rows.length === 1 ? 'tool' : 'tools'} emptyTitle={query ? 'No matching MCP tools' : 'Connect your first MCP server'} emptyDescription={query ? 'Try another tool name or server.' : 'Discover tools from a public HTTPS server, review their inputs, then choose which ones your chats can use.'} emptyAction={!query && <Button onClick={() => setConnecting(true)}>Connect server</Button>} icon={<Cable />}>
      <CollectionSection title="Imported tools">{rows.map(tool => <CollectionRow key={tool.id} to={`/tools?view=mcp&tool=${encodeURIComponent(tool.id)}`} title={tool.name} description={tool.url} trailing={<StatusBadge tone={tool.status === 'active' ? 'live' : 'neutral'}>{tool.status === 'active' ? 'Enabled' : 'Disabled'}</StatusBadge>} />)}</CollectionSection>
    </CollectionPanel>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    <p className="text-xs text-muted-foreground">MCP calls use your existing tool approvals and execution history. Public HTTPS servers are supported; local stdio servers and MCP OAuth are not yet available.</p>
    {selected && <McpDetail key={`${selected.id}:${selected.digest}`} client={client} tool={selected} onSaved={saved} onReload={() => setReload(value => value + 1)} onClose={() => setParams({ view: 'mcp' })} />}
    <Dialog open={connecting} onOpenChange={open => { if (!connectingBusy) setConnecting(open) }}>{connecting && <TaskDialogContent title="Connect MCP server" description="Discover and review tools before adding them to Conker." size="wide" onEscapeKeyDown={event => { if (connectingBusy) event.preventDefault() }} onPointerDownOutside={event => { if (connectingBusy) event.preventDefault() }}><McpConnect client={client} onSaved={saved} onBusy={setConnectingBusy} onCancel={() => setConnecting(false)} /></TaskDialogContent>}</Dialog>
  </GatewayPageFrame>
}
