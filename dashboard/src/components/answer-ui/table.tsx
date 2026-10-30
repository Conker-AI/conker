import { useState, type ReactNode } from "react"
import { Check, ChevronDown, Copy, Download, Maximize2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogTrigger } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { OverlayBody, TaskDialogContent } from "@/components/design-system/overlays"
import { csvFromRows, downloadAnswerFile } from "@/lib/rich-answer"

/** One copy button with an honest result: "Copied" only after the clipboard accepted the text. */
export function CopyAction({ text, label = "Copy" }: { text: string; label?: string }) {
  const [result, setResult] = useState<{ text: string; success: boolean } | null>(null)
  const state = result?.text === text ? (result.success ? "copied" : "failed") : "idle"
  return <span className="inline-flex flex-wrap items-center gap-1">
    <Button type="button" size="sm" variant="ghost" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setResult({ text, success: true }) }
      catch { setResult({ text, success: false }) }
    }}>{state === "copied" ? <Check /> : <Copy />}{state === "copied" ? "Copied" : label}</Button>
    {state === "failed" && <span role="status" className="text-xs text-muted-foreground">Select the text to copy.</span>}
    <span className="sr-only" role="status">{state === "copied" ? "Copied to clipboard" : ""}</span>
  </span>
}

/** The answer table: Markdown copy, CSV export and a wide view. `rows` include the header row. */
export function AnswerTable({ children, rows, markdown }: { children: ReactNode; rows: string[][]; markdown: string }) {
  const csv = csvFromRows(rows)
  const [copyStatus, setCopyStatus] = useState("")
  const table = <table>{children}</table>
  return <section className="answer-block" aria-label="Response table">
    <div className="answer-block-toolbar">
      <span className="text-xs text-muted-foreground">Table</span>
      <div className="flex flex-wrap items-center justify-end gap-1">
        <CopyAction text={markdown} />
        <DropdownMenu><DropdownMenuTrigger render={<Button type="button" size="sm" variant="ghost" aria-label="Table export options" />}><Download /><ChevronDown /></DropdownMenuTrigger>
          <DropdownMenuContent align="end"><DropdownMenuItem onClick={() => { void navigator.clipboard.writeText(csv).then(() => setCopyStatus("CSV copied"), () => setCopyStatus("Clipboard unavailable. Download CSV instead.")) }}>Copy as CSV</DropdownMenuItem><DropdownMenuItem onClick={() => downloadAnswerFile(csv, "table.csv", "text/csv;charset=utf-8")}>Download CSV</DropdownMenuItem></DropdownMenuContent>
        </DropdownMenu>
        <Dialog><DialogTrigger render={<Button type="button" size="sm" variant="ghost" aria-label="Expand table" title="Expand table" />}><Maximize2 /></DialogTrigger>
          <TaskDialogContent size="wide" title="Response table" description="Scroll to inspect every column. CSV exports neutralize spreadsheet formulas."><OverlayBody><div className="rich-answer answer-table-scroll" tabIndex={0} aria-label="Expanded table">{table}</div><div className="mt-4 flex flex-wrap gap-2"><CopyAction text={markdown} label="Copy Markdown" /><CopyAction text={csv} label="Copy CSV" /><Button size="sm" variant="outline" onClick={() => downloadAnswerFile(csv, "table.csv", "text/csv;charset=utf-8")}><Download />Download CSV</Button></div></OverlayBody></TaskDialogContent>
        </Dialog>
      </div>
    </div>
    {copyStatus && <p role="status" className="px-3 text-xs text-muted-foreground">{copyStatus}</p>}
    <div className="answer-table-scroll" tabIndex={0} aria-label="Scrollable response table">{table}</div>
  </section>
}
