import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { AuthLayout } from "@/components/layouts/auth-layout"
import { CompanionPortrait } from "@/components/companion-portrait"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useConker, useConkerStore } from "@/lib/api/store"
import { conkerClient } from "@/lib/api"

export default function LoginPage() {
  const profile = useConker(data => data.profile)
  const [password, setPassword] = useState("")
  const [message, setMessage] = useState("")
  const { mutate, pending, error } = useConkerStore()
  const navigate = useNavigate()
  return <AuthLayout><div className="space-y-5 rounded-xl border p-5 sm:p-6">
    <CompanionPortrait profile={profile} className="size-16" /><div><h1 className="text-2xl font-semibold tracking-tight">Open your dashboard</h1><p className="mt-2 text-sm text-muted-foreground">Authentication is not connected. This form previews login; it does not verify a password or protect the dashboard.</p></div>
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); void mutate(async () => { const result = await conkerClient.login(password); setPassword(""); if (result.wired) navigate("/"); else setMessage(result.message) }) }}>
      <div className="space-y-2"><Label htmlFor="login-password">Dashboard password</Label><Input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></div>
      <Button disabled={pending || !password}>{pending ? "Checking…" : "Preview sign in"}</Button>
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </form>
    <div className="space-y-4 border-t pt-4"><Button variant="outline" disabled={pending} onClick={async () => { if (await mutate(() => conkerClient.enterPreview())) navigate("/") }}>Explore without signing in</Button><p className="text-sm text-muted-foreground">First time? <Link className="text-foreground underline underline-offset-4" to="/setup">Preview setup</Link></p></div>
  </div></AuthLayout>
}
