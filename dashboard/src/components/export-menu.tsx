import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { answerFormats, exportLabels, exportNames, exportRefusalMessage, saveDownload, type AnswerExportFormat } from '@/lib/gateway/exports'
import type { GatewayDownload } from '@/lib/gateway/file-transfer'
import { useHasTable } from '@/lib/use-has-table'

export type ExportChoice = { id: string; label: string; name: string; run: () => Promise<GatewayDownload> }
/** What the owner sees after choosing: working, the saved file's name, or Pi's reason in plain words. */
export type ExportStatus = { tone: 'working' | 'done' | 'failed'; text: string }

/**
 * One Export menu for answers and artifacts. The file is made on the server and saved by the
 * browser; "Downloaded" shows only once the bytes arrived.
 */
export function ExportMenu({ choices, compact = false, disabled = false, note, onStatus }: {
  choices: readonly ExportChoice[]; compact?: boolean; disabled?: boolean; onStatus: (status: ExportStatus) => void
  /** A plain line under the choices, for what the menu can't do here. */
  note?: string
}) {
  const [pending, setPending] = useState(false)
  async function choose(choice: ExportChoice) {
    if (pending) return
    setPending(true); onStatus({ tone: 'working', text: `Making the ${choice.name}…` })
    try {
      const file = await choice.run()
      saveDownload(file); onStatus({ tone: 'done', text: `Downloaded ${file.filename}.` })
    } catch (error) { onStatus({ tone: 'failed', text: exportRefusalMessage(error) }) } finally { setPending(false) }
  }
  if (!choices.length) return null
  const label = pending ? 'Exporting…' : 'Export'
  return <DropdownMenu>
    <DropdownMenuTrigger disabled={disabled || pending} render={compact
      ? <Button type="button" size="icon" variant="ghost" aria-label={label} title={label} className="size-(--control-height-sm) shrink-0 text-muted-foreground hover:text-foreground" />
      : <Button type="button" size="sm" variant="outline" />}>
      <Download />{!compact && label}
    </DropdownMenuTrigger>
    <DropdownMenuContent align={compact ? 'start' : 'end'}><DropdownMenuGroup>
      <DropdownMenuLabel>Download as</DropdownMenuLabel>
      {choices.map(choice => <DropdownMenuItem key={choice.id} onClick={() => void choose(choice)}>{choice.label}</DropdownMenuItem>)}
    </DropdownMenuGroup>{note && <p className="max-w-60 px-2 py-1.5 text-xs leading-5 text-muted-foreground">{note}</p>}</DropdownMenuContent>
  </DropdownMenu>
}

/** The Export menu on a completed answer: Word, PDF and PowerPoint, and Excel when it has a table. */
export function AnswerExportMenu({ text, run, onStatus }: { text: string; run: (format: AnswerExportFormat) => Promise<GatewayDownload>; onStatus: (status: ExportStatus) => void }) {
  const table = useHasTable(text)
  return <ExportMenu compact choices={answerFormats(table).map(format => ({ id: format, label: exportLabels[format], name: exportNames[format], run: () => run(format) }))} onStatus={onStatus} />
}
