import { useEffect, useRef, useState, type FormEvent } from 'react'
import { BookOpen, FileUp, Power, PowerOff, RefreshCw } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { CollectionLoading, FilterChip, FormActions, InlineDetails, ListCard, ListLine, ListLineMenu, OverlayBody, PageHeader, TaskDialogContent, WorkspaceAction } from '@/components/design-system'
import { ReferenceSection } from '@/components/reference-section'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { gatewayError } from '@/lib/gateway/transport'
import { SKILL_BROWSER_MAX_BYTES, SKILL_MAX_CHARACTERS, skillImportBytes, type GatewaySkillsClient, type SkillMetadata, type SkillRecord } from '@/lib/gateway/skills'
import { useListSelection } from '@/components/design-system/list-selection'
import { byName, byNewest, useListView } from '@/components/design-system/list-view'
import { runBulk } from '@/components/design-system/list-bulk'
import { GatewayPageFrame } from './page-frame'

const template = '---\nname: my-skill\ndescription: Describe when this skill helps.\n---\n\n# Instructions\n\nDescribe the approach and the expected result.\n'
function errorMessage(error: unknown) {
  const parsed = gatewayError(error)
  return parsed.status === 409 ? 'This skill changed elsewhere. Close this editor and inspect the latest source before replacing it. Your text is still here.' : parsed.message
}

// Getters keep the compare helpers out of module load, so a harness that stubs imports can still
// load this file without building a real sorter; `useListView` reads them only while sorting.
const SKILL_SORTS = {
  name: { label: 'Name', get compare() { return byName((row: SkillMetadata) => row.name) } },
  updated: { label: 'Recently changed', get compare() { return byNewest((row: SkillMetadata) => row.updatedAt) } },
}
const SKILL_TEXT = (row: SkillMetadata) => [row.name, row.description]
const skillCount = (count: number) => count === 1 ? 'skill' : `${count} skills`

function SkillImport({ client, replacing, onSaved, onCancel, onPending }: { client: GatewaySkillsClient; replacing: SkillRecord | null; onSaved: (record: SkillRecord) => void; onCancel: () => void; onPending: (pending: boolean) => void }) {
  const [markdown, setMarkdown] = useState(replacing?.markdown ?? template)
  const [pending, setPending] = useState(false), [reading, setReading] = useState(false), [error, setError] = useState<string | null>(null)
  const busy = useRef(false), mounted = useRef(true), fileGeneration = useRef(0)
  const characterLength = [...markdown].length
  const exceedsBrowserLimit = skillImportBytes(markdown, replacing?.revision ?? 0, replacing?.id) > SKILL_BROWSER_MAX_BYTES
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  async function readFile(file?: File) {
    if (!file) return
    const generation = ++fileGeneration.current
    setError(null)
    if (file.size > SKILL_MAX_CHARACTERS * 4) { setError('Choose a SKILL.md file with no more than 32,000 characters.'); return }
    setReading(true)
    try { const text = await file.text(); if (mounted.current && generation === fileGeneration.current) setMarkdown(text) }
    catch { if (mounted.current && generation === fileGeneration.current) setError('The file could not be read. Paste its text instead.') }
    finally { if (mounted.current && generation === fileGeneration.current) setReading(false) }
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy.current || reading) return
    busy.current = true; setPending(true); onPending(true); setError(null)
    try { const saved = await client.import(markdown, replacing?.revision ?? 0, replacing?.id); if (mounted.current) onSaved(saved) }
    catch (cause) { if (mounted.current) setError(errorMessage(cause)) }
    finally { busy.current = false; onPending(false); if (mounted.current) setPending(false) }
  }
  return <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
    <OverlayBody>
      <p className="text-sm text-muted-foreground">Choose this skill in a chat to add its instructions to one message. Import reads the Markdown only; companion files, scripts and tool permissions are not imported.</p>
      <div className="space-y-2"><Label htmlFor="skill-file">SKILL.md file</Label><Input id="skill-file" type="file" accept=".md,text/markdown,text/plain" disabled={pending || reading} onChange={event => void readFile(event.target.files?.[0])} /></div>
      <div className="space-y-2"><Label htmlFor="skill-source">Source</Label><Textarea id="skill-source" spellCheck={false} className="min-h-64 font-mono text-xs" value={markdown} disabled={pending || reading} onChange={event => setMarkdown(event.target.value)} /><p className="text-xs text-muted-foreground">YAML frontmatter needs a lowercase name and a description. {characterLength.toLocaleString()} / {SKILL_MAX_CHARACTERS.toLocaleString()} characters.</p></div>
      {exceedsBrowserLimit && <p role="alert" className="text-sm text-destructive-foreground">This source exceeds the browser import limit of 60 KiB after encoding. Shorten it or import it with the Conker CLI.</p>}
      {replacing && <p className="text-sm text-muted-foreground">Replace {replacing.name} at revision {replacing.revision}. Its current {replacing.enabled ? 'enabled' : 'disabled'} state is preserved. Keep its name unchanged.</p>}
      {error && <p role="alert" className="text-sm text-destructive-foreground">{error}</p>}
    </OverlayBody>
    <FormActions inset><Button type="button" variant="outline" disabled={pending} onClick={onCancel}>Cancel</Button><Button type="submit" disabled={pending || reading || !markdown.trim() || characterLength > SKILL_MAX_CHARACTERS || exceedsBrowserLimit}>{pending ? 'Saving…' : replacing ? 'Replace this revision' : 'Import skill'}</Button></FormActions>
  </form>
}

