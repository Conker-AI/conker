import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { GatewayRuntimeClient, RuntimePendingSubmission } from '@/lib/gateway/runtime'
import { gatewayError } from '@/lib/gateway/transport'

/** Metadata only: saved inputs are never copied into this recovery list. */
export function PendingSubmissions({ client, sessionId, initial, truncated, disabled, onInspect }: {
  client: GatewayRuntimeClient; sessionId: string; initial: RuntimePendingSubmission[]; truncated: boolean; disabled: boolean; onInspect: (submission: RuntimePendingSubmission) => void
}) {
  const [extra, setExtra] = useState<RuntimePendingSubmission[]>([])
  const [cursor, setCursor] = useState<string | null | undefined>(undefined)
  const [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const rows = [...new Map([...initial, ...extra].map(row => [row.requestId, row])).values()]
  const next = cursor === undefined ? truncated ? initial.at(-1)?.requestId : null : cursor
  async function more() {
    if (inFlight.current || !next || disabled) return
    inFlight.current = true; setPending(true); setError(null)
    try {
      const page = await client.listPendingSubmissions(sessionId, { cursor: next })
      setExtra(values => [...values, ...page.results]); setCursor(page.nextCursor)
    } catch (failure) { setError(gatewayError(failure).message) }
    finally { inFlight.current = false; setPending(false) }
  }
  if (!rows.length) return null
  return <details className="rounded-lg border bg-muted p-3"><summary className="cursor-pointer text-sm font-medium">Saved submissions needing review ({rows.length}{next ? '+' : ''})</summary>
    <p className="mt-3 text-xs leading-5 text-muted-foreground">These requests survived a reload. Inspect their saved state before deciding how to continue.</p>
    <ul className="mt-3 space-y-3">{rows.map(row => <li key={row.requestId} className="flex flex-wrap items-center justify-between gap-2 border-t pt-3"><div className="min-w-0 text-xs"><p className="font-medium">{row.status.replaceAll('_', ' ')}</p><p className="break-all text-muted-foreground">{row.requestId}</p></div><Button size="sm" variant="outline" disabled={disabled || pending} onClick={() => onInspect(row)}>Inspect submission</Button></li>)}</ul>
    {error && <p role="alert" className="mt-3 text-xs text-destructive">{error}</p>}{next && <Button size="sm" variant="outline" className="mt-3" disabled={pending || disabled} onClick={() => void more()}>{pending ? 'Loading…' : 'Load earlier submissions'}</Button>}
  </details>
}
