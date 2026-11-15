import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { gatewayError } from '@/lib/gateway/transport'
import type { MemoryUsesClient } from '@/lib/gateway/memory-uses'

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** "Used in 3 answers in 2 chats", read only when asked, so a list of memories makes no call per row. */
export function MemoryUsesLine({ client, memoryId }: { client: MemoryUsesClient; memoryId: string }) {
  const [state, setState] = useState<{ kind: 'idle' } | { kind: 'loading' } | { kind: 'done'; text: string } | { kind: 'failed'; message: string }>({ kind: 'idle' })
  const load = () => {
    setState({ kind: 'loading' })
    client.uses(memoryId).then(page => setState({
      kind: 'done',
      text: page.total === 0 ? 'Not used in an answer yet.' : `Used in ${plural(page.total, 'answer', 'answers')} in ${plural(page.chats, 'chat', 'chats')}.`,
    })).catch(error => setState({ kind: 'failed', message: gatewayError(error).message }))
  }
  if (state.kind === 'done') return <p className="text-xs text-muted-foreground" role="status">{state.text}</p>
  if (state.kind === 'failed') return <p className="text-xs text-destructive-foreground" role="alert">{state.message} <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={load}>Try again</Button></p>
  return <Button type="button" variant="link" size="sm" className="h-auto justify-start p-0 text-xs" disabled={state.kind === 'loading'} onClick={load}>{state.kind === 'loading' ? 'Checking…' : 'Where was this used?'}</Button>
}
