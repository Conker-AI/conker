import { useEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmationDialog } from '@/components/design-system'
import { createMemoryForgetRequest, type GatewayControlClient, type MemoryForgetPreview, type MemoryForgetRequest } from '@/lib/gateway/control'
import { gatewayError } from '@/lib/gateway/transport'
import { memoryForgetFailure } from '@/lib/gateway/memory-forget-state'

/**
 * The same reviewed identity survives an uncertain response; source chats are kept.
 * Password verification remains owned by the owner-operation flow.
 */
export function ForgetMemory({ client, memoryId, onForgotten, onChanged }: { client: GatewayControlClient; memoryId: string; onForgotten: () => void; onChanged?: () => void }) {
  const [preview, setPreview] = useState<MemoryForgetPreview | null>(null)
  const [intent, setIntent] = useState<MemoryForgetRequest | null>(null)
  const [open, setOpen] = useState(false), [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null), [attempted, setAttempted] = useState(false)
  const [scope, setScope] = useState({ client, memoryId })
  const operation = useRef<AbortController | null>(null), epoch = useRef(0)
  if (scope.client !== client || scope.memoryId !== memoryId) {
    setScope({ client, memoryId }); setPreview(null); setIntent(null); setOpen(false); setPending(false); setError(null); setAttempted(false)
  }
  useEffect(() => {
    const fence = epoch
    return () => { fence.current++; operation.current?.abort(); operation.current = null }
  }, [client, memoryId])

  async function review() {
    if (operation.current) return
    if (preview && intent) { setOpen(true); return }
    const controller = new AbortController(), ticket = epoch.current
    operation.current = controller; setPending(true); setError(null)
    try {
      const saved = await client.forgetPreview(memoryId, controller.signal)
      if (controller.signal.aborted || epoch.current !== ticket) return
      setPreview(saved); setIntent(createMemoryForgetRequest(saved)); setAttempted(false); setOpen(true)
    } catch (failure) { if (!controller.signal.aborted && epoch.current === ticket) setError(gatewayError(failure).message) }
    finally { if (epoch.current === ticket) { operation.current = null; setPending(false) } }
  }

  async function confirm() {
    if (!intent || operation.current) return
    const controller = new AbortController(), ticket = epoch.current
    operation.current = controller; setPending(true); setError(null); setAttempted(true)
    try {
      await client.forgetMemory(intent, controller.signal)
      if (controller.signal.aborted || epoch.current !== ticket) return
      setOpen(false); setPreview(null); setIntent(null); onForgotten()
    }
    catch (failure) {
      if (controller.signal.aborted || epoch.current !== ticket) return
      const problem = memoryForgetFailure(failure)
      setError(problem.message)
      if (problem.reset || problem.privateUnavailable) { setPreview(null); setIntent(null); setOpen(false); setAttempted(false) }
      if (!problem.privateUnavailable) onChanged?.()
    } finally { if (epoch.current === ticket) { operation.current = null; setPending(false) } }
  }

  return <section className="space-y-2 border-t pt-3" aria-labelledby={`forget-${memoryId}`}>
    <h3 id={`forget-${memoryId}`} className="font-medium">Forget</h3>
    <p className="text-xs leading-5 text-muted-foreground">Remove this memory from Conker: the record, its history, search and recalled context. The chat it came from is kept.</p>
    <Button size="sm" variant="outline" disabled={pending} onClick={() => void review()}><Trash2 />{pending ? 'Checking…' : attempted && intent ? 'Check previous forget…' : 'Forget this memory…'}</Button>
    {!open && error && <p role="alert" className="text-sm text-destructive-foreground">{error}</p>}
    <ConfirmationDialog open={open} onOpenChange={setOpen} title={attempted ? 'Check the same forget request?' : 'Forget this memory permanently?'} description={attempted ? 'This checks the deletion you already confirmed and can finish it if needed. The request and memory version stay the same.' : 'Conker will remove the reviewed memory and invalidate recalled copies. This cannot be undone. The original conversation is kept.'} actionLabel={attempted ? 'Check same request' : 'Forget permanently'} pending={pending} error={error} onConfirm={confirm}>
      {preview && <div className="space-y-2"><p className="text-xs text-muted-foreground">Reviewed version {preview.revision}</p><blockquote className="max-h-60 overflow-auto whitespace-pre-wrap break-words border-l-2 pl-3 text-sm">{preview.text}</blockquote></div>}
    </ConfirmationDialog>
  </section>
}
