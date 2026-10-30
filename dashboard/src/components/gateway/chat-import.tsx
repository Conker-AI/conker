import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Check, FileJson, LoaderCircle, MessagesSquare, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { GATEWAY_IMPORT_LIMIT, GatewayRefusal } from '@/lib/gateway/file-transfer'
import { importRefusalMessage, importSourceNames, type GatewayImportsClient, type ImportPreview, type ImportResult, type ImportSource } from '@/lib/gateway/imports'
import { gatewayError } from '@/lib/gateway/transport'
import { cn } from '@/lib/utils'
import { GatewayPageFrame } from './page-frame'

const howTo: Record<ImportSource, string> = {
  chatgpt: 'In ChatGPT, open Settings, then Data controls, then Export data. ChatGPT emails you a link to a .zip file.',
  claude: 'In Claude, open Settings, then Privacy, then Export data. Claude emails you a link to a .zip file.',
}
const skippedLabels: Record<string, string> = {
  chatsNotMatching: 'chats in another shape', duplicateChats: 'duplicate chats', emptyChats: 'empty chats', longChats: 'chats too long to import',
  toolOrHiddenMessages: 'tool or hidden messages', emptyMessages: 'empty messages', duplicateMessages: 'duplicate messages', shortenedMessages: 'messages shortened to 50,000 characters',
}
const plural = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString()} ${count === 1 ? one : many}`
const size = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
const month = (seconds: number) => new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(new Date(seconds * 1000))

/** What memory gets, in his words; Pi's own reasons are matched, never shown as raw text. */
function memoryLine(memory: ImportPreview['memory'], offered: number, done = false) {
  if (!memory.on) return memory.reason?.includes('skipped at setup') ? 'Nothing is offered to memory: memory was skipped at setup.'
    : memory.reason?.includes('private') ? 'Nothing is offered to memory: new chats are private in Settings.' : 'Nothing is offered to memory.'
  if (!offered) return 'None of your messages are offered to memory.'
  const what = `${offered.toLocaleString()} of your messages`
  if (!memory.configured) return `${what} wait to be offered to memory, until memory is connected for imports on your server.`
  return done ? `${what} are being offered to memory.` : `${what} will be offered to memory.`
}

type Step =
  | { kind: 'idle' } | { kind: 'zip' } | { kind: 'reading' }
  | { kind: 'preview'; preview: ImportPreview } | { kind: 'importing'; preview: ImportPreview }
  | { kind: 'failed'; message: string; switchTo?: ImportSource; retry: boolean; preview?: ImportPreview }
  | { kind: 'unknown'; preview: ImportPreview } | { kind: 'done'; result: ImportResult }

/** Chats > Import: choose the source, choose conversations.json, check what it holds, then import. */
export function GatewayChatImport({ client }: { client: GatewayImportsClient }) {
  const input = useRef<HTMLInputElement>(null)
  const [source, setSource] = useState<ImportSource | null>(null), [file, setFile] = useState<File | null>(null), [step, setStep] = useState<Step>({ kind: 'idle' })
  const [note, setNote] = useState<string | null>(null), checkCard = useRef<HTMLDivElement>(null)
  // On a phone the preview lands below the fold: bring "Check and import" into view once it arrives.
  const previewed = step.kind === 'preview' ? step.preview.digest : null
  useEffect(() => {
    if (previewed) checkCard.current?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [previewed])
  async function read(selected: ImportSource, chosen: File) {
    setNote(null)
    if (/\.zip$/i.test(chosen.name) || chosen.type === 'application/zip' || chosen.type === 'application/x-zip-compressed') { setFile(null); setStep({ kind: 'zip' }); return }
    if (chosen.size > GATEWAY_IMPORT_LIMIT) { setFile(null); setStep({ kind: 'failed', message: `This file is ${size(chosen.size)}. Conker imports up to ${GATEWAY_IMPORT_LIMIT / (1024 * 1024)} MB at once.`, retry: false }); return }
    setFile(chosen); setStep({ kind: 'reading' })
    try { setStep({ kind: 'preview', preview: await client.preview(selected, chosen) }) } catch (error) {
      const other = error instanceof GatewayRefusal && error.refusal === 'wrong_format' && error.looksLike !== selected ? error.looksLike : undefined
      setStep({ kind: 'failed', message: importRefusalMessage(error, selected), switchTo: other, retry: !(error instanceof GatewayRefusal) && ['network', 'dependency', 'aborted', 'rate-limited'].includes(gatewayError(error).kind) })
    }
  }
  async function save(preview: ImportPreview) {
    if (!file || !source) return
    setNote(null); setStep({ kind: 'importing', preview })
    try { setStep({ kind: 'done', result: await client.save(source, preview.digest, file) }) } catch (error) {
      const failure = gatewayError(error)
      if (failure.kind === 'verification-cancelled') { setStep({ kind: 'preview', preview }); setNote('Import cancelled. Nothing was imported.'); return }
      // Once the file went out, an answer that never came back leaves the outcome open; importing it again is safe.
      if (!(error instanceof GatewayRefusal) && ['network', 'aborted', 'session-changed', 'dependency', 'invalid-response'].includes(failure.kind)) { setStep({ kind: 'unknown', preview }); return }
      setStep({ kind: 'failed', message: importRefusalMessage(error, source), retry: false, preview })
    }
  }
  const choose = (value: ImportSource) => { setSource(value); if (file && step.kind !== 'importing') void read(value, file) }
  const busy = step.kind === 'reading' || step.kind === 'importing'
  const preview = step.kind === 'preview' || step.kind === 'importing' || step.kind === 'unknown' ? step.preview : step.kind === 'failed' ? step.preview : undefined
  return <GatewayPageFrame><div className="mx-auto flex w-full min-w-0 max-w-2xl flex-col gap-4">
    <div><Button variant="ghost" size="sm" render={<Link to="/chats" />}><ArrowLeft />Chats</Button></div>
    <div className="space-y-1"><h2 className="text-lg font-semibold">Import from ChatGPT or Claude</h2><p className="text-sm leading-6 text-muted-foreground">Your old chats become read-only copies in Conker. You can read them; they can’t be continued.</p></div>

    {step.kind === 'done' ? <Done result={step.result} /> : <>
      <Card className="gap-3 p-4">
        <h3 className="text-sm font-medium">1. Where is it from?</h3>
        <RadioGroup value={source ?? ''} onValueChange={value => choose(value as ImportSource)} aria-label="Where the export is from" className="gap-2" disabled={busy}>
          {(['chatgpt', 'claude'] as const).map(value => <Label key={value} className={cn('flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 font-normal', source === value && 'border-foreground')}><RadioGroupItem value={value} /><span className="text-sm font-medium">{importSourceNames[value]}</span></Label>)}
        </RadioGroup>
        {source && <p className="text-sm leading-6 text-muted-foreground">{howTo[source]} Open the .zip, then choose the conversations.json file inside it below.</p>}
      </Card>

      <Card className="gap-3 p-4">
        <h3 className="text-sm font-medium">2. Choose conversations.json</h3>
        <input ref={input} type="file" accept=".json,application/json,.zip,application/zip" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={event => { const chosen = event.target.files?.[0]; event.target.value = ''; if (chosen && source) void read(source, chosen) }} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant={preview ? 'outline' : 'default'} className="min-h-11" disabled={!source || busy} onClick={() => input.current?.click()}><FileJson />{file ? 'Choose another file' : 'Choose file'}</Button>
          {file && <span className="min-w-0 truncate text-sm text-muted-foreground">{file.name} · {size(file.size)}</span>}
        </div>
        {!source && <p className="text-xs text-muted-foreground">Choose ChatGPT or Claude first.</p>}
        {step.kind === 'zip' && <p role="status" className="text-sm leading-6">That’s the whole export, a .zip file. Open it first (double-click it on a computer, or tap it in your phone’s Files app), then choose the conversations.json file from inside it.</p>}
        {step.kind === 'reading' && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />Reading {file?.name}… Nothing is saved yet.</p>}
        {step.kind === 'failed' && !step.preview && <Failure message={step.message} actions={<>{step.switchTo && file && <Button size="sm" onClick={() => choose(step.switchTo!)}>Use {importSourceNames[step.switchTo]} instead</Button>}{step.retry && file && source && <Button size="sm" variant="outline" onClick={() => void read(source, file)}>Try again</Button>}</>} />}
      </Card>

      {preview && <Card ref={checkCard} className="scroll-mt-4 gap-4 p-4" aria-live="polite">
        <h3 className="text-sm font-medium">3. Check and import</h3>
        <PreviewFacts preview={preview} />
        {note && <p role="status" className="text-sm text-muted-foreground">{note}</p>}
        {step.kind === 'unknown' && <div role="alert" className="flex gap-2 text-sm leading-6"><TriangleAlert className="mt-1 size-4 shrink-0 text-warning-foreground" /><span>Conker couldn’t confirm the import finished. Importing the same file again is safe: chats already imported are skipped. <Link className="underline underline-offset-4" to="/chats?view=imported">Check imported chats</Link></span></div>}
        {step.kind === 'failed' && <Failure message={step.message} />}
        <div className="flex flex-wrap items-center gap-3">
          {preview.chats.new + preview.chats.updated > 0
            ? <Button type="button" className="min-h-11" disabled={busy || !file} onClick={() => void save(preview)}>{step.kind === 'importing' ? <><LoaderCircle className="animate-spin motion-reduce:animate-none" />Importing…</> : step.kind === 'unknown' ? 'Import again' : `Import ${plural(preview.chats.new + preview.chats.updated, 'chat')}`}</Button>
            : <Button variant="outline" className="min-h-11" render={<Link to="/chats?view=imported" />}>Open imported chats</Button>}
          {step.kind === 'importing' ? <p role="status" className="text-sm text-muted-foreground">Keep this page open until it finishes.</p> : preview.chats.new + preview.chats.updated > 0 && <p className="text-xs text-muted-foreground">Asks for your password.</p>}
        </div>
      </Card>}
    </>}
  </div></GatewayPageFrame>
}

function Failure({ message, actions }: { message: string; actions?: ReactNode }) {
  return <div role="alert" className="space-y-2"><p className="text-sm leading-6 text-destructive-foreground">{message}</p>{actions && <div className="flex flex-wrap gap-2">{actions}</div>}</div>
}

function PreviewFacts({ preview }: { preview: ImportPreview }) {
  const skipped = Object.entries(preview.skipped).filter(([, count]) => count > 0)
  const changed = preview.chats.new + preview.chats.updated
  return <div className="space-y-3">
    <div>
      <p className="text-2xl font-semibold tabular-nums">{plural(preview.chats.inFile, 'chat')}</p>
      <p className="text-sm text-muted-foreground">{plural(preview.messages.inFile, 'message')} from {importSourceNames[preview.source]}{preview.firstAt && preview.lastAt ? `, ${month(preview.firstAt)} to ${month(preview.lastAt)}` : ''}</p>
    </div>
    <p className="text-sm leading-6">{changed === preview.chats.inFile ? preview.chats.inFile === 1 ? 'It’s new here.' : `All ${preview.chats.inFile.toLocaleString()} are new here.`
      : !changed ? preview.chats.inFile === 1 ? 'It’s already imported.' : 'All of them are already imported.'
        : [preview.chats.new && `${preview.chats.new.toLocaleString()} new`, preview.chats.updated && `${preview.chats.updated.toLocaleString()} with new messages`, preview.chats.unchanged && `${preview.chats.unchanged.toLocaleString()} already imported`].filter(Boolean).join(', ') + '.'}</p>
    {preview.sampleTitles.length > 0 && <div className="space-y-1"><p className="text-xs font-medium text-muted-foreground">Some of the chats</p><ul className="space-y-0.5 text-sm">{preview.sampleTitles.map((title, index) => <li key={index} dir="auto" className="truncate">{title}</li>)}</ul></div>}
    {changed > 0 && <p className="text-sm leading-6">{memoryLine(preview.memory, preview.messages.offeredToMemory)}</p>}
    <details className="text-xs text-muted-foreground"><summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ring">More details</summary><div className="mt-2 space-y-1 leading-5">
      <p>{plural(preview.messages.new, 'new message')}, {plural(preview.messages.yours, 'written by you', 'written by you')}. File size {size(preview.bytes)}.</p>
      {skipped.length > 0 && <p>Skipped: {skipped.map(([key, count]) => `${count.toLocaleString()} ${skippedLabels[key] ?? key}`).join(', ')}.</p>}
      <p className="break-all">File fingerprint (SHA-256): {preview.digest}. Only this exact file can be imported.</p>
    </div></details>
  </div>
}

function Done({ result }: { result: ImportResult }) {
  const parts = [result.chats.new && plural(result.chats.new, 'new chat'), result.chats.updated && `${plural(result.chats.updated, 'chat')} updated`].filter(Boolean)
  return <Card className="gap-3 p-4">
    <p role="status" className="flex items-center gap-2 text-base font-medium"><Check className="size-5" />Imported {parts.length ? parts.join(' and ') : 'nothing new'}</p>
    <p className="text-sm leading-6 text-muted-foreground">{plural(result.messages.added, 'message')} saved as read-only copies from {importSourceNames[result.source]}. {memoryLine(result.memory, result.messages.offeredToMemory, true)}</p>
    <div><Button className="min-h-11" render={<Link to="/chats?view=imported" />}><MessagesSquare />Open imported chats</Button></div>
  </Card>
}
