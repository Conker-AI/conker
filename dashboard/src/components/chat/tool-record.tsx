import { Wrench } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { readToolRecord, type ToolRecordView } from '@/lib/chat/tool-record'

const variants = { ok: 'success', failed: 'error', 'timed out': 'error', declined: 'warning', unknown: 'outline' } as const satisfies Record<ToolRecordView['status'], string>
const block = 'max-h-80 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap [overflow-wrap:anywhere]'

function duration(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`
}

/** One tool step in a chat: folded to a single readable row, opened to its output and raw record. */
export function ToolRecord({ text, sequence }: { text: string; sequence: number }) {
  const record = readToolRecord(text)
  return <details className="group min-w-0 rounded-lg border bg-card">
    <summary aria-label={`Tool ${record.label}, ${record.status}, step ${sequence}`} className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring">
      <Wrench aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <span className="shrink-0 font-medium">{record.label}</span>
      <Badge variant={variants[record.status]} className="shrink-0">{record.status}</Badge>
      {record.summary !== record.status && <span className="min-w-0 truncate text-muted-foreground">{record.summary}</span>}
      {record.durationMs !== null && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{duration(record.durationMs)}</span>}
    </summary>
    <div className="space-y-3 border-t px-3 py-3">
      {record.output && <pre className={block}>{record.output}</pre>}
      {record.error && <pre className={`${block} text-destructive-foreground`}>{record.error}</pre>}
      <details>
        <summary className="cursor-pointer rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">Advanced</summary>
        <pre className={`mt-2 ${block}`}>{record.raw}</pre>
      </details>
    </div>
  </details>
}
