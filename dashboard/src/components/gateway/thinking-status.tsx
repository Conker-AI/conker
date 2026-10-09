import { useState } from 'react'
import type { RuntimeThinking } from '@/lib/gateway/runtime'
import { Button } from '@/components/ui/button'

export function ThinkingStatus({ rows, disabled, onCancel, onDiscuss }: { rows: RuntimeThinking[]; disabled: boolean; onCancel: (turnId: string) => Promise<void>; onDiscuss: (result: string) => void }) {
  const [pending, setPending] = useState(false), [error, setError] = useState('')
  const latest = rows[0]
  if (!latest) return null
  const labels: Record<RuntimeThinking['status'], string> = { running: 'Thinking in the background', completed: 'Background findings are ready', canceled: 'Background work canceled', superseded: 'Newer input replaced this background work', failed: 'Background model did not finish', interrupted: 'Background work was interrupted when Conker stopped', skipped: 'Background capacity is busy' }
  return <section aria-label="Background thinking" className="space-y-3 rounded-lg border p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><p role="status" className="text-sm font-medium">{labels[latest.status]}</p>
      {latest.status === 'running' && <Button size="sm" variant="outline" disabled={disabled || pending} onClick={async () => { setPending(true); setError(''); try { await onCancel(latest.turnId) } catch { setError('Cancellation was not confirmed. Refresh the chat before retrying.') } finally { setPending(false) } }}>Cancel thinking</Button>}
    </div>
    <p className="text-xs text-muted-foreground">{latest.model ? `${latest.provider} / ${latest.model} · ` : ''}{latest.status === 'running' ? 'You can keep talking. New input supersedes unfinished analysis.' : 'Findings are a separate model’s analysis and may need verification.'}</p>
    {latest.status === 'canceled' && <p className="text-xs text-muted-foreground">The result will be discarded. A request already at the provider may finish and count toward usage.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {latest.result && <details><summary className="cursor-pointer text-sm focus-visible:outline-2 focus-visible:outline-ring">Read findings</summary><p className="my-3 whitespace-pre-wrap break-words text-sm leading-6">{latest.result}</p><Button size="sm" variant="outline" disabled={disabled} onClick={() => onDiscuss(latest.result!)}>Discuss these findings</Button></details>}
    {rows.slice(1).filter(row => row.result).map(row => <details key={row.turnId}><summary className="cursor-pointer text-xs text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">Earlier findings · {row.model}</summary><p className="my-3 whitespace-pre-wrap break-words text-sm leading-6">{row.result}</p><Button size="sm" variant="outline" disabled={disabled} onClick={() => onDiscuss(row.result!)}>Discuss earlier findings</Button></details>)}
  </section>
}
