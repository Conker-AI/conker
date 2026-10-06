import { useEffect, useRef, useState } from 'react'
import { KeyRound, RefreshCw } from 'lucide-react'
import type { GatewayControlClient } from '@/lib/gateway/control'
import type { ProviderCredential, ProviderCredentialOperation, ProviderCredentialsStatus } from '@/lib/gateway/provider-control'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { FormActions, OverlayBody, TaskDialogContent, WorkspaceSection } from '@/components/design-system'

const names = { openrouter: 'OpenRouter', openai: 'OpenAI API', anthropic: 'Anthropic' }
const state = (record: ProviderCredential) => record.activationPending ? 'Recovery required' : record.stagedRevision
  ? record.verificationStale ? 'Verification expired' : record.verificationStatus === 'verified' ? 'Verified key ready to activate' : record.verificationStatus === 'rejected' ? 'Key rejected' : record.verificationStatus === 'unavailable' ? 'Verification unavailable' : 'Key saved, not verified'
  : record.configured ? 'Active key on server' : 'Not connected'

function RevocationRecord({ record, pending, apply }: { record: ProviderCredential; pending: boolean; apply: (operation: ProviderCredentialOperation) => Promise<void> }) {
  const [revision, setRevision] = useState(''), [confirmed, setConfirmed] = useState(false)
  return <details className="text-xs text-muted-foreground"><summary className="w-fit cursor-pointer py-2 focus-visible:outline-2 focus-visible:outline-ring">Credential history and revocation</summary>
    <div className="space-y-3 pb-3"><p className="break-all">Active revision: {record.activeRevision ?? 'None'}</p><p className="break-all">Staged revision: {record.stagedRevision ?? 'None'}</p>
      <Label htmlFor={`retired-key-${record.id}`}>Retired credential revision</Label><Input id={`retired-key-${record.id}`} value={revision} maxLength={43} disabled={pending} autoComplete="off" spellCheck={false} onChange={event => setRevision(event.target.value)} />
      <div className="flex items-start gap-2"><Checkbox id={`revoked-key-${record.id}`} checked={confirmed} disabled={pending} onCheckedChange={value => setConfirmed(value === true)} /><Label htmlFor={`revoked-key-${record.id}`} className="text-xs leading-5">I already revoked this key in the provider account.</Label></div>
      <Button size="sm" variant="outline" disabled={pending || !confirmed || !/^credential_[0-9a-f]{32}$/.test(revision) || revision === record.activeRevision || revision === record.stagedRevision} onClick={() => void apply({ operation: 'record-revoked', provider: record.id, revision, issuerConfirmed: true })}>Record revocation</Button>
      <p>This only records your confirmation. Conker does not revoke keys at their issuer.</p>
      {record.revokedRevisions.map(revision => <p key={revision} className="break-all">Revoked: {revision}</p>)}
    </div>
  </details>
}

