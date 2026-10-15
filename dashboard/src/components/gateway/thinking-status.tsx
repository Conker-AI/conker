import { useLayoutEffect, useRef, type MouseEvent } from 'react'
import type { RuntimeMessage, RuntimeThinking } from '@/lib/gateway/runtime'
import { Button } from '@/components/ui/button'
import type { ThinkingCancellationState } from './thinking-cancellation'

type ActionFocus = { turnId: string; node: HTMLButtonElement }
function restoreThinkingActionFocus(action: ActionFocus, turnId: string | undefined, disabled: boolean, status: HTMLParagraphElement | null) {
  if (disabled || action.turnId !== turnId) return true
  if (action.node.isConnected) return false
  if (document.activeElement === document.body && status?.isConnected && !document.querySelector('[role="dialog"][data-state="open"]')) status.focus()
  return true
}

function RequestedMessage({ row, messages }: { row: RuntimeThinking; messages: RuntimeMessage[] }) {
  const origin = messages.find(message => message.id === row.inputMessageId)
  if (origin?.content.kind !== 'text') return null
  const earlier = messages.some(message => message.role === 'user' && message.sequence > origin.sequence)
  return <p className="line-clamp-2 text-sm text-muted-foreground">{earlier ? 'For your earlier message: ' : 'For your message: '}{origin.content.text.slice(0, 180)}</p>
}

export function ThinkingStatus({ rows, messages = [], disabled, cancellation, onCancel, onRefresh, onDiscuss }: { rows: RuntimeThinking[]; messages?: RuntimeMessage[]; disabled: boolean; cancellation: ThinkingCancellationState; onCancel: (turnId: string) => Promise<void>; onRefresh: (turnId: string) => Promise<void>; onDiscuss: (result: string) => void }) {
  const actionFocus = useRef<ActionFocus | null>(null), status = useRef<HTMLParagraphElement>(null)
  const latest = rows[0]
  useLayoutEffect(() => {
    if (actionFocus.current && restoreThinkingActionFocus(actionFocus.current, latest?.turnId, disabled, status.current)) actionFocus.current = null
  })
  if (!latest) return null
  const rememberFocus = (event: MouseEvent<HTMLButtonElement>) => { actionFocus.current = document.activeElement === event.currentTarget ? { turnId: latest.turnId, node: event.currentTarget } : null }
  const pending = cancellation.turnId === latest.turnId ? cancellation.pending : null
  const error = cancellation.turnId === latest.turnId ? cancellation.error : null
  const labels: Record<RuntimeThinking['status'], string> = { queued: 'Thinking is queued', running: 'Thinking in the background', completed: 'Background findings are ready', canceled: 'Background work canceled', superseded: 'A newer Think request replaced this work', failed: 'Background model did not finish', interrupted: 'Background work was interrupted when Conker stopped', skipped: 'Background capacity is busy' }
  const working = latest.status === 'running' || latest.status === 'queued'
  return <section aria-label="Background thinking" className="space-y-3 rounded-lg border p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><p ref={status} tabIndex={-1} role="status" className="text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">{labels[latest.status]}</p>
      {working && !error && <Button size="sm" variant="outline" disabled={disabled || !!pending} onClick={event => { rememberFocus(event); void onCancel(latest.turnId) }}>{pending === 'cancel' ? 'Canceling thinking…' : 'Cancel thinking'}</Button>}
    </div>
    <RequestedMessage row={latest} messages={messages} />
    <p className="text-xs text-muted-foreground">{latest.model ? `${latest.provider} / ${latest.model} · ` : ''}{working ? 'You can keep talking. Answers get priority on shared local capacity.' : 'Findings are a separate model’s analysis and may need verification.'}</p>
    {latest.status === 'canceled' && <p className="text-xs text-muted-foreground">Further results are discarded. Work already performed may count toward usage.</p>}
    {working && error && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{error === 'uncertain' ? 'Cancellation was not confirmed. Work may still be running.' : 'Thinking status could not be confirmed. Work may still be running.'}</p><Button size="sm" variant="outline" disabled={disabled || !!pending} onClick={event => { rememberFocus(event); void onRefresh(latest.turnId) }}>{pending === 'refresh' ? 'Checking thinking status…' : 'Check thinking status'}</Button><p className="text-xs text-muted-foreground">Checking only reads the latest status. You can keep talking.</p></div>}
    {latest.result && <details><summary className="cursor-pointer text-sm focus-visible:outline-2 focus-visible:outline-ring">Read findings</summary><p className="my-3 whitespace-pre-wrap break-words text-sm leading-6">{latest.result}</p><Button size="sm" variant="outline" disabled={disabled} onClick={() => onDiscuss(latest.result!)}>Discuss these findings</Button></details>}
    {rows.slice(1).filter(row => row.result).map(row => <details key={row.turnId}><summary className="cursor-pointer text-xs text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">Earlier findings · {row.model}</summary><RequestedMessage row={row} messages={messages} /><p className="my-3 whitespace-pre-wrap break-words text-sm leading-6">{row.result}</p><Button size="sm" variant="outline" disabled={disabled} onClick={() => onDiscuss(row.result!)}>Discuss earlier findings</Button></details>)}
  </section>
}
