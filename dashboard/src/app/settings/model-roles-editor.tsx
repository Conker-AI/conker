import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { getAvailableModels, type ModelsConfiguration } from "@/lib/api/model-catalogue"
import { createModelRoles, MODEL_ROLES, MODEL_ROLE_LABELS, modelRolesErrors, type ModelRole, type ModelRoleAssignment, type ModelRolesConfiguration } from "@/lib/api/model-roles"

export function ModelRolesEditor({ configuration, pending, onChange }: { configuration: ModelsConfiguration; pending: boolean; onChange: (roles: ModelRolesConfiguration) => void }) {
  const settings = configuration.roleSettings || createModelRoles(configuration)
  const available = getAvailableModels(configuration)
  const errors = modelRolesErrors(settings, configuration)
  const updateRole = (role: ModelRole, patch: Partial<ModelRoleAssignment>) => onChange({ ...settings, roles: { ...settings.roles, [role]: { ...settings.roles[role], ...patch } } })
  const chooseModel = (role: ModelRole, key: "modelId" | "fallbackModelId", id: string) => {
    const assignment = settings.roles[role]
    const modelId = id === "none" ? null : id
    updateRole(role, { [key]: modelId, eligibleModelIds: modelId ? [...new Set([...assignment.eligibleModelIds, modelId])] : assignment.eligibleModelIds })
  }
  return <section aria-labelledby="model-roles-title" className="space-y-4 border-t pt-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 id="model-roles-title" className="font-medium">Model roles</h3><Badge variant="outline">Preview · not wired</Badge></div>
    <p className="text-sm leading-6 text-muted-foreground">Assign replaceable models to each role. These choices do not activate helper calls or change the current chat executor; conversations still use their selected model or Default route. Capability, price and privacy compatibility remain unverified.</p>
    <div className="grid items-start gap-3 md:grid-cols-2"><div className="space-y-1"><Label htmlFor="answer-selection-mode">Answer selection</Label><p className="text-xs leading-5 text-muted-foreground">A manual lock never falls back to another model. Router mode permits a separate routing model to choose only among the answer role’s eligible models.</p></div><Select value={settings.answerMode} disabled={pending} onValueChange={mode => onChange({ ...settings, answerMode: mode as ModelRolesConfiguration["answerMode"], roles: { ...settings.roles, answer: mode === "manual" ? { ...settings.roles.answer, failure: "stop", fallbackModelId: null } : settings.roles.answer } })}><SelectTrigger id="answer-selection-mode" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manual">Manual answer lock (preview)</SelectItem><SelectItem value="router">Configured router (preview)</SelectItem></SelectContent></Select></div>
    <div className="space-y-3">{MODEL_ROLES.map(role => {
      const assignment = settings.roles[role]
      const name = MODEL_ROLE_LABELS[role]
      const locked = role === "answer" && settings.answerMode === "manual"
      const selectedName = configuration.models.find(model => model.id === assignment.modelId)?.name
      const options = configuration.models.filter(model => available.some(item => item.id === model.id) || model.id === assignment.modelId || model.id === assignment.fallbackModelId)
      return <details key={role} className="min-w-0 rounded-lg border bg-card text-card-foreground">
        <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 rounded-lg bg-muted p-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring"><span>{name}</span><span className="text-xs font-normal text-muted-foreground">{assignment.enabled ? selectedName || "Choose a model" : "Disabled"}</span></summary>
        <fieldset disabled={pending} className="grid gap-4 p-4 sm:grid-cols-2"><legend className="sr-only">{name} role settings</legend>
          <div className="flex items-center justify-between gap-3 sm:col-span-2"><Label htmlFor={`role-${role}-enabled`}>Enable role configuration</Label><Switch id={`role-${role}-enabled`} checked={assignment.enabled} onCheckedChange={enabled => updateRole(role, { enabled })} /></div>
          <div className="space-y-2"><Label htmlFor={`role-${role}-model`}>{role === "answer" && !locked ? "Default answer candidate" : "Primary model"}</Label><Select value={assignment.modelId || "none"} onValueChange={id => chooseModel(role, "modelId", id)}><SelectTrigger id={`role-${role}-model`} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Not configured</SelectItem>{options.map(model => <SelectItem key={model.id} value={model.id} disabled={!available.some(item => item.id === model.id)}>{model.name} · {model.providerId}{!available.some(item => item.id === model.id) ? " · Disabled" : ""}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label htmlFor={`role-${role}-timeout`}>Timeout (milliseconds)</Label><Input id={`role-${role}-timeout`} type="number" min={100} max={120000} step={100} value={Number.isNaN(assignment.timeoutMs) ? "" : assignment.timeoutMs} onChange={event => updateRole(role, { timeoutMs: event.target.valueAsNumber })} /></div>
          <div className="space-y-2"><Label htmlFor={`role-${role}-failure`}>On timeout or unavailable model</Label><Select value={assignment.failure} disabled={locked} onValueChange={failure => updateRole(role, { failure: failure as ModelRoleAssignment["failure"], ...(failure === "stop" ? { fallbackModelId: null } : {}) })}><SelectTrigger id={`role-${role}-failure`} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="stop">Stop and show the failure</SelectItem><SelectItem value="fallback">Use an explicit fallback</SelectItem></SelectContent></Select>{locked && <p className="text-xs leading-5 text-muted-foreground">Manual lock requires a new owner choice after failure.</p>}</div>
          {assignment.failure === "fallback" && <div className="space-y-2"><Label htmlFor={`role-${role}-fallback`}>Fallback model</Label><Select value={assignment.fallbackModelId || "none"} onValueChange={id => chooseModel(role, "fallbackModelId", id)}><SelectTrigger id={`role-${role}-fallback`} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Choose a fallback</SelectItem>{options.filter(model => model.id !== assignment.modelId).map(model => <SelectItem key={model.id} value={model.id} disabled={!available.some(item => item.id === model.id)}>{model.name} · {model.providerId}</SelectItem>)}</SelectContent></Select></div>}
          <details className="sm:col-span-2"><summary className="cursor-pointer text-xs font-medium">Owner-assigned eligible models · {assignment.eligibleModelIds.length}</summary><p className="my-3 text-xs leading-5 text-muted-foreground">Selecting a primary or fallback adds it here. These choices are not evidence that a model supports this role.</p><div className="space-y-3">{configuration.models.filter(model => available.some(item => item.id === model.id) || assignment.eligibleModelIds.includes(model.id)).map(model => <div key={model.id} className="flex items-start gap-2"><Checkbox id={`role-${role}-eligible-${model.id}`} checked={assignment.eligibleModelIds.includes(model.id)} onCheckedChange={checked => {
            const eligibleModelIds = checked === true ? [...new Set([...assignment.eligibleModelIds, model.id])] : assignment.eligibleModelIds.filter(id => id !== model.id)
            updateRole(role, { eligibleModelIds, ...(!checked && assignment.modelId === model.id ? { modelId: null } : {}), ...(!checked && assignment.fallbackModelId === model.id ? { fallbackModelId: null, failure: "stop" } : {}) })
          }} /><Label htmlFor={`role-${role}-eligible-${model.id}`} className="block text-xs leading-5">{model.name} · {model.providerId}{!available.some(item => item.id === model.id) && " · Disabled"}</Label></div>)}</div></details>
        </fieldset>
      </details>
    })}</div>
    {configuration.roleSettings && errors.length > 0 && <div role="status" className="space-y-1 rounded-md border bg-muted p-3">{errors.map((error, index) => <p key={index} className="text-xs leading-5 text-destructive">{error}</p>)}</div>}
    <p className="text-xs leading-5 text-muted-foreground">No harness disables routing, selection and summarization helpers. No memory separately excludes memory access. Every future adapter must recheck capability, provider privacy and spend limits before sending data.</p>
  </section>
}