export function ProviderCredentials({ client, onChanged }: { client: GatewayControlClient; onChanged: () => void }) {
  const [value, setValue] = useState<ProviderCredentialsStatus | null>(null)
  const [error, setError] = useState(''), [pending, setPending] = useState(false), [reload, setReload] = useState(0)
  const [selected, setSelected] = useState<ProviderCredential | null>(null)
  const [secret, setSecret] = useState('')
  const request = useRef<AbortController | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    client.providerCredentials.status(controller.signal).then(next => { if (!controller.signal.aborted) { setValue(next); setError('') } })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Provider status unavailable.') })
    return () => controller.abort()
  }, [client, reload])
  useEffect(() => () => { request.current?.abort() }, [])
  async function apply(operation: ProviderCredentialOperation) {
    if (pending) return
    const controller = new AbortController()
    request.current = controller
    setPending(true); setError('')
    try {
      const saved = await client.providerCredentials.apply(operation, controller.signal)
      if (!controller.signal.aborted) { setValue(saved); setSelected(null); onChanged() }
    } catch (cause) {
      if (!controller.signal.aborted) setError(`${cause instanceof Error ? cause.message : 'Operation not confirmed.'} Refresh provider status before trying again.`)
    } finally {
      if (!controller.signal.aborted) setPending(false)
      request.current = null
    }
  }
  const close = () => { if (!pending) { setSelected(null); setSecret('') } }
  return <WorkspaceSection title="Connect a provider" description="API keys stay write-only on your Conker host. OpenAI API billing is separate from a ChatGPT subscription." action={<Button size="sm" variant="outline" disabled={pending} onClick={() => setReload(number => number + 1)}><RefreshCw />Refresh</Button>}>
    {error && !selected && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!value && !error && <p role="status" className="text-sm text-muted-foreground">Checking provider setup...</p>}
    {value && !value.available && <p className="text-sm text-muted-foreground">Provider setup is unavailable on this installation. The host provider-control service must be installed first; no keys can be sent.</p>}
    {value?.available && <fieldset disabled={pending || value.policyRecoveryRequired} className="divide-y"><legend className="sr-only">Hosted provider credentials</legend>{value.providers.map(record => <div key={record.id} className="py-3"><div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0"><p className="text-sm font-medium">{names[record.id]}</p><p className="text-xs text-muted-foreground">{state(record)}</p></div>
      <div className="flex flex-wrap gap-2">
        {record.activationPending && record.stagedRevision ? <Button size="sm" variant="outline" disabled={pending} onClick={() => void apply({ operation: 'recover', provider: record.id, revision: record.stagedRevision! })}>Recover previous key</Button>
          : <>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => { setSelected(record); setSecret(''); setError('') }}><KeyRound />{record.configured || record.stagedRevision ? 'Replace key' : 'Connect'}</Button>
            {record.stagedRevision && <Button size="sm" variant="outline" disabled={pending} onClick={() => void apply({ operation: 'verify', provider: record.id, revision: record.stagedRevision! })}>Verify key</Button>}
            {record.stagedRevision && <Button size="sm" variant="ghost" disabled={pending} onClick={() => void apply({ operation: 'discard', provider: record.id, revision: record.stagedRevision! })}>Discard staged key</Button>}
            {record.stagedRevision && record.verificationStatus === 'verified' && !record.verificationStale && <Button size="sm" variant="secondary" disabled={pending} onClick={() => void apply({ operation: 'activate', provider: record.id, revision: record.stagedRevision! })}>Activate key</Button>}
          </>}
      </div>
    </div><RevocationRecord record={record} pending={pending} apply={apply} />
    </div>)}</fieldset>}
    {value?.available && <div className="flex items-start justify-between gap-4 border-t pt-4"><div className="min-w-0 space-y-1"><Label htmlFor="paid-provider-requests">Paid model requests</Label><p className="text-xs leading-5 text-muted-foreground">Your provider can charge for requests. Set spending limits in its account; this switch is not a budget. Changing it restarts the AI runtime.</p>{value.policyRecoveryRequired && <><p role="alert" className="text-sm text-destructive">A spending-policy change was interrupted. Recover the previous policy first.</p><Button size="sm" variant="outline" disabled={pending} onClick={() => void apply({ operation: 'recover-paid-policy' })}>Recover spending policy</Button></>}</div><Switch id="paid-provider-requests" checked={value.paidAllowed === true} disabled={pending || value.policyRecoveryRequired} onCheckedChange={enabled => void apply({ operation: 'paid-policy', enabled, expectedAllowed: value.paidAllowed === true })} /></div>}
    {pending && <p role="status" className="text-sm text-muted-foreground">Waiting for owner confirmation or the server operation...</p>}
    <Dialog open={selected !== null} onOpenChange={open => { if (!open) close() }}>
      <TaskDialogContent title={selected ? `Connect ${names[selected.id]}` : 'Connect provider'} description="Saved on your server over this authenticated HTTPS connection. You must verify and activate it separately." showCloseButton={!pending} onEscapeKeyDown={event => { if (pending) event.preventDefault() }} onPointerDownOutside={event => { if (pending) event.preventDefault() }}>
        <form className="flex min-h-0 flex-col" onSubmit={event => {
          event.preventDefault()
          if (!selected || pending || !/^[!-~]{8,4096}$/.test(secret)) return
          const operation: ProviderCredentialOperation = { operation: 'stage', provider: selected.id, secret, activeRevision: selected.activeRevision, stagedRevision: selected.stagedRevision }
          setSecret('')
          void apply(operation)
        }}>
          <OverlayBody><div className="space-y-2"><Label htmlFor="hosted-provider-key">API key</Label><Input id="hosted-provider-key" type="password" autoComplete="off" spellCheck={false} maxLength={4096} required minLength={8} pattern="[!-~]+" disabled={pending} value={secret} onChange={event => setSecret(event.target.value)} /></div><p className="text-xs leading-5 text-muted-foreground">Conker never returns the key or persists it in browser storage. Saving a key does not enable paid requests, change your answering model, or grant tool permissions.</p>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</OverlayBody>
          <FormActions inset><Button type="button" variant="outline" disabled={pending} onClick={close}>Cancel</Button><Button type="submit" disabled={pending || !/^[!-~]{8,4096}$/.test(secret)}>{pending ? 'Saving...' : 'Save key'}</Button></FormActions>
        </form>
      </TaskDialogContent>
    </Dialog>
  </WorkspaceSection>
}
