import { useEffect, useRef, useState } from 'react'
import { LayoutTemplate, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { CollectionLoading, ConfirmationDialog, FilterChip, FormActions, InlineDetails, ListCard, ListLine, ListLineMenu, OverlayBody, PageHeader, TaskDialogContent, WorkspaceAction } from '@/components/design-system'
import { byName, byNewest, useListView } from '@/components/design-system/list-view'
import { ReferenceSection } from '@/components/reference-section'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { blankTemplate, editorFrom, FIELD_TYPE_LABELS } from '@/lib/chat/template-editor'
import { isStaleTemplate, promptMessage } from '@/lib/gateway/prompt-errors'
import { TEMPLATE_LIMITS, toPromptTemplate, type PiTemplate, type PromptTemplatesClient } from '@/lib/gateway/prompt-templates'
import { gatewayError } from '@/lib/gateway/transport'
import { GatewayPageFrame } from './page-frame'
import { PromptTemplateEditor } from './prompt-template-editor'
import { replaceTemplates } from './template-store'

const SORTS = {
  name: { label: 'Name', compare: byName((row: PiTemplate) => row.name) },
  updated: { label: 'Recently changed', compare: byNewest((row: PiTemplate) => row.updatedAt) },
}
const TEXT = (row: PiTemplate) => [row.name, row.description, ...row.fields.map(field => field.label)]
const fieldCount = (row: PiTemplate) => `${row.fields.length} ${row.fields.length === 1 ? 'field' : 'fields'}`

/** Prompt templates: list, make, change and delete the forms a request can start from. Pi owns them; the composer picker and the wand read the same list. */
export function GatewayPromptTemplates({ client }: { client: PromptTemplatesClient }) {
  const [params, setParams] = useSearchParams(), selectedId = params.get('template')
  const [rows, setRows] = useState<PiTemplate[] | null>(null), [error, setError] = useState<string | null>(null), [reload, setReload] = useState(0)
  const [editor, setEditor] = useState<{ template: PiTemplate | null } | null>(null), [editorPending, setEditorPending] = useState(false)
  const [removing, setRemoving] = useState<PiTemplate | null>(null), [removePending, setRemovePending] = useState(false), [removeError, setRemoveError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'starters' | 'mine'>('all'), [notice, setNotice] = useState<string | null>(null)
  const generation = useRef(0)
  useEffect(() => {
    const controller = new AbortController(), mine = ++generation.current
    client.list(controller.signal).then(page => { if (mine === generation.current) { setRows(page.items); setError(null); replaceTemplates(page.items.map(toPromptTemplate)) } })
      .catch(cause => { if (!controller.signal.aborted && mine === generation.current) setError(gatewayError(cause).message) })
    return () => controller.abort()
  }, [client, reload])
  const publish = (next: PiTemplate[]) => { generation.current++; setRows(next); replaceTemplates(next.map(toPromptTemplate)) }
  const select = (id: string | null) => setParams(current => { const next = new URLSearchParams(current); if (id) next.set('template', id); else next.delete('template'); return next })

  const visible = rows ?? []
  const starters = visible.filter(row => row.starter).length
  const showing = visible.filter(row => filter === 'all' || (filter === 'starters') === row.starter)
  const view = useListView(showing, { text: TEXT, sorts: SORTS })
  const selected = visible.find(row => row.id === selectedId) ?? null
  const full = visible.length >= TEMPLATE_LIMITS.templates

  const saved = (template: PiTemplate) => {
    const exists = visible.some(row => row.id === template.id)
    publish(exists ? visible.map(row => row.id === template.id ? template : row) : [...visible, template])
    setEditor(null); setNotice(`Saved ${template.name}.`); select(template.id)
  }
  const remove = async () => {
    if (!removing || removePending) return
    setRemovePending(true); setRemoveError(null)
    try {
      await client.remove(removing.id, removing.revision)
      publish(visible.filter(row => row.id !== removing.id)); setNotice(`Deleted ${removing.name}.`)
      if (selectedId === removing.id) select(null)
      setRemoving(null)
    } catch (cause) { setRemoveError(promptMessage(cause)); if (isStaleTemplate(cause)) setReload(value => value + 1) }
    finally { setRemovePending(false) }
  }
  const rowMenu = (row: PiTemplate) => <ListLineMenu label={`More actions for ${row.name}`}>
    <DropdownMenuItem onClick={() => { setNotice(null); setEditor({ template: row }) }}><Pencil aria-hidden="true" />Edit</DropdownMenuItem>
    <DropdownMenuItem onClick={() => { setRemoveError(null); setRemoving(row) }}><Trash2 aria-hidden="true" />Delete</DropdownMenuItem>
  </ListLineMenu>
  const chip = (value: typeof filter, text: string, count: number) => <FilterChip key={value} active={filter === value} count={count} onClick={() => setFilter(value)}>{text}</FilterChip>
  const startNew = () => { setNotice(null); setEditor({ template: null }) }

  const details = selected && <InlineDetails onClose={() => select(null)} title={selected.name} description={selected.description || 'No description.'}>
    <OverlayBody>
      <ReferenceSection title="Fields">
        <ul className="space-y-1.5 text-sm">{selected.fields.map(field => <li key={field.id}><span className="font-medium">{field.label}</span> <span className="text-muted-foreground">{FIELD_TYPE_LABELS[field.type]}{field.required ? ', needed' : ''}{field.type === 'choice' && field.options ? `: ${field.options.join(', ')}` : ''}</span></li>)}</ul>
      </ReferenceSection>
      <p className="text-xs text-muted-foreground">Version {selected.revision}.{selected.starter ? ' A starter: change or delete it like your own. A deleted starter does not come back.' : ''}</p>
    </OverlayBody>
    <FormActions inset><Button variant="outline" onClick={() => { setRemoveError(null); setRemoving(selected) }}>Delete</Button><Button onClick={() => { setNotice(null); setEditor({ template: selected }) }}>Edit</Button></FormActions>
  </InlineDetails>

  return <GatewayPageFrame>
    <div className="space-y-6">
      <PageHeader actionsOnly title="Prompt templates" description="Forms for a request. Pick one beside the message box, or let the wand fill one from your draft." density="compact"
        actions={<WorkspaceAction keepVisible disabled={full || !rows} onClick={startNew}><Plus />New template</WorkspaceAction>} />
      {!rows && !error ? <CollectionLoading label="Loading templates…" /> : error ? <div className="space-y-3"><p role="alert" className="text-sm text-destructive-foreground">{error}</p><Button variant="outline" onClick={() => setReload(value => value + 1)}><RefreshCw />Reload templates</Button></div> : <>
        <ListCard count={view.rows.length} unit={view.rows.length === 1 ? 'template' : 'templates'} query={view.query} onQueryChange={view.setQuery} label="Search templates" placeholder="Search templates" sort={view.sort}
          filters={<>{chip('all', 'All', visible.length)}{chip('starters', 'Starters', starters)}{chip('mine', 'Mine', visible.length - starters)}</>}
          emptyTitle={view.query.trim() ? 'No matching templates' : visible.length ? 'Nothing here' : 'No templates yet'}
          emptyDescription={view.query.trim() || visible.length ? 'Try other words, or another filter.' : 'Make a template, then pick it beside your message.'}
          emptyAction={view.query.trim() || visible.length ? undefined : <Button onClick={startNew}><Plus />New template</Button>} icon={<LayoutTemplate />}>
          {view.rows.map(row => <ListLine key={row.id} id={row.id} to={row.id === selectedId ? '/agents?tab=templates' : `/agents?tab=templates&template=${encodeURIComponent(row.id)}`} expanded={row.id === selectedId} details={row.id === selectedId && details}
            icon={<LayoutTemplate className="size-5 text-muted-foreground" />} title={row.name} sub={row.description || undefined} badge={row.starter ? 'Starter' : undefined} meta={fieldCount(row)} actions={rowMenu(row)} />)}
        </ListCard>
        {full && <p className="text-sm text-muted-foreground">You have {TEMPLATE_LIMITS.templates} templates, the most there can be. Delete one to make another.</p>}
      </>}
      {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    </div>
    <Dialog open={!!editor} onOpenChange={open => { if (!open && !editorPending) setEditor(null) }}>
      {editor && <TaskDialogContent title={editor.template ? `Edit ${editor.template.name}` : 'New template'} description="A template is a form for one kind of request. Each field you add becomes a line in the request." size="wide" showCloseButton={!editorPending}>
        <PromptTemplateEditor client={client} template={editor.template} initial={editor.template ? editorFrom(editor.template) : blankTemplate()} onSaved={saved} onCancel={() => setEditor(null)} onPending={setEditorPending} />
      </TaskDialogContent>}
    </Dialog>
    <ConfirmationDialog open={!!removing} onOpenChange={open => { if (!open) setRemoving(null) }} title={removing ? `Delete ${removing.name}?` : 'Delete template?'}
      description={removing?.starter ? 'This starter will not come back. This cannot be undone.' : 'This cannot be undone.'} actionLabel="Delete template" pending={removePending} error={removeError} onConfirm={remove} />
  </GatewayPageFrame>
}
