import { useState, type RefObject } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmationDialog, FormActions, OverlayBody, TaskDialogContent } from '@/components/design-system'
import { correctionTextValid, type MemoryCorrectionIdentity, type MemoryCorrectionReceipt } from '@/lib/gateway/memory-corrections'
import type { MemoryCorrectionControl } from './use-memory-correction'
import { useCredentialFocus } from './credential-focus'

function receiptCopy(value: MemoryCorrectionReceipt) {
  if (value.status === 'applied') return `Memory updated to revision ${value.revision}. ${value.indexing === 'indexed' ? 'Search indexing is complete.' : value.indexing === 'degraded' ? 'Search indexing is delayed; the text change is saved.' : 'Search indexing is pending.'} The source conversation is kept.`
  if (value.status === 'rejected') return value.errorCode === 'revision_conflict' ? 'The memory changed after review. Read its latest version before making another edit.' : value.errorCode === 'memory_forgotten' || value.errorCode === 'not_found' ? 'This memory is no longer available to edit.' : 'The server rejected this change because memory was unavailable. Read the latest version before editing again.'
  return 'The memory change is not confirmed yet. Check status before deciding whether to retry the approved change.'
}
const notices = {
  read: 'Memory change status could not be read. Nothing was retried.',
  unsupported: 'This record cannot be edited here. Only retained memories in the configured Companion memory are supported.',
  changed: 'Memory access changed. Check for an earlier change before editing again.',
  'not-started': 'The change was not admitted. Read the latest memory before trying again.',
  'not-recorded': 'No receipt is available yet. The earlier request may still arrive; check status again. Nothing was repeated.',
  'work-active': 'A chat or memory operation is active. Wait for it to finish, then read the latest memory before editing.',
  'change-pending': 'Another memory change needs attention. Check for the pending change first.',
  'revision-conflict': 'The memory changed after review. Read its latest version before making another edit.',
}
export function MemoryCorrection({ control, focusTarget }: { control: MemoryCorrectionControl; focusTarget: RefObject<HTMLButtonElement | null> }) {
  const { controller, editor, busy, receipt, recovery, previousUnconfirmed, notice, ready, scope } = control
  const [review, setReview] = useState<{ identity: MemoryCorrectionIdentity; controller: typeof controller; scope: number } | null>(null)
  const currentReview = review?.controller === controller && review.scope === scope && review.identity === recovery ? review : null
  const pending = busy === 'saving' || busy === 'verification'
  const focus = useCredentialFocus(controller, scope, control.authStore, busy === 'verification' ? 'awaiting-verification' : busy === 'saving' ? 'working' : 'current', focusTarget)
  const valid = !!editor?.snapshot && correctionTextValid(editor.text) && editor.text !== editor.snapshot.text && !busy
  return <>
    {(recovery || receipt || notice || previousUnconfirmed || !ready) && <section aria-label="Memory change status" className="space-y-2 border-b p-4 text-sm">
      <p role="status">{busy === 'saving' ? 'Saving the approved memory change…' : busy === 'verification' ? 'Waiting for owner verification. No change has been sent yet.' : receipt ? receiptCopy(receipt) : recovery ? 'The outcome of an earlier memory change is not confirmed. Nothing will be repeated automatically.' : ready ? 'Memory editing' : busy === 'pending' ? 'Checking for an earlier memory change…' : 'Check for an earlier memory change before editing.'}</p>
      {notice && <p role="alert" className="text-muted-foreground">{notices[notice]}</p>}
      {(recovery || previousUnconfirmed) && <p className="break-all text-xs text-muted-foreground">{previousUnconfirmed ? `Earlier request ${previousUnconfirmed.requestId} is still unconfirmed and may arrive later. A new edit requires a fresh review and approval.` : `Request ${recovery!.requestId}`}</p>}
      {(recovery || !ready) && <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" aria-disabled={!!busy} className="aria-disabled:opacity-50" onClick={() => { if (!busy) void (recovery ? controller.check(recovery) : controller.refresh()) }}>{busy === 'status' || busy === 'pending' ? 'Checking…' : 'Check status'}</Button>
        {recovery?.payloadHash && <Button size="sm" variant="outline" aria-disabled={!!busy || !ready} className="aria-disabled:opacity-50" onClick={() => { if (!busy && ready) { focus.dialog(); setReview({ identity: recovery, controller, scope }) } }}>Retry approved change</Button>}
        {recovery && notice === 'not-recorded' && <Button size="sm" variant="outline" aria-disabled={!!busy} className="aria-disabled:opacity-50" onClick={() => { if (!busy) void controller.reviewNew(recovery) }}>Review a new edit</Button>}
      </div>}
    </section>}
    <Dialog open={!!editor} onOpenChange={open => { if (!open) controller.close(editor) }} disablePointerDismissal={pending}>
      <TaskDialogContent title="Edit memory" description="Change the retained text. The source conversation, source type, confidence and memory permissions stay the same." showCloseButton={!pending} initialFocus={() => { focus.dialog(); return true }} finalFocus={focus.closeDialog}>
        <form className="flex min-h-0 flex-col" onSubmit={event => { event.preventDefault(); if (valid) { focus.operation(); void controller.apply(editor) } }}>
          <OverlayBody>
            {previousUnconfirmed && <p className="text-sm text-muted-foreground">The earlier request is unconfirmed and may still arrive. This review reads the current memory; saving needs a new owner approval.</p>}
            {busy === 'snapshot' && <p role="status">Reading the current full memory…</p>}
            {editor?.snapshot && <>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm"><dt className="text-muted-foreground">Revision</dt><dd>{editor.snapshot.revision}</dd><dt className="text-muted-foreground">Source</dt><dd>{editor.snapshot.sourceType || 'Not reported'}</dd><dt className="text-muted-foreground">Confidence</dt><dd>{editor.snapshot.confidence || 'Not reported'}</dd></dl>
              <div className="space-y-2"><Label htmlFor="memory-correction-text">Memory text</Label><Textarea id="memory-correction-text" className="min-h-48" value={editor.text} readOnly={!!busy} aria-disabled={!!busy} onChange={event => controller.edit(event.target.value, editor)} aria-describedby="memory-correction-limit" /><p id="memory-correction-limit" className="text-xs text-muted-foreground">{[...editor.text].length.toLocaleString()} / 16,000 characters. Draft text stays in this open editor.</p></div>
              {!busy && !correctionTextValid(editor.text) && <p role="alert" className="text-sm text-destructive">Enter nonblank text within the character limit.</p>}
            </>}
            {pending && <p role="status" className="text-sm text-muted-foreground">{busy === 'verification' ? 'Waiting for owner verification. Cancel the verification dialog to return to your edit.' : 'The approved text has been sent. Waiting for its receipt…'}</p>}
            {notice && <p role="alert" className="text-sm text-muted-foreground">{notices[notice]}</p>}
          </OverlayBody>
          <FormActions inset><Button type="button" variant="outline" aria-disabled={pending} className="aria-disabled:opacity-50" onClick={() => controller.close(editor)}>Cancel</Button><Button type="submit" aria-disabled={!valid} className="aria-disabled:opacity-50">{pending ? 'Saving…' : 'Save change'}</Button></FormActions>
        </form>
      </TaskDialogContent>
    </Dialog>
    <ConfirmationDialog open={!!currentReview} onOpenChange={open => { if (!open) setReview(null) }} title="Retry approved memory change?" description="This sends only the exact text and revision already approved and saved on the server. It does not use a new edit. The earlier operation may already have completed." actionLabel="Retry approved change" actionVariant="default" pending={pending} finalFocus={focus.closeDialog} onConfirm={async () => { if (!currentReview || busy || !ready) return; focus.operation(); await controller.retry(currentReview.identity); setReview(value => value === currentReview ? null : value) }}>
      {currentReview && <p className="break-all text-sm">Memory {currentReview.identity.memoryId} · reviewed revision {currentReview.identity.expectedRevision}</p>}
    </ConfirmationDialog>
  </>
}
