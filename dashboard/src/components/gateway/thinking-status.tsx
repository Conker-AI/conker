import { useState } from 'react'
import type { RuntimeMessage, RuntimeThinking } from '@/lib/gateway/runtime'
import { Button } from '@/components/ui/button'

function RequestedMessage({ row, messages }: { row: RuntimeThinking; messages: RuntimeMessage[] }) {
  const origin = messages.find(message => message.id === row.inputMessageId)
  if (origin?.content.kind !== 'text') return null
  const earlier = messages.some(message => message.role === 'user' && message.sequence > origin.sequence)
  return <p className="line-clamp-2 text-sm text-muted-foreground">{earlier ? 'For your earlier message: ' : 'For your message: '}{origin.content.text.slice(0, 180)}</p>
}

export function ThinkingStatus({ rows, messages = [], disabled, onCancel, onDiscuss }: { rows: RuntimeThinking[]; messages?: RuntimeMessage[]; disabled: boolean; onCancel: (turnId: string) => Promise<void>; onDiscuss: (result: string) => void }) {
  const [pending, setPending] = useState(false), [error, setError] = useState('')
  const latest = rows[0]
  if (!latest) return null
  const labels: Record<RuntimeThinking['status'], string> = { queued: 'Thinking is queued', running: 'Thinking in the background', completed: 'Background findings are ready', canceled: 'Background work canceled', superseded: 'A newer Think request replaced this work', failed: 'Background model did not finish', interrupted: 'Background work was interrupted when Conker stopped', skipped: 'Background capacity is busy' }
  const working = latest.status === 'running' || latest.status === 'queued'
  return <section aria-label="Background thinking" className="space-y-3 rounded-lg border p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><p role="status" className="text-sm font-medium">{labels[latest.status]}</p>
      {working && <Button size="sm" variant="outline" disabled={disabled || pending} onClick={async () => { setPending(true); setError(''); try { await onCancel(latest.turnId) } catch { setError('Cancellation was not confirmed. Refresh the chat before retrying.') } finally { setPending(false) } }}>Cancel thinking</Button>}
    </div>
    <RequestedMessage row={latest} messages={messages} />
    <p className="text-xs text-muted-foreground">{latest.model ? `${latest.provider} / ${latest.model} · ` : ''}{working ? 'You can keep talking. Answers get priority on shared local capacity.' : 'Findings are a separate model’s analysis and may need verification.'}</p>
    {latest.status === 'canceled' && <p className="text-xs text-muted-foreground">Further results are discarded. Work already performed may count toward usage.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {latest.result && <details><summary className="cursor-pointer text-sm focus-visible:outline-2 focus-visible:outline-ring">Read findings</summary><p className="my-3 whitespace-pre-wrap break-words text-sm leading-6">{latest.result}</p><Button size="sm" variant="outline" disabled={disabled} onClick={() => onDiscuss(latest.result!)}>Discuss these findings</Button></details>}
    {rows.slice(1).filter(row => row.result).map(row => <details key={row.turnId}><summary className="cursor-pointer text-xs text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">Earlier findings · {row.model}</summary><RequestedMessage row={row} messages={messages} /><p className="my-3 whitespace-pre-wrap break-words text-sm leading-6">{row.result}</p><Button size="sm" variant="outline" disabled={disabled} onClick={() => onDiscuss(row.result!)}>Discuss earlier findings</Button></details>)}
  </section>
}
