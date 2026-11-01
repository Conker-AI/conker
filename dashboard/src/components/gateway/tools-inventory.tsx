import { InlineDetails, OverlayBody } from '@/components/design-system/overlays'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, RefreshCw } from 'lucide-react'
import { PageHeader, WorkspaceAction, CollectionLoading, CollectionPanel, CollectionRow, CollectionSection } from '@/components/design-system/primitives'
import { IdentityMark } from '@/components/brand/identity-mark'
import { serviceIn } from '@/components/brand/service'
import { GatewayPageFrame } from './page-frame'
import type { GatewayControlClient, ToolInventory } from '@/lib/gateway/control'
import { plainStatus } from './plain-status'
import { DescribeTool } from './describe-tool'
import { NewToolDialog } from './new-tool-dialog'
import { NotRunnableByHand, ToolRunPanel } from './tool-run'
import { workflowTool } from '@/lib/tool-run'
import { useChangeRequests } from '@/components/inbox/change-requests'

export function GatewayToolsInventory({ client }: { client: GatewayControlClient }) {
  const [value, setValue] = useState<ToolInventory | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0), [creating, setCreating] = useState(false)
  const [params, setParams] = useSearchParams()
  // Tool requests (his own and Conker's) show here as in the Inbox, with the same card.
  const requests = useChangeRequests(client.changeRequests, client.editorDrafts, true)
  useEffect(() => {
    const controller = new AbortController()
    client.tools(controller.signal).then(value => { if (!controller.signal.aborted) setValue(value) })
      .catch(() => { if (!controller.signal.aborted) setError('Tool availability could not be checked. Refresh to try again.') })
    return () => controller.abort()
  }, [client, revision])
  const selected = value?.status === 'ok' ? value.results.find(tool => tool.id === params.get('tool')) : undefined
  const rows = value?.results ?? []
  // Details open in place under the chosen tool; choosing it again closes them. A tool made in Tools
  // can be run from here; the rest list their inputs and say why not.
  const details = selected && <InlineDetails title={selected.name || 'Tool details'} onClose={() => setParams({})}>
    <OverlayBody><div className="flex flex-col gap-5">
      <p className="whitespace-pre-wrap break-words text-sm leading-6">{selected.description || 'No description supplied.'}</p>
      {workflowTool(selected.id) ? <ToolRunPanel key={selected.id} tool={selected} drafts={client.editorDrafts} /> : <div className="flex flex-col gap-3">
        <h4 className="text-sm font-medium">Inputs</h4>
        {selected.inputs.length ? <dl className="divide-y">{selected.inputs.map((input, index) => <div key={`${input.name}:${index}`} className="space-y-1 py-2 text-sm"><dt className="break-words font-medium">{input.name} · {input.type}{input.required === undefined ? '' : input.required ? ' - required' : ' - optional'}</dt>{input.description && <dd className="break-words text-muted-foreground">{input.description}</dd>}</div>)}</dl> : <p className="text-sm text-muted-foreground">No inputs declared.</p>}
        <NotRunnableByHand />
      </div>}
      <details className="text-sm text-muted-foreground"><summary className="cursor-pointer font-medium">More details</summary><code className="mt-2 block break-all text-xs">{selected.id}</code></details>
    </div></OverlayBody>
  </InlineDetails>
  const shown = selected && rows.some(tool => tool.id === selected.id)
  return <GatewayPageFrame className="space-y-4">
    <PageHeader actionsOnly title="Tools" description="Actions and workflows this workspace can offer right now." density="compact" actions={<><WorkspaceAction iconOnly aria-label="Refresh tools" title="Refresh tools" disabled={!value && !error} onClick={() => { setValue(null); setError(''); setRevision(v => v + 1) }}><RefreshCw aria-hidden="true" /></WorkspaceAction><WorkspaceAction render={<Link to="/tools?view=mcp" />}>MCP servers</WorkspaceAction><WorkspaceAction render={<Link to="/tools?view=drafts" />}>Tool drafts</WorkspaceAction><WorkspaceAction keepVisible onClick={() => setCreating(true)}><Plus aria-hidden="true" />New tool</WorkspaceAction></>} />
    <DescribeTool requests={requests} />
    {error && <p role="alert" className="text-sm text-destructive-foreground">{error}</p>}
    {!value && !error && <CollectionLoading label="Checking available tools…" />}
    {value && value.status !== 'ok' && <p role="status" className="text-sm text-muted-foreground">{value.status === 'not_configured' ? 'Tools are not set up yet.' : `Tools are ${plainStatus(value.status).toLocaleLowerCase()}. This does not mean your tool list is empty.`}</p>}
    {value?.status === 'ok' && <>
      <CollectionPanel count={rows.length} unit="tools" emptyTitle="No tools available here" emptyDescription={'The tool service is reachable, but this workspace does not currently have tools available.'}>
        <CollectionSection title="Available"><ul>{rows.map(tool => <CollectionRow key={tool.id} to={selected?.id === tool.id ? '/tools' : `/tools?tool=${encodeURIComponent(tool.id)}`} expanded={selected?.id === tool.id} details={selected?.id === tool.id && details} leading={<IdentityMark brand={serviceIn(tool.name, tool.description)} kind="tool" name={tool.name} />} title={tool.name || 'Untitled tool'} description={<span className="truncate">{tool.description || 'No description supplied.'}</span>} trailing={tool.inputs.length === 1 ? '1 input' : `${tool.inputs.length} inputs`} />)}</ul></CollectionSection>
      </CollectionPanel>
      {params.get('tool') && !selected && <p role="status" className="text-sm text-muted-foreground">This tool is no longer available here.</p>}
      {/* A linked tool hidden by the search still opens, below the list. */}
      {selected && !shown && details}
    </>}
    <p className="text-xs text-muted-foreground">Actions follow your saved permissions and approval rules. Requests that need your decision appear in the Inbox.</p>
    <NewToolDialog drafts={client.editorDrafts} open={creating} onOpenChange={setCreating} />
  </GatewayPageFrame>
}
