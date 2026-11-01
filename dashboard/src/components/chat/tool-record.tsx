import { Wrench } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { readToolRecord, type ToolRecordView } from '@/lib/chat/tool-record'

export function ToolRecord({ text, sequence }: { text: string; sequence: number }) {
  const record: ToolRecordView = readToolRecord(text)

  const statusVariant = 
    record.status === 'ok' ? 'success' :
    record.status === 'failed' || record.status === 'timed out' ? 'error' :
    record.status === 'declined' ? 'warning' :
    'outline'

  const formatDuration = (ms: number | null) => {
    if (!ms) return ''
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`
    return `${ms} ms`
  }

  return (
    <details className="group min-w-0 rounded-lg border bg-card">
      <summary 
        className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer focus-visible:outline-2 focus-visible:outline-ring"
        aria-label={`Tool ${record.label}, ${record.status}, step ${sequence}`}
      >
        <Wrench size={4} className="text-muted-foreground" />
        <span className="font-medium">{record.label}</span>
        <Badge variant={statusVariant}>{record.status}</Badge>
        <span className="truncate text-muted-foreground">{record.summary}</span>
        {record.durationMs && (
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {formatDuration(record.durationMs)}
          </span>
        )}
      </summary>
      
      <div className="border-t px-3 py-3 space-y-3">
        {record.output && (
          <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap [overflow-wrap:anywhere]">
            {record.output}
          </pre>
        )}
        
        {record.error && (
          <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap [overflow-wrap:anywhere] text-destructive-foreground">
            {record.error}
          </pre>
        )}
        
        <details className="group/details">
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
            Advanced
          </summary>
          <div className="mt-2">
            <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap [overflow-wrap:anywhere]">
              {record.raw}
            </pre>
          </div>
        </details>
      </div>
    </details>
  )
}