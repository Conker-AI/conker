import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmationDialog } from '@/components/design-system'
import type { DraftController, DraftEntry } from './draft-controller'
import type { DraftValue } from '@/lib/gateway/drafts'

function Choices({ value }: { value: DraftValue }) {
  return <p className="text-xs text-muted-foreground">Model: {value.modelId || 'Automatic'} · Skills: {value.skillIds.join(', ') || 'None'} · Think: {value.think ? 'On' : 'Off'}{value.researchMode !== 'off' ? ` · Research: ${value.researchMode}` : ''}</p>
}
export function DraftSaveStatus({ entry, controller, draftKey, disabled = false }: { entry?: DraftEntry; controller: DraftController; draftKey: string; disabled?: boolean }) {
  const [choice, setChoice] = useState<{ kind: 'saved' | 'mine'; revision: number; version: number } | null>(null)
  const [choiceError, setChoiceError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const state = entry?.status ?? 'loading'
  const labels = { loading: 'Reading saved draft…', saved: entry?.base?.revision ? 'Draft saved on this server' : 'Drafts save privately on this server', dirty: 'Unsaved changes', saving: 'Saving draft…', offline: 'Draft not saved', unknown: 'Draft save not confirmed', conflict: 'This draft changed in another tab or device', invalid: 'Draft not saved', unavailable: 'Draft unavailable' }
  const retry = async () => { setPending(true); try { await controller.retry(draftKey) } finally { setPending(false) } }
  return <div className="space-y-2 px-1 text-xs text-muted-foreground">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><p role="status" aria-live="polite">{labels[state]}</p>{['offline', 'unknown', 'invalid'].includes(state) && <Button variant="link" size="sm" className="h-auto p-0 text-xs" disabled={disabled || pending} onClick={() => void retry()}>{pending ? 'Checking…' : 'Check saved draft'}</Button>}{entry?.value.researchMode !== 'off' && entry?.value.researchMode && <span>Research: {entry.value.researchMode}</span>}</div>
    {entry?.error && <p role="alert">{entry.error}</p>}
    {state === 'saved' && <p className="sr-only">Drafts are separate from messages and memory. Saving does not send your request.</p>}
    {state === 'conflict' && entry?.conflict && <div className="space-y-2 rounded-lg border p-3 text-foreground">
      <p>Your edits are kept here. Compare both versions before choosing which to keep.</p>
      <details><summary className="cursor-pointer rounded-sm text-xs focus-visible:outline-2 focus-visible:outline-ring">Compare drafts and options</summary><div className="mt-3 grid gap-4 sm:grid-cols-2">{[{ label: 'Your edits', value: entry.value }, { label: 'Saved on server', value: entry.conflict }].map(item => <section key={item.label} className="min-w-0 space-y-2"><h3 className="text-xs font-medium">{item.label}</h3><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2 font-sans text-xs">{item.value.text || '(Empty draft)'}</pre><Choices value={item.value} />{draftKey === 'new' && <p className="break-words text-xs text-muted-foreground">Title: {item.value.title || 'Automatic from the first message'}</p>}{draftKey === 'new' && <p className="text-xs text-muted-foreground">Agent: {item.value.agentId || 'companion'} · Memory: {item.value.privacy.memoryDisabled === undefined ? 'Inherited' : item.value.privacy.memoryDisabled ? 'Off' : 'On'} · Assistant tools: {item.value.privacy.harnessDisabled === undefined ? 'Inherited' : item.value.privacy.harnessDisabled ? 'Off' : 'On'}</p>}</section>)}</div></details>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={disabled || pending} onClick={() => { setChoiceError(null); setChoice({ kind: 'saved', revision: entry.conflict!.revision, version: entry.version }) }}>Use saved version</Button><Button size="sm" variant="outline" disabled={disabled || pending} onClick={() => { setChoiceError(null); setChoice({ kind: 'mine', revision: entry.conflict!.revision, version: entry.version }) }}>Keep my edits</Button></div>
    </div>}
    <ConfirmationDialog open={choice !== null} onOpenChange={open => { if (!open) setChoice(null) }} title={choice?.kind === 'saved' ? 'Replace the draft in this tab?' : 'Replace the saved draft?'} description={choice?.kind === 'saved' ? 'Your unsaved text and options will be replaced by the version shown from the server.' : 'Save your text and options over the server version shown here. A newer server change will stop this replacement.'} actionLabel={choice?.kind === 'saved' ? 'Use saved version' : 'Save my edits'} pending={pending} error={choiceError} onConfirm={async () => { if (!choice) return; setPending(true); try { const resolved = await controller.choose(draftKey, choice.kind, choice); if (resolved) setChoice(null); else setChoiceError('The draft changed again. Close this dialog and review both versions before choosing.') } finally { setPending(false) } }} />
  </div>
}
