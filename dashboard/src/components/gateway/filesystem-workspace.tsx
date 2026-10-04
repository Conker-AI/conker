import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight, CircleAlert, File, FileQuestion, Folder, FolderOpen, Link2, RefreshCw, ShieldCheck } from 'lucide-react'
import { PageHeader, WorkspaceAction } from '@/components/design-system/primitives'
import { GatewayPageFrame } from './page-frame'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { gatewayError } from '@/lib/gateway/transport'
import { createFilesystemRequestId, type GatewayDirectory, type GatewayDirectoryEntry, type GatewayFileCatalogue, type GatewayFilesystemClient } from '@/lib/gateway/filesystem'

const storageKey = 'conker:last-filesystem-request'
const icons = { directory: Folder, file: File, symlink: Link2, other: FileQuestion } as const

function parent(path: string) {
  const parts = path.split('/').filter(Boolean)
  parts.pop()
  return parts.join('/')
}

function age(seconds: number | null) {
  if (seconds === null) return 'age unavailable'
  if (seconds < 60) return `${Math.round(seconds)}s old`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m old`
  return `${Math.round(seconds / 3600)}h old`
}

export function GatewayFilesystemWorkspace({ client }: { client: GatewayFilesystemClient }) {
  const savedRequest = useMemo(() => {
    const value = sessionStorage.getItem(storageKey)
    return value && /^[A-Za-z0-9_-]{16,100}$/.test(value) ? value : null
  }, [])
  const [catalogue, setCatalogue] = useState<GatewayFileCatalogue | null>(null)
  const [selectedRoot, setSelectedRoot] = useState('')
  const [directory, setDirectory] = useState<GatewayDirectory | null>(null)
  const [pending, setPending] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([client.roots(controller.signal), savedRequest ? client.inspect(savedRequest, controller.signal).catch(() => null) : Promise.resolve(null)]).then(([roots, saved]) => {
      if (controller.signal.aborted) return
      setCatalogue(roots)
      setDirectory(saved)
      setSelectedRoot(saved?.rootId ?? roots.roots[0]?.id ?? '')
      setPending(false)
    }).catch(cause => {
      if (!controller.signal.aborted) { setError(gatewayError(cause).message); setPending(false) }
    })
    return () => controller.abort()
  }, [client, savedRequest])

  const request = useCallback(async (rootId: string, path: string) => {
    const id = createFilesystemRequestId()
    setPending(true); setError(null)
    sessionStorage.setItem(storageKey, id)
    try { setDirectory(await client.request(id, rootId, path)) }
    catch (cause) { setError(gatewayError(cause).message) }
    finally { setPending(false) }
  }, [client])

  const inspect = useCallback(async () => {
    if (!directory) return
    setPending(true); setError(null)
    try { setDirectory(await client.inspect(directory.requestId)) }
    catch (cause) { setError(gatewayError(cause).message) }
    finally { setPending(false) }
  }, [client, directory])

  const resume = async () => {
    if (!directory) return
    setPending(true); setError(null)
    try { setDirectory(await client.resume(directory.requestId)) }
    catch (cause) { setError(gatewayError(cause).message) }
    finally { setPending(false) }
  }

  const rows = useMemo(() => [...(directory?.listing?.entries ?? [])].sort((a, b) => {
    if (a.kind === 'directory' && b.kind !== 'directory') return -1
    if (a.kind !== 'directory' && b.kind === 'directory') return 1
    return a.name.localeCompare(b.name)
  }), [directory])
  const root = catalogue?.roots.find(item => item.id === selectedRoot)
  const currentPath = directory?.rootId === selectedRoot ? directory.path : ''
  const crumbs = currentPath.split('/').filter(Boolean)

  const chooseRoot = (rootId: string) => {
    setSelectedRoot(rootId)
    setDirectory(null)
    setError(null)
  }

  return <GatewayPageFrame><div className="max-w-5xl space-y-6">
    <PageHeader actionsOnly title="Files" description="Browse names and folders inside roots configured by the server operator." density="compact" actions={root ? <WorkspaceAction disabled={pending} onClick={() => void request(root.id, currentPath)}><RefreshCw />{pending ? 'Checking…' : directory ? 'New listing' : 'Open root'}</WorkspaceAction> : undefined} />
    <div className="flex flex-wrap items-center gap-2 border-y py-3 text-xs text-muted-foreground"><ShieldCheck className="size-4" /><span>Directory listing only</span><span aria-hidden="true">·</span><span>No file contents, editing, uploads, deletes, or shell access</span></div>

    {catalogue?.mode === 'configured' && <section className="grid gap-3 sm:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] sm:items-end">
      <label className="grid gap-1.5 text-sm font-medium">Configured root
        <Select value={selectedRoot} onValueChange={chooseRoot}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{catalogue.roots.map(item => <SelectItem key={item.id} value={item.id}>{item.id}</SelectItem>)}</SelectContent></Select>
      </label>
      <div className="min-w-0"><p className="text-xs text-muted-foreground">Operator path</p><p className="mt-1 truncate font-mono text-sm" title={root?.path}>{root?.path}</p></div>
    </section>}

    {error && <div className="flex items-start gap-3 border-y py-4 text-sm text-destructive" role="alert"><CircleAlert className="mt-0.5 size-4 shrink-0" /><div><p>{error}</p>{directory && <Button className="mt-3" variant="outline" size="sm" disabled={pending} onClick={() => void inspect()}>Check saved request</Button>}</div></div>}
    {catalogue?.mode === 'unavailable' && <div className="border-y py-12 text-center"><FolderOpen className="mx-auto size-6 text-muted-foreground" /><p className="mt-3 text-sm font-medium">File browsing is unavailable</p><p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">The server reported {catalogue.code.replaceAll('_', ' ')}. Configure an explicit read-only root on the host before using this screen.</p></div>}
    {!pending && catalogue?.mode === 'configured' && !directory && !error && <div className="border-y py-12 text-center"><FolderOpen className="mx-auto size-6 text-muted-foreground" /><p className="mt-3 text-sm font-medium">Choose what to inspect</p><p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">Open the selected root to create one bounded directory request. Conker will not crawl subfolders automatically.</p></div>}

    {directory && <>
      <section className="flex flex-wrap items-center justify-between gap-3 border-b pb-4"><div className="flex flex-wrap items-center gap-2"><Badge variant={directory.state === 'complete' ? 'secondary' : directory.state === 'failed' ? 'destructive' : 'outline'}>{directory.state.replaceAll('_', ' ')}</Badge>{directory.listing?.truncated && <Badge variant="outline">Limited to {directory.limit}</Badge>}{directory.receiptStatus && <Badge variant="outline">Receipt unavailable</Badge>}</div><p className="text-xs text-muted-foreground">{age(directory.currentAgeSeconds)}</p></section>
      {directory.approvalRequired && <div className="flex flex-wrap items-center justify-between gap-3 border p-4"><div><p className="text-sm font-medium">Owner approval is required</p><p className="mt-1 text-sm text-muted-foreground">Continue this exact saved listing request. No second directory read will be created.</p></div><Button variant="outline" disabled={pending} onClick={() => void resume()}>Continue request</Button></div>}
      {directory.state === 'unknown' && <div className="flex flex-wrap items-center justify-between gap-3 border p-4"><div><p className="text-sm font-medium">The listing outcome is unknown</p><p className="mt-1 text-sm text-muted-foreground">Check the durable request without dispatching it again.</p></div><Button variant="outline" disabled={pending} onClick={() => void inspect()}>Check request</Button></div>}
      {directory.state === 'failed' && <p className="text-sm text-destructive">The saved listing failed validation. No directory data is shown.</p>}
      {directory.listing && <section aria-label="Directory contents" className="space-y-3">
        <nav aria-label="Current directory" className="flex min-h-10 flex-wrap items-center gap-1 border-b pb-3">
          <Button variant="ghost" size="sm" className="px-2 font-mono" onClick={() => void request(directory.rootId, '')}>{directory.rootId}</Button>
          {crumbs.map((crumb, index) => <span key={`${crumb}-${index}`} className="contents"><ChevronRight className="size-3.5 text-muted-foreground" aria-hidden="true" /><Button variant="ghost" size="sm" className="max-w-52 px-2 font-mono" onClick={() => void request(directory.rootId, crumbs.slice(0, index + 1).join('/'))}>{crumb}</Button></span>)}
        </nav>
        {directory.path && <Button variant="outline" size="sm" onClick={() => void request(directory.rootId, parent(directory.path))}>Up one folder</Button>}
        <div className="divide-y border-y">
          {rows.length === 0 ? <div className="py-12 text-center"><p className="text-sm font-medium">This directory is empty</p><p className="mt-1 text-sm text-muted-foreground">No names were returned in this listing.</p></div> : rows.map(item => <DirectoryRow key={item.path} item={item} pending={pending} onOpen={() => void request(directory.rootId, item.path)} />)}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground"><span>{rows.length} {rows.length === 1 ? 'entry' : 'entries'}</span><span>Sampled {new Date(directory.listing.sampledAt).toLocaleString()}</span><span>Names and kinds only</span></div>
      </section>}
    </>}
  </div></GatewayPageFrame>
}

function DirectoryRow({ item, pending, onOpen }: { item: GatewayDirectoryEntry; pending: boolean; onOpen: () => void }) {
  const Icon = icons[item.kind]
  const content = <><span className="flex size-8 shrink-0 items-center justify-center rounded-md border"><Icon className="size-4 text-muted-foreground" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.name}</span><span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">{item.path}</span></span><Badge variant="outline">{item.kind}</Badge></>
  return item.kind === 'directory'
    ? <button type="button" disabled={pending} onClick={onOpen} className="flex min-h-16 w-full items-center gap-3 px-2 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">{content}<ChevronRight className="size-4 shrink-0 text-muted-foreground" /></button>
    : <div className="flex min-h-16 items-center gap-3 px-2 py-3">{content}</div>
}
