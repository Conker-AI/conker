import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { GatewayControlClient, MemoryForgetPreview } from '@/lib/gateway/control'
import { gatewayError } from '@/lib/gateway/transport'

/**
 * Forget one memory: show the exact current text, then remove it everywhere it is
 * stored. The password prompt comes from the owner-operation verification flow.
 */
export function ForgetMemory({ client, memoryId, onForgotten }: { client: GatewayControlClient; memoryId: string; onForgotten: () => void }) {
  const [preview, setPreview] = useState<MemoryForgetPreview | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function review() {
    setPending(true); setError(null)
    try { setPreview(await client.forgetPreview(memoryId)) }
    catch (failure) { setError(gatewayError(failure).message) }
    finally { setPending(false) }
  }

  async function confirm() {
    if (!preview) return
    setPending(true); setError(null)
    try { await client.forgetMemory(preview); onForgotten() }
    catch (failure) {
      const problem = gatewayError(failure)
      setError(problem.status === 409 ? 'This memory changed since you reviewed it. Review it again before forgetting.' : problem.message)
      if (problem.status === 409) setPreview(null)
    } finally { setPending(false) }
  }

  return <section className="space-y-2 border-t pt-3" aria-labelledby={`forget-${memoryId}`}>
    <h3 id={`forget-${memoryId}`} className="font-medium">Forget</h3>
    {!preview ? <>
      <p className="text-xs leading-5 text-muted-foreground">Remove this memory from Conker: the record, its history, search and cached copies. The chat it came from is kept.</p>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => void review()}><Trash2 />{pending ? 'Checking…' : 'Forget this memory…'}</Button>
    </> : <div className="space-y-2 rounded-lg border p-3">
      <p className="text-sm font-medium">Conker will forget exactly this (version {preview.revision}):</p>
      <blockquote className="whitespace-pre-wrap break-words border-l-2 pl-3 text-sm">{preview.text}</blockquote>
      <p className="text-xs leading-5 text-muted-foreground">This cannot be undone. To remove the original conversation too, forget that chat separately.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="destructive" disabled={pending} onClick={() => void confirm()}>{pending ? 'Forgetting…' : 'Forget permanently'}</Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setPreview(null)}>Cancel</Button>
      </div>
    </div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>
}
