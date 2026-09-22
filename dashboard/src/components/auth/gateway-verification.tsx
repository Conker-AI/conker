import { useState } from 'react'
import { useStore } from 'zustand'
import { FormActions, OverlayBody, TaskDialogContent } from '@/components/design-system/overlays'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import { gatewaySessionUnlocked } from '@/lib/gateway/session-policy'
import type { GatewayVerificationStore } from '@/lib/gateway/verification'

function VerificationForm({ store }: { store: GatewayVerificationStore }) {
  const { challenge, pending, error } = useStore(store)
  const [password, setPassword] = useState('')
  if (!challenge) return null
  return <form className="flex min-h-0 flex-col" onSubmit={event => {
    event.preventDefault()
    if (!password || pending) return
    const submitted = password
    setPassword('')
    void store.getState().submit(submitted)
  }}><OverlayBody>
    <div className="space-y-2"><p className="break-words text-sm font-medium">{challenge.target}</p><ul className="space-y-1 text-xs leading-5 text-muted-foreground">{challenge.details.map((detail, index) => <li key={index}>{detail}</li>)}</ul><details className="text-xs text-muted-foreground"><summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ring">Request details</summary><p className="mt-2 break-all font-mono">POST {challenge.path}</p></details></div>
    <p className="text-xs leading-5 text-muted-foreground">Your password authorizes this submitted operation once. No operation is sent until verification succeeds. Closing this prompt keeps it unsent.</p>
    <div className="space-y-2"><Label htmlFor="gateway-operation-password">Owner password</Label><Input id="gateway-operation-password" name="password" type="password" autoComplete="current-password" maxLength={2048} required disabled={pending} value={password} onChange={event => setPassword(event.target.value)} /><p className="text-xs text-muted-foreground">Spaces and Unicode are preserved. The password is cleared from this form before verification.</p></div>
    {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
  </OverlayBody><FormActions inset><Button type="button" variant="outline" onClick={() => store.getState().cancel()}>Cancel operation</Button><Button type="submit" disabled={!password || pending}>{pending ? 'Verifying…' : 'Verify and submit'}</Button></FormActions></form>
}

/** Sibling of GatewayBoundary: a busy task dialog cannot disable this independent password prompt. */
export function GatewayOperationVerification({ store, authStore }: { store: GatewayVerificationStore; authStore: GatewayAuthStore }) {
  const challenge = useStore(store, state => state.challenge)
  const auth = useStore(authStore)
  const visible = auth.phase === 'authenticated' && !auth.pending && !auth.logoutUnconfirmed && gatewaySessionUnlocked(auth.session)
  return <Dialog open={visible && !!challenge} onOpenChange={open => { if (!open) store.getState().cancel() }}><TaskDialogContent title={challenge?.title ?? 'Verify operation'} description="Confirm the target, then verify your owner password." onInteractOutside={event => event.preventDefault()} onOpenAutoFocus={event => {
    // Wait for Radix to pause the underlying dialog's focus scope before focusing.
    event.preventDefault()
    document.getElementById('gateway-operation-password')?.focus()
  }}>
    {challenge && visible && <VerificationForm key={challenge.id} store={store} />}
  </TaskDialogContent></Dialog>
}
