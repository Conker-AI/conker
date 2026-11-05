import { useState } from 'react'
import { AlertDialog, AlertDialogClose, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { cardLabels } from '@/lib/inbox-buttons'
import type { OwnerRequest } from '@/lib/gateway/owner'
import { friendlyValue, humanize } from './approval-words'

/**
 * The level-2 "Are you sure?" dialog: outward actions (send, publish, ship) leave Conker, so the
 * card's own yes first shows exactly what goes where — the title, the details line and every
 * argument — and the red confirm sends the approval. No password: the session is enough.
 */
export function ApprovalConfirm({ request, busy, onConfirm, onCancel }: {
  request: OwnerRequest; busy: boolean; onConfirm: () => void; onCancel: () => void
}) {
  const [argIndex, setArgIndex] = useState<string | null>(null)
  const args = request.action.args ?? {}
  return <AlertDialog open onOpenChange={open => { if (!open) onCancel() }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{request.title || 'Are you sure?'}</AlertDialogTitle>
        <AlertDialogDescription>{request.details || undefined}</AlertDialogDescription>
      </AlertDialogHeader>
      {request.action.args === null ? <p className="text-sm text-muted-foreground">Complete arguments are unavailable.</p>
        : <dl className="flex flex-col gap-3 text-sm leading-6 [overflow-wrap:anywhere]">
          {Object.entries(args).map(([key, value]) => {
            const text = friendlyValue(value), long = text.length > 180
            return <div key={key} className="grid min-w-0 gap-1 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-4">
              <dt className="break-words text-muted-foreground">{humanize(key)}</dt>
              <dd className="min-w-0"><span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{long && argIndex !== key ? `${text.slice(0, 180)}…` : text}</span>
                {long && <Button type="button" size="sm" variant="ghost" aria-expanded={argIndex === key} onClick={() => setArgIndex(current => current === key ? null : key)}>{argIndex === key ? 'Show less' : 'Show more'}</Button>}
              </dd>
            </div>
          })}
        </dl>}
      <p className="text-sm text-muted-foreground">This leaves Conker. Check where it goes.</p>
      <AlertDialogFooter>
        <AlertDialogClose render={<Button type="button" variant="outline" disabled={busy} />}>Cancel</AlertDialogClose>
        <Button type="button" variant="destructive" disabled={busy} onClick={onConfirm}>{cardLabels[request.card].yes}</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
}
