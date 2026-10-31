import { useRef, useState } from 'react'
import { KeyRound, RefreshCw } from 'lucide-react'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import { credentialOperationAllowed } from './credential-state'
import { useCredentialState } from './use-credential-state'
import { CredentialFeedback } from './credential-feedback'
import { useCredentialFocus } from './credential-focus'
import type { GatewayControlClient } from '@/lib/gateway/control'
import type { HostedProviderId, ProviderCredential, ProviderCredentialOperation } from '@/lib/gateway/provider-control'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { FormActions, OverlayBody, TaskDialogContent, WorkspaceSection } from '@/components/design-system'

const names: Record<HostedProviderId, string> = { openrouter: 'OpenRouter', openai: 'OpenAI API', anthropic: 'Anthropic API', gemini: 'Google Gemini API', xai: 'xAI API (Grok)', mistral: 'Mistral API', deepseek: 'DeepSeek API', groq: 'Groq API' }
const state = (record: ProviderCredential) => record.activationPending ? 'Recovery required' : record.stagedRevision
  ? record.verificationStale ? 'Verification expired' : record.verificationStatus === 'verified' ? 'Verified key ready to activate' : record.verificationStatus === 'rejected' ? 'Key rejected' : record.verificationStatus === 'unavailable' ? 'Verification unavailable' : 'Key saved, not verified'
  : record.configured ? 'Active key on server' : 'Not connected'

function RevocationRecord({ record, pending, apply }: { record: ProviderCredential; pending: boolean; apply: (operation: ProviderCredentialOperation) => Promise<void> }) {
  const [revision, setRevision] = useState(''), [confirmed, setConfirmed] = useState(false)
  const allowed = !pending && confirmed && /^credential_[0-9a-f]{32}$/.test(revision) && revision !== record.activeRevision && revision !== record.stagedRevision
  return <details className="text-xs text-muted-foreground"><summary className="w-fit cursor-pointer py-2 focus-visible:outline-2 focus-visible:outline-ring">Credential history and revocation</summary>
    <div className="space-y-3 pb-3"><p className="break-all">Active revision: {record.activeRevision ?? 'None'}</p><p className="break-all">Staged revision: {record.stagedRevision ?? 'None'}</p>
      <Label htmlFor={`retired-key-${record.id}`}>Retired credential revision</Label><Input id={`retired-key-${record.id}`} value={revision} maxLength={43} readOnly={pending} aria-disabled={pending} autoComplete="off" spellCheck={false} onChange={event => { if (!pending) setRevision(event.target.value) }} />
      <div className="flex items-start gap-2"><Checkbox id={`revoked-key-${record.id}`} checked={confirmed} aria-disabled={pending} onCheckedChange={value => { if (!pending) setConfirmed(value === true) }} /><Label htmlFor={`revoked-key-${record.id}`} className="text-xs leading-5">I already revoked this key in the provider account.</Label></div>
      <Button size="sm" variant="outline" aria-disabled={!allowed} className="aria-disabled:opacity-50" onClick={() => { if (allowed) void apply({ operation: 'record-revoked', provider: record.id, revision, issuerConfirmed: true }) }}>Record revocation</Button>
      <p>This only records your confirmation. Conker does not revoke keys at their issuer.</p>
      {record.revokedRevisions.map(revision => <p key={revision} className="break-all">Revoked: {revision}</p>)}
    </div>
  </details>
}

