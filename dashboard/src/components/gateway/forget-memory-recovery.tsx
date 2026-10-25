import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmationDialog } from '@/components/design-system'
import type { GatewayControlClient, MemoryForgetRequest } from '@/lib/gateway/control'
import { memoryForgetFailure } from '@/lib/gateway/memory-forget-state'

/** Reads only recovery metadata until the owner explicitly checks the saved operation. */
export function ForgetMemoryRecovery({ client, revision, onResolved }: { client: GatewayControlClient; revision: string; onResolved: () => void }) {
  const [saved, setSaved] = useState<MemoryForgetRequest | null>(null)
  const [error, setError] = useState<string | null>(null), [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false), [refresh, setRefresh] = useState(0)
  const [reading, setReading] = useState(true)
  const [scope, setScope] = useState({ client, revision, refresh })
  const action = useRef<AbortController | null>(null), read = useRef<AbortController | null>(null), epoch = useRef(0)
  if (scope.client !== client || scope.revision !== revision || scope.refresh !== refresh) {
    setScope({ client, revision, refresh }); setReading(true); setSaved(null); setOpen(false); setPending(false); setError(null)
  }
  useEffect(() => {
    const fence = epoch, controller = new AbortController(), ticket = ++fence.current
    read.current = controller
    void client.pendingMemoryForget(controller.signal).then(value => {
      if (!controller.signal.aborted && fence.current === ticket) { setSaved(value); setError(null) }
    }).catch(() => { if (!controller.signal.aborted && fence.current === ticket) setError('Could not check previous forget requests. Retry the status check before starting another deletion.') })
      .finally(() => { if (fence.current === ticket) { read.current = null; setReading(false) } })
    return () => { fence.current++; controller.abort(); action.current?.abort(); action.current = null }
  }, [client, revision, refresh])
  async function recover() {
    if (!saved || reading || read.current || action.current) return
    const controller = new AbortController(), ticket = epoch.current
    action.current = controller; setPending(true); setError(null)
    try {
      await client.forgetMemory(saved, controller.signal)
      if (controller.signal.aborted || epoch.current !== ticket) return
      setSaved(null); setOpen(false); onResolved()
    } catch (failure) {
      if (controller.signal.aborted || epoch.current !== ticket) return
      const problem = memoryForgetFailure(failure)
      setError(problem.message)
      if (problem.privateUnavailable) { setSaved(null); setOpen(false) }
    } finally { if (epoch.current === ticket) { action.current = null; setPending(false) } }
  }
  if (!saved && !error) return null
  return <section aria-label="Forget recovery" className="space-y-2 border-b px-4 py-3 text-sm">
    {saved && <><h2 className="font-medium">A previous forget request needs confirmation</h2><p className="text-xs text-muted-foreground">Memory recall is paused until this request is resolved. Checking can complete the deletion you previously confirmed. Source conversations are kept.</p></>}
    {!open && error && <p role="alert" className="text-sm text-destructive-foreground">{error}</p>}
    <div className="flex flex-wrap gap-2">{saved && <Button variant="outline" size="sm" disabled={pending || reading} onClick={() => { if (!read.current && !action.current) setOpen(true) }}>Check previous forget</Button>}<Button variant="ghost" size="sm" disabled={pending || reading} onClick={() => { if (action.current || read.current) return; setReading(true); setSaved(null); setOpen(false); setRefresh(value => value + 1) }}>{reading ? 'Checking status…' : 'Refresh status'}</Button></div>
    <ConfirmationDialog open={open && saved !== null} onOpenChange={setOpen} title="Check the previous forget request?" description="Conker will check the same saved deletion and can finish it if needed. It will not start a request for a different memory or version." actionLabel="Check previous forget" pending={pending} error={error} onConfirm={recover}>
      {saved && <p className="break-all text-xs text-muted-foreground">Memory {saved.memoryId} · version {saved.revision}</p>}
    </ConfirmationDialog>
  </section>
}
