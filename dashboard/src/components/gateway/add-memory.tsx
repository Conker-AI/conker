import { useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { TaskDialogContent } from '@/components/design-system/overlays'
import { Textarea } from '@/components/ui/textarea'
import { gatewayError } from '@/lib/gateway/transport'

type Client = { rememberMemory(requestId: string, text: string): Promise<{ memoryId: string; status: 'remembered' | 'already_remembered' }> }
const requestId = () => `add_${crypto.randomUUID().replaceAll('-', '')}`

/** Add one memory by hand, the same way a memory Conker asked for is saved. */
export function AddMemory({ client, onAdded }: { client: Client; onAdded: (message: string) => void }) {
  const [open, setOpen] = useState(false), [text, setText] = useState(''), [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null), [identity, setIdentity] = useState(requestId)
  const close = () => { setOpen(false); setText(''); setError(null); setIdentity(requestId()) }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!text.trim() || pending) return
    setPending(true); setError(null)
    // The same id on a retry: memory stores it at most once.
    try { const saved = await client.rememberMemory(identity, text); close(); onAdded(saved.status === 'already_remembered' ? 'That is already in your memory.' : 'Remembered.') }
    catch (cause) { setError(gatewayError(cause).message) }
    finally { setPending(false) }
  }
  return <>
    <Button size="icon" variant="ghost" aria-label="Add memory" onClick={() => setOpen(true)}><Plus /></Button>
    <Dialog open={open} onOpenChange={next => { if (!next && !pending) close() }}>
      <TaskDialogContent title="Add a memory" description="Write it the way you want Conker to remember it. It is saved word for word; you can change or forget it later." showCloseButton={!pending}>
        <form className="grid gap-3" onSubmit={event => void save(event)}>
          <Textarea aria-label="Memory text" value={text} maxLength={2000} rows={4} placeholder="My physics exam is on Thursday 30 October, room 204." onChange={event => { setText(event.target.value); setError(null) }} />
          {error && <p role="alert" className="text-sm text-destructive-foreground">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={close}>Cancel</Button>
            <Button type="submit" disabled={pending || !text.trim()}>{pending ? 'Saving…' : 'Remember'}</Button>
          </div>
        </form>
      </TaskDialogContent>
    </Dialog>
  </>
}
