import { useEffect, useRef, useState, type ReactNode } from "react"
import { useStore } from "zustand"
import { LogOut, RefreshCw } from "lucide-react"
import { CompanionPortrait } from "@/components/companion-portrait"
import { PageHeader } from "@/components/design-system/primitives"
import { FormActions } from "@/components/design-system/overlays"
import { PageContainer } from "@/components/layouts/page-container"
import { ModeToggle } from "@/components/mode-toggle"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { createGatewayAuthStore } from "@/lib/gateway/auth-store"

type GatewayStore = ReturnType<typeof createGatewayAuthStore>
type GatewayProps = { store: GatewayStore; onSignedOut?: () => void }

function GatewayFrame({ title, description, children, authenticated = false }: { title: string; description: string; children: ReactNode; authenticated?: boolean }) {
  return <div className="min-h-svh bg-background text-foreground">
    <header className="border-b"><PageContainer className="flex items-center gap-3 py-4"><CompanionPortrait portrait="/conker.png" name="Conker" tone="graphite" /><span className="font-semibold">Conker</span><Badge variant="outline">{authenticated ? "Signed in" : "Gateway"}</Badge><div className="ml-auto"><ModeToggle /></div></PageContainer></header>
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8 sm:px-6 sm:py-12"><PageHeader title={title} description={description} />{children}</main>
  </div>
}

function GatewaySignIn({ store }: { store: GatewayStore }) {
  const { pending, error } = useStore(store)
  const [password, setPassword] = useState("")
  return <GatewayFrame title="Sign in to Conker" description="Use the owner password configured on the machine hosting Conker.">
    <form className="space-y-5" onSubmit={event => { event.preventDefault(); if (!password || pending) return; const submitted = password; setPassword(""); void store.getState().login(submitted) }}>
      <div className="space-y-2"><Label htmlFor="gateway-password">Owner password</Label><Input id="gateway-password" name="password" type="password" autoComplete="current-password" maxLength={2048} required disabled={pending} value={password} onChange={event => setPassword(event.target.value)} aria-describedby="gateway-password-help" autoFocus /><p id="gateway-password-help" className="text-xs text-muted-foreground">Spaces and Unicode are preserved. The password is sent only to this gateway.</p></div>
      {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
      <FormActions><Button type="submit" disabled={pending || !password}>{pending ? "Signing in…" : "Sign in"}</Button></FormActions>
    </form>
    <details className="border-t pt-4"><summary className="cursor-pointer rounded-sm text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">Forgot the password?</summary><p className="mt-3 text-sm leading-6 text-muted-foreground">On the machine hosting Conker, run <code className="font-mono">conker auth reset-password</code>. Recovery requires access to that host and signs out existing browser sessions.</p></details>
  </GatewayFrame>
}

async function signOut(store: GatewayStore, onSignedOut?: () => void) {
  if (store.getState().pending) return
  if (await store.getState().logout()) {
    // A document reload also clears module-local drafts, queues and media state.
    if (onSignedOut) onSignedOut()
    else window.location.reload()
  }
}

/** Mount above every live-data provider and media host. Never depends on a fixture Snapshot. */
export function GatewayBoundary({ store, children, onSignedOut }: GatewayProps & { children: ReactNode }) {
  const state = useStore(store)
  const checkedExpiry = useRef<string | null>(null)
  useEffect(() => { void store.getState().bootstrap() }, [store])
  useEffect(() => {
    if (state.phase !== "authenticated" || !state.session) return
    // One absolute-expiry check, not a heartbeat that would keep idle sessions alive.
    const identity = `${state.session.sessionId}:${state.session.expiresAt}`
    if (checkedExpiry.current === identity) return
    const remaining = state.session.expiresAt * 1000 - Date.now()
    const timer = window.setTimeout(() => { checkedExpiry.current = identity; void store.getState().revalidate() }, Math.max(0, Math.min(remaining, 2_147_483_647)))
    return () => window.clearTimeout(timer)
  }, [store, state.phase, state.session])

  if (state.phase === "authenticated" && state.session?.authenticated && !state.session.setupRequired && !state.pending && !state.logoutUnconfirmed) return <>{children}</>
  if (state.phase === "checking" || state.pending) return <GatewayFrame title="Checking your session" description="Verifying access with this gateway before opening your workspace."><p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><RefreshCw className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />Please wait…</p></GatewayFrame>
  if (state.logoutUnconfirmed) return <GatewayFrame title="Sign-out was not confirmed" description="This screen is locked. The server session may still be active until sign-out succeeds or the host revokes it.">
    {state.error && <p role="alert" className="text-sm text-destructive">{state.error.message}</p>}
    <Button onClick={() => void signOut(store, onSignedOut)}><LogOut />Retry sign out</Button>
    <p className="text-sm leading-6 text-muted-foreground">To revoke every browser session from the host, run <code className="font-mono">conker auth revoke-all</code>.</p>
  </GatewayFrame>
  if (state.phase === "setup-required") return <GatewayFrame title="Set up the owner password on the host" description="The owner password has not been configured. Browser visitors cannot set or reset it.">
    <div className="space-y-3 rounded-lg border bg-card p-5 text-card-foreground"><p className="text-sm">Run this command in a terminal on the machine hosting Conker:</p><pre className="overflow-x-auto text-sm"><code>conker auth setup</code></pre><p className="text-sm text-muted-foreground">Choose a password of 15–1,024 characters when prompted. Then check setup again.</p></div>
    <Button onClick={() => void store.getState().revalidate()}><RefreshCw />Check setup again</Button>
    {state.error && <p role="alert" className="text-sm text-destructive">{state.error.message}</p>}
  </GatewayFrame>
  if (state.phase === "anonymous") return <GatewaySignIn store={store} />
  return <GatewayFrame title="Could not verify access" description="Check that the gateway is running and that you opened its configured HTTPS address.">
    {state.error && <p role="alert" className="text-sm text-destructive">{state.error.message}</p>}
    <Button onClick={() => void store.getState().revalidate()}><RefreshCw />Retry connection</Button>
    <p className="text-xs leading-5 text-muted-foreground">No workspace data is shown while access is unverified. Retrying checks the session; it does not repeat a previous workspace action.</p>
  </GatewayFrame>
}

/** Initial authenticated landing surface, before a real runtime workspace is connected. */
export function GatewayStatusSurface({ store, onSignedOut }: GatewayProps) {
  const { session, pending, error } = useStore(store)
  if (!session?.authenticated) return null
  return <GatewayFrame authenticated title="Your browser is signed in" description="Authentication is connected to this gateway. The live conversation workspace is not connected to this screen yet.">
    <dl className="space-y-4 rounded-lg border bg-card p-5 text-card-foreground"><div><dt className="text-sm text-muted-foreground">Session status</dt><dd className="mt-1 text-sm font-medium">Authenticated</dd></div><div><dt className="text-sm text-muted-foreground">Absolute session expiry</dt><dd className="mt-1 text-sm"><time dateTime={new Date(session.expiresAt * 1000).toISOString()}>{new Date(session.expiresAt * 1000).toLocaleString()}</time></dd></div></dl>
    <p className="text-sm leading-6 text-muted-foreground">The server also expires idle sessions. Checking access does not connect tools, start work or load fixture records.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
    <FormActions><Button variant="outline" disabled={pending} onClick={() => void store.getState().revalidate()}><RefreshCw />Check session</Button><Button disabled={pending} onClick={() => void signOut(store, onSignedOut)}><LogOut />Sign out</Button></FormActions>
  </GatewayFrame>
}