/** `only` shows one provider's key (the row the owner opened); the spending switch covers all of them. */
export function ProviderCredentials({ client, authStore, onChanged, only }: { client: GatewayControlClient; authStore: GatewayAuthStore; onChanged: () => void; only?: HostedProviderId }) {
  const control = useCredentialState(client, authStore)
  const { value, selected, secret } = control
  const current = control.phase === 'current'
  const pending = control.phase === 'awaiting-verification' || control.phase === 'working'
  const busy = pending || control.phase === 'checking'
  const recoveryAction = useRef<HTMLButtonElement>(null)
  const focus = useCredentialFocus(control.source, control.scope, authStore, control.phase, recoveryAction)
  async function apply(operation: ProviderCredentialOperation) {
    if (!current || !value || !credentialOperationAllowed(value, operation)) return
    focus.operation()
    if (await control.apply(operation)) onChanged()
  }
  const close = () => { control.close() }
  return <WorkspaceSection title={only ? names[only] : 'Connect a provider'} description="API keys stay write-only on your Conker host. OpenAI API billing is separate from a ChatGPT subscription." action={<Button ref={recoveryAction} size="sm" variant="outline" className="aria-disabled:opacity-50" aria-disabled={busy} aria-busy={busy} disabled={control.phase === 'inactive'} onClick={() => { if (!busy) void control.refresh() }}><RefreshCw />{control.phase === 'checking' ? 'Checking…' : control.phase === 'uncertain' || control.phase === 'unavailable' ? 'Check status' : 'Refresh'}</Button>}>
    {!selected && <CredentialFeedback {...control} />}
    {!current && value && <p className="text-xs text-muted-foreground">Provider revisions and spending policy below are from the last successful check. Actions need current status.</p>}
    {value && !value.available && <p className="text-sm text-muted-foreground">Provider setup is unavailable on this installation. The host provider-control service must be installed first; no keys can be sent.</p>}
    {value?.available && only && !value.providers.some(record => record.id === only) && <p role="status" className="text-sm text-muted-foreground">{names[only]} keys need a Conker update: the AI runtime on this server does not read them yet. No key can be saved until then.</p>}
    {value?.available && <fieldset aria-disabled={!current || value.policyRecoveryRequired} className="divide-y"><legend className="sr-only">Hosted provider credentials</legend>{value.providers.filter(record => !only || record.id === only).map(record => <div key={record.id} className="py-3"><div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0"><p className="text-sm font-medium">{names[record.id]}</p><p className="text-xs text-muted-foreground">{!current ? 'Last checked: ' : ''}{state(record)}</p></div>
      <div className="flex flex-wrap gap-2">
        {record.activationPending && record.stagedRevision ? <Button size="sm" variant="outline" aria-disabled={!current || value?.policyRecoveryRequired} className="aria-disabled:opacity-50" onClick={() => void apply({ operation: 'recover', provider: record.id, revision: record.stagedRevision! })}>Recover previous key</Button>
          : <>
            <Button size="sm" variant="outline" aria-disabled={!current || value?.policyRecoveryRequired} className="aria-disabled:opacity-50" onClick={() => { if (current && !value.policyRecoveryRequired) { focus.dialog(); control.select(record.id) } }}><KeyRound />{record.configured || record.stagedRevision ? 'Replace key' : 'Connect'}</Button>
            {record.stagedRevision && <Button size="sm" variant="outline" aria-disabled={!current || value?.policyRecoveryRequired} className="aria-disabled:opacity-50" onClick={() => void apply({ operation: 'verify', provider: record.id, revision: record.stagedRevision! })}>Verify key</Button>}
            {record.stagedRevision && <Button size="sm" variant="ghost" aria-disabled={!current || value?.policyRecoveryRequired} className="aria-disabled:opacity-50" onClick={() => void apply({ operation: 'discard', provider: record.id, revision: record.stagedRevision! })}>Discard staged key</Button>}
            {record.stagedRevision && record.verificationStatus === 'verified' && !record.verificationStale && <Button size="sm" variant="secondary" aria-disabled={!current || value?.policyRecoveryRequired} className="aria-disabled:opacity-50" onClick={() => void apply({ operation: 'activate', provider: record.id, revision: record.stagedRevision! })}>Activate key</Button>}
          </>}
      </div>
    </div><RevocationRecord key={`${control.scope}:${record.id}:${record.activeRevision}:${record.stagedRevision}`} record={record} pending={!current || value.policyRecoveryRequired} apply={apply} />
    </div>)}</fieldset>}
    {value?.available && <div className="flex items-start justify-between gap-4 border-t pt-4"><div className="min-w-0 space-y-1"><Label htmlFor="paid-provider-requests">{!current ? 'Last checked: paid model requests' : 'Paid model requests'}</Label><p className="text-xs leading-5 text-muted-foreground">Your provider can charge for requests. Set spending limits in its account; this switch is not a budget. Changing it restarts the AI runtime.</p>{value.policyRecoveryRequired && <><p role="alert" className="text-sm text-destructive-foreground">A spending-policy change was interrupted. Recover the previous policy first.</p><Button size="sm" variant="outline" aria-disabled={!current} className="aria-disabled:opacity-50" onClick={() => void apply({ operation: 'recover-paid-policy' })}>Recover spending policy</Button></>}</div><Switch id="paid-provider-requests" checked={value.paidAllowed === true} aria-disabled={!current || value.policyRecoveryRequired} onCheckedChange={enabled => void apply({ operation: 'paid-policy', enabled, expectedAllowed: value.paidAllowed === true })} /></div>}
    <Dialog open={selected !== null} onOpenChange={open => { if (!open && !pending) close() }} disablePointerDismissal={pending}>
      <TaskDialogContent title={selected ? `Connect ${names[selected.id]}` : 'Connect provider'} description="Saved on your server over this authenticated HTTPS connection. You must verify and activate it separately." showCloseButton={!pending} finalFocus={() => focus.closeDialog()}>
        <form className="flex min-h-0 flex-col" onSubmit={event => {
          event.preventDefault()
          if (!selected || !current || !/^[!-~]{8,4096}$/.test(secret)) return
          const operation: ProviderCredentialOperation = { operation: 'stage', provider: selected.id, secret, activeRevision: selected.activeRevision, stagedRevision: selected.stagedRevision }
          void apply(operation)
        }}>
          <OverlayBody><div className="space-y-2"><Label htmlFor="hosted-provider-key">API key</Label><Input id="hosted-provider-key" type="password" autoComplete="off" spellCheck={false} maxLength={4096} required minLength={8} pattern="[!-~]+" disabled={!current} value={secret} onChange={event => control.setSecret(event.target.value)} /></div><p className="text-xs leading-5 text-muted-foreground">Conker never returns the key or persists it in browser storage. Saving a key does not enable paid requests, change your answering model, or grant tool permissions.</p><CredentialFeedback {...control} />{selected && !current && !pending && <Button type="button" variant="outline" aria-disabled={busy} onClick={() => { if (!busy) void control.refresh() }}>Check status</Button>}</OverlayBody>
          <FormActions inset><Button type="button" variant="outline" aria-disabled={pending} className="aria-disabled:opacity-50" onClick={close}>Cancel</Button><Button type="submit" aria-disabled={!current || !/^[!-~]{8,4096}$/.test(secret)} className="aria-disabled:opacity-50">{pending ? 'Saving…' : 'Save key'}</Button></FormActions>
        </form>
      </TaskDialogContent>
    </Dialog>
  </WorkspaceSection>
}