export function GatewaySkillsWorkspace({ client }: { client: GatewaySkillsClient }) {
  const [params, setParams] = useSearchParams(), selectedId = params.get('skill')
  const [rows, setRows] = useState<SkillMetadata[] | null>(null), [reload, setReload] = useState(0)
  const [error, setError] = useState<string | null>(null), [record, setRecord] = useState<SkillRecord | null>(null), [detailError, setDetailError] = useState<string | null>(null)
  const [editor, setEditor] = useState<{ replacing: SkillRecord | null } | null>(null), [pending, setPending] = useState(false), [notice, setNotice] = useState<string | null>(null)
  const [editorPending, setEditorPending] = useState(false)
  const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled'>('all'), [writing, setWriting] = useState(false)
  const mutating = useRef(false), mounted = useRef(true), listGeneration = useRef(0), detailGeneration = useRef(0)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    const controller = new AbortController(), generation = ++listGeneration.current
    client.list(controller.signal).then(value => { if (!controller.signal.aborted && generation === listGeneration.current) { setRows(value); setError(null) } }).catch(cause => { if (!controller.signal.aborted && generation === listGeneration.current) setError(gatewayError(cause).message) })
    return () => controller.abort()
  }, [client, reload])
  useEffect(() => {
    if (!selectedId) return
    const controller = new AbortController(), generation = ++detailGeneration.current
    client.get(selectedId, controller.signal).then(value => { if (!controller.signal.aborted && generation === detailGeneration.current) { setRecord(value); setDetailError(null) } }).catch(cause => { if (!controller.signal.aborted && generation === detailGeneration.current) setDetailError(gatewayError(cause).message) })
    return () => controller.abort()
  }, [client, selectedId, reload])
  function closeDetail() { setParams(current => { const next = new URLSearchParams(current); next.delete('skill'); return next }); setRecord(null); setDetailError(null) }
  function saved(value: SkillRecord) {
    listGeneration.current++; detailGeneration.current++
    setRows(current => [...(current ?? []).filter(row => row.id !== value.id), value].sort((a, b) => a.name.localeCompare(b.name)))
    setRecord(value); setEditor(null); setNotice(`Saved ${value.name}, revision ${value.revision}.`)
    setParams(current => { const next = new URLSearchParams(current); next.set('skill', value.id); return next })
  }
  async function toggle(value: SkillRecord) {
    if (mutating.current) return
    mutating.current = true; setPending(true); setDetailError(null)
    try { const next = await client.setEnabled(value.id, !value.enabled, value.revision); if (mounted.current) saved(next) }
    catch (cause) { if (mounted.current) setDetailError(errorMessage(cause)) }
    finally { mutating.current = false; if (mounted.current) setPending(false) }
  }
  const visible = rows ?? []
  const enabledCount = visible.filter(row => row.enabled).length, disabledCount = visible.length - enabledCount
  // The chip a filter hides still counts its rows: All shows the whole shelf, chips pick a part of it.
  const showing = visible.filter(row => filter === 'all' || (filter === 'enabled') === row.enabled)
  const view = useListView(showing, { text: SKILL_TEXT, sorts: SKILL_SORTS })
  const selection = useListSelection(view.rows.map(row => row.id))
  const selected = record?.id === selectedId ? record : null
  // One async write for the row menu and the bulk bar; Undo replays it with the opposite state.
  const setEnabled = async (items: SkillMetadata[], enabled: boolean, undo = true): Promise<void> => {
    if (!items.length) return
    setWriting(true)
    try {
      const done = await runBulk(items, item => client.setEnabled(item.id, enabled, item.revision), { done: count => `${skillCount(count)} ${enabled ? 'enabled' : 'disabled'}`, failed: enabled ? 'Some skills were not enabled' : 'Some skills were not disabled' },
        undo ? results => void setEnabled(results, !enabled, false) : undefined)
      setRows(current => (current ?? []).map(row => done.find(saved => saved.id === row.id) ?? row))
      selection.stop()
    } finally { setWriting(false) }
  }
  // Details open in place under the chosen skill; choosing it again closes them.
  const details = !!selectedId && !editor && <InlineDetails busy={pending} onClose={closeDetail} title={selected?.name ?? 'Skill source'} description={selected?.description ?? 'Inspect the saved instructions before selecting them in a chat.'}>
      <OverlayBody>{!selected && !detailError && <p role="status">Loading source…</p>}{selected && <><ReferenceSection title="Availability"><p>{selected.enabled ? 'Available in the chat skill picker.' : 'Disabled for new messages.'}</p><p className="text-xs text-muted-foreground">Revision {selected.revision}. Earlier turns retain the revision used for that turn.</p></ReferenceSection><ReferenceSection title="SKILL.md"><pre className="whitespace-pre-wrap break-words rounded-md border bg-muted p-3 font-mono text-xs">{selected.markdown}</pre></ReferenceSection><ReferenceSection title="Integrity"><p className="break-all font-mono text-xs">SHA-256 {selected.sha256}</p></ReferenceSection></>}{detailError && <div className="space-y-2"><p role="alert" className="text-sm text-destructive-foreground">{detailError}</p><Button variant="outline" disabled={pending} onClick={() => setReload(value => value + 1)}>Reload saved source</Button></div>}</OverlayBody>
      {selected && <FormActions inset><Button variant="outline" disabled={pending} onClick={() => void toggle(selected)}>{pending ? 'Saving…' : selected.enabled ? 'Disable skill' : 'Enable skill'}</Button><Button disabled={pending} onClick={() => setEditor({ replacing: selected })}>Replace source</Button></FormActions>}
  </InlineDetails>
  const shown = !!selectedId && visible.some(row => row.id === selectedId)
  const chip = (value: typeof filter, text: string, count: number) => <FilterChip key={value} active={filter === value} count={count} onClick={() => { selection.stop(); setFilter(value) }}>{text}</FilterChip>
  const picked = view.rows.filter(row => selection.has(row.id))
  const rowMenu = (row: SkillMetadata) => <ListLineMenu label={`More actions for ${row.name}`}>
    {row.enabled
      ? <DropdownMenuItem disabled={writing} onClick={() => void setEnabled([row], false)}><PowerOff aria-hidden="true" />Disable</DropdownMenuItem>
      : <DropdownMenuItem disabled={writing} onClick={() => void setEnabled([row], true)}><Power aria-hidden="true" />Enable</DropdownMenuItem>}
  </ListLineMenu>
  return <GatewayPageFrame>
    <div className="space-y-6">
      <PageHeader actionsOnly title="Skills" description="Reusable instructions you explicitly choose for a message." density="compact" actions={<WorkspaceAction keepVisible onClick={() => { setNotice(null); setEditor({ replacing: null }) }}><FileUp />Import skill</WorkspaceAction>} />
      {!rows && !error ? <CollectionLoading label="Loading skills…" /> : error ? <div className="space-y-3"><p role="alert" className="text-sm text-destructive-foreground">{error}</p><Button variant="outline" onClick={() => setReload(value => value + 1)}><RefreshCw />Reload skills</Button></div> : <>
        <ListCard count={view.rows.length} unit={skillCount(view.rows.length)}
          query={view.query} onQueryChange={view.setQuery} label="Search skills" placeholder="Search skills" sort={view.sort} selection={selection}
          bulkActions={<Button type="button" size="sm" variant="outline" disabled={!picked.length || writing} onClick={() => void setEnabled(picked, false)}><PowerOff />Disable</Button>}
          filters={<>{chip('all', 'All', visible.length)}{chip('enabled', 'Enabled', enabledCount)}{chip('disabled', 'Disabled', disabledCount)}</>}
          emptyTitle={view.query.trim() ? 'No matching skills' : filter === 'disabled' && visible.length ? 'No disabled skills' : 'No skills yet'}
          emptyDescription={view.query.trim() || filter === 'disabled' && visible.length ? 'Try other words, or import a SKILL.md file.' : 'Import a SKILL.md file, then choose it beside the model in your chat.'}
          emptyAction={view.query.trim() ? undefined : <Button onClick={() => setEditor({ replacing: null })}><FileUp />Import skill</Button>} icon={<BookOpen />}>
          {view.rows.map(row => <ListLine key={row.id} id={row.id} selection={selection} actions={rowMenu(row)}
            to={row.id === selectedId ? '/agents?tab=skills' : `/agents?tab=skills&skill=${encodeURIComponent(row.id)}`} expanded={row.id === selectedId} details={row.id === selectedId && details}
            icon={<BookOpen className="size-5 text-muted-foreground" />} title={row.name} sub={row.description} badge={row.enabled ? 'Enabled' : 'Disabled'} meta={`Revision ${row.revision}`} />)}
        </ListCard>
        <p className="text-sm text-muted-foreground">Enabled skills are available in the chat picker. They apply only when you select them; importing never runs scripts or grants tool access.</p>
      </>}
      {!shown && details}
      {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    </div>
    <Dialog open={!!editor} onOpenChange={open => { if (!open && !editorPending) setEditor(null) }}>{editor && <TaskDialogContent title={editor.replacing ? `Replace ${editor.replacing.name}` : 'Import a skill'} description="Review the instructions that will be available for your chats." size="wide" showCloseButton={!editorPending}><SkillImport client={client} replacing={editor.replacing} onSaved={saved} onCancel={() => setEditor(null)} onPending={setEditorPending} /></TaskDialogContent>}</Dialog>
  </GatewayPageFrame>
}
