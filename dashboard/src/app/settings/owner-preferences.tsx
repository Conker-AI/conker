import { useEffect } from "react"
import { useOwnerPreferences } from "@/lib/owner-preferences-workspace"
import type { OwnerPreferences } from "@/lib/api/owner-preferences-types"
import { FormActions } from "@/components/design-system"
import { ReferenceSection } from "@/components/reference-section"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function OwnerPreferencesEditor({ section }: { section: "proactivity" | "account" }) {
  const { saved, draft, pending, error, notice, load, update, save, discard } = useOwnerPreferences()
  const dirty = !!draft && JSON.stringify(saved) !== JSON.stringify(draft)
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])
  if (!draft) return <div className="space-y-3"><p role={error ? "alert" : "status"} className="text-sm text-muted-foreground">{error || "Loading preferences…"}</p>{error && <Button variant="outline" disabled={pending} onClick={() => void load()}>Retry</Button>}</div>
  const quiet = draft.quietHours
  const setQuiet = (value: Partial<OwnerPreferences["quietHours"]>) => update({ ...draft, quietHours: { ...quiet, ...value } })
  const setBudget = (key: keyof OwnerPreferences["dailyBudget"], value: number) => update({ ...draft, dailyBudget: { ...draft.dailyBudget, [key]: value } })
  return <form className="min-w-0 space-y-6" onSubmit={event => { event.preventDefault(); void save() }}>
    <fieldset disabled={pending} className="min-w-0 space-y-6">
      {section === "account" ? <ReferenceSection title="Idle lock preference"><div className="space-y-2"><Label htmlFor="owner-idle-timeout">Lock after inactivity</Label><Select value={String(draft.idleTimeoutMinutes)} disabled={pending} onValueChange={value => update({ ...draft, idleTimeoutMinutes: Number(value) as OwnerPreferences["idleTimeoutMinutes"] })}><SelectTrigger id="owner-idle-timeout" className="min-w-0 w-full max-w-full sm:w-64"><SelectValue className="min-w-0 truncate" /></SelectTrigger><SelectContent>{[0, 5, 15, 30, 60].map(value => <SelectItem key={value} value={String(value)}>{value ? `${value} minutes` : "Never"}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">Configured only. This open fixture does not lock, authenticate, or require reauthentication. Enforcement needs the backend.</p></div></ReferenceSection> : <>
        <ReferenceSection title="Notifications"><div className="space-y-2"><Label htmlFor="owner-urgency">Notify me about</Label><Select value={draft.urgency} disabled={pending} onValueChange={value => update({ ...draft, urgency: value as OwnerPreferences["urgency"] })}><SelectTrigger id="owner-urgency" className="min-w-0 w-full max-w-full sm:w-80"><SelectValue className="min-w-0 truncate" /></SelectTrigger><SelectContent><SelectItem value="meaningful">Meaningful results and required decisions</SelectItem><SelectItem value="urgent_only">Urgent issues only</SelectItem><SelectItem value="off">No proactive notifications</SelectItem></SelectContent></Select><p className="text-xs text-muted-foreground">A delivery preference for results, failures, and decisions—not polling updates. Notifications are not delivered by this preview.</p></div></ReferenceSection>
        <ReferenceSection title="Quiet hours"><div className="flex items-center justify-between gap-4"><Label htmlFor="owner-quiet">Use quiet hours</Label><Switch id="owner-quiet" checked={quiet.enabled} onCheckedChange={enabled => setQuiet({ enabled })} /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="owner-quiet-start">Start</Label><Input id="owner-quiet-start" type="time" required value={quiet.start} onChange={event => setQuiet({ start: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="owner-quiet-end">End</Label><Input id="owner-quiet-end" type="time" required value={quiet.end} onChange={event => setQuiet({ end: event.target.value })} /></div></div><div className="space-y-2"><Label htmlFor="owner-timezone">Time zone</Label><Input id="owner-timezone" required value={quiet.timeZone} maxLength={100} placeholder="Asia/Jerusalem" onChange={event => setQuiet({ timeZone: event.target.value })} /><p className="text-xs text-muted-foreground">IANA time zone. Overnight windows, such as 22:00–07:00, are supported.</p></div><div className="flex items-start justify-between gap-4"><div><Label htmlFor="owner-urgent-exceptions">Allow urgent interruptions during quiet hours</Label><p className="mt-1 text-xs text-muted-foreground">Applies only when proactive notifications are enabled.</p></div><Switch id="owner-urgent-exceptions" disabled={!quiet.enabled || draft.urgency === "off"} checked={quiet.urgentExceptions} onCheckedChange={urgentExceptions => setQuiet({ urgentExceptions })} /></div></ReferenceSection>
        <ReferenceSection title="Daily proactive budget"><div className="grid gap-4 sm:grid-cols-3"><div className="space-y-2"><Label htmlFor="owner-suggestions">Suggestions per day</Label><Input id="owner-suggestions" type="number" required min={0} max={100} step={1} value={Number.isNaN(draft.dailyBudget.suggestions) ? "" : draft.dailyBudget.suggestions} onChange={event => setBudget("suggestions", event.target.valueAsNumber)} /></div><div className="space-y-2"><Label htmlFor="owner-research-minutes">Research minutes per day</Label><Input id="owner-research-minutes" type="number" required min={0} max={1440} step={1} value={Number.isNaN(draft.dailyBudget.researchMinutes) ? "" : draft.dailyBudget.researchMinutes} onChange={event => setBudget("researchMinutes", event.target.valueAsNumber)} /></div><div className="space-y-2"><Label htmlFor="owner-cost">Daily cost ceiling (US cents)</Label><Input id="owner-cost" type="number" required min={0} max={100000} step={1} value={Number.isNaN(draft.dailyBudget.costCents) ? "" : draft.dailyBudget.costCents} onChange={event => setBudget("costCents", event.target.valueAsNumber)} /></div></div><p className="text-xs text-muted-foreground">Zero means no allowance for that category. These are configured limits, not metered or enforced in the preview. Suggestions do not execute actions; a budget never grants permission to act or spend.</p></ReferenceSection>
      </>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </fieldset>
    <FormActions description={<span role="status">{notice || (dirty ? "Unsaved preferences · draft kept across routes. Save includes Proactivity and Account edits." : "Preview preferences · reset on reload")}</span>}><Button type="button" variant="outline" disabled={pending || !dirty} onClick={discard}>Discard changes</Button><Button disabled={pending || !dirty}>{pending ? "Saving…" : "Save preferences"}</Button></FormActions>
  </form>
}
