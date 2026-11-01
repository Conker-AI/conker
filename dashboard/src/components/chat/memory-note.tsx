import { Button } from '@/components/ui/button'
import type { MessageMemoryFeedback } from '@/lib/chat/contract'

/** The quiet note under a message that Conker remembered, with Undo. */
export function MemoryNote({ memory }: { memory: MessageMemoryFeedback }) {
  const state = memory.undoState
  const canUndo = memory.undo.availability !== 'unsupported' && state?.phase !== 'forgotten'
  return <div className="mt-1.5 flex max-w-full flex-col items-end gap-1 text-xs text-muted-foreground">
    <p role="status" className="flex flex-wrap items-center justify-end gap-x-1.5">
      <span>{memory.label}</span>
      {canUndo && <Button type="button" size="xs" variant="ghost" className="text-muted-foreground" disabled={memory.undo.availability !== 'enabled'} onClick={() => { if (memory.undo.availability === 'enabled') void memory.undo.run() }}>{state?.phase === 'working' ? 'Undoing…' : 'Undo'}</Button>}
    </p>
    {state?.phase === 'failed' && <p role="alert" className="max-w-sm text-right text-destructive-foreground">{state.message}</p>}
  </div>
}
