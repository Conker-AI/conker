import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { AuthLayout } from "@/components/layouts/auth-layout"
import { CompanionPortrait } from "@/components/companion-portrait"
import { ConnectionsFields } from "@/components/connections-form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useConker, useConkerStore } from "@/lib/api/store"
import { conkerClient } from "@/lib/api"
import { validateConnections } from "@/lib/api/config"

export default function SetupPage() {
  const [step, setStep] = useState(0)
  const [ownerName, setOwnerName] = useState(useConker(data => data.auth.ownerName))
  const [connections, setConnections] = useState(useConker(data => data.connections))
  const profile = useConker(data => data.profile)
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [error, setError] = useState("")
  const [result, setResult] = useState("")
  const { mutate, pending, error: clientError } = useConkerStore()
  const navigate = useNavigate()
  const finish = async () => {
    setError("")
    try { validateConnections(connections) } catch (error) { setError((error as Error).message); return }
    await mutate(async () => {
      const response = await conkerClient.setup({ ownerName, password, connections })
      setPassword(""); setConfirmation("")
      if (response.wired) navigate("/")
      else setResult(response.message)
    })
  }
  return <AuthLayout>
    <ol aria-label="Setup progress" className="mb-6 grid grid-cols-3 gap-2">{["Welcome", "Password", "Services"].map((label, index) => <li key={label} aria-current={index === step ? "step" : undefined} className={`border-b-2 pb-3 text-sm ${index === step ? "border-primary font-medium" : "border-border text-muted-foreground"}`}>{index + 1}. {label}</li>)}</ol>
    <div className="space-y-6 rounded-xl border p-5 sm:p-6">
      {step === 0 && <><CompanionPortrait profile={profile} className="size-16" /><div><h1 className="text-2xl font-semibold tracking-tight">Welcome to Conker</h1><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Set up a private dashboard for your conversations, memory, and decisions. This walkthrough is UI only: it cannot secure the dashboard or connect services yet.</p></div><div className="space-y-2"><Label htmlFor="owner-name">What should we call you?</Label><Input id="owner-name" maxLength={60} value={ownerName} onChange={event => setOwnerName(event.target.value)} autoComplete="given-name" /></div><Button disabled={!ownerName.trim()} onClick={() => setStep(1)}>Continue</Button></>}
      {step === 1 && <form className="space-y-5" onSubmit={event => { event.preventDefault(); setError(""); if (password.length < 12) setError("Use at least 12 characters."); else if (password !== confirmation) setError("The passwords don’t match."); else setStep(2) }}><div><h1 className="text-2xl font-semibold tracking-tight">Set a dashboard password</h1><p className="mt-2 text-sm leading-relaxed text-muted-foreground">This password will protect access to your dashboard and owner decisions. It is separate from your service API keys. In this preview, it is never stored or sent to a server.</p></div><div className="space-y-2"><Label htmlFor="setup-password">Password</Label><Input id="setup-password" type="password" autoComplete="new-password" required minLength={12} value={password} onChange={event => setPassword(event.target.value)} aria-describedby="password-help" /><p id="password-help" className="text-xs text-muted-foreground">Use at least 12 characters. A memorable phrase works well.</p></div><div className="space-y-2"><Label htmlFor="confirm-password">Confirm password</Label><Input id="confirm-password" type="password" autoComplete="new-password" required value={confirmation} onChange={event => setConfirmation(event.target.value)} /></div><div className="flex gap-3"><Button type="button" variant="outline" onClick={() => { setError(""); setStep(0) }}>Back</Button><Button>Continue</Button></div></form>}
      {step === 2 && !result && <form className="space-y-5" onSubmit={event => { event.preventDefault(); void finish() }}><div><h1 className="text-2xl font-semibold tracking-tight">Connect your services</h1><p className="mt-2 text-sm text-muted-foreground">Prepare the connection details, or leave them blank to explore fixtures.</p></div><ConnectionsFields value={connections} onChange={setConnections} /><div className="flex gap-3"><Button type="button" variant="outline" disabled={pending} onClick={() => { setError(""); setStep(1) }}>Back</Button><Button disabled={pending}>{pending ? "Preparing…" : "Finish setup preview"}</Button></div></form>}
      {result && <div className="space-y-4"><h1 className="text-2xl font-semibold">Preview ready</h1><p role="status" className="text-sm leading-relaxed text-muted-foreground">{result} Connection details are held for this preview only; no service was contacted.</p><Button disabled={pending} onClick={async () => { if (await mutate(() => conkerClient.enterPreview(ownerName))) navigate("/") }}>Explore fixture dashboard</Button></div>}
      {(error || clientError) && <p role="alert" className="text-sm text-destructive">{error || clientError}</p>}
    </div>
    <p className="mt-5 text-center text-sm text-muted-foreground">Already configured? <Link className="text-foreground underline underline-offset-4" to="/login">Open login</Link></p>
  </AuthLayout>
}
