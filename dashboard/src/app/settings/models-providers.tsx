import { useEffect, useState } from "react"
import { ChevronDown, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { CollectionEmpty, FormActions } from "@/components/design-system"
import { ModelRolesEditor } from "./model-roles-editor"
import {
  getAvailableModels,
  validateModelsConfiguration,
  type ModelProvider,
  type ModelsConfiguration,
} from "@/lib/api/model-catalogue"

type ModelsProvidersProps = {
  configuration: ModelsConfiguration
  pending: boolean
  onSave: (configuration: ModelsConfiguration) => Promise<boolean>
}

// Retain an unfinished in-memory form across Settings navigation, like other editors.
let retainedDraft: ModelsConfiguration | null = null

export function ModelsProviders({ configuration, pending, onSave }: ModelsProvidersProps) {
  const [draft, setDraft] = useState<ModelsConfiguration>(() => retainedDraft || structuredClone(configuration))
  const [showKeys, setShowKeys] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const availableModels = getAvailableModels(draft)
  const dirty = JSON.stringify(draft) !== JSON.stringify(configuration)
  useEffect(() => { retainedDraft = dirty ? draft : null }, [dirty, draft])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  function updateDraft(next: ModelsConfiguration) {
    const available = getAvailableModels(next)
    // Keep a valid fallback if the currently selected provider or model is disabled.
    if (!available.some(model => model.id === next.defaultModelId)) next.defaultModelId = available[0]?.id ?? null
    setDraft(next)
    setSaved(false)
    setError(null)
  }

  function updateProvider(id: ModelProvider["id"], patch: Partial<ModelProvider>) {
    updateDraft({ ...draft, providers: draft.providers.map(provider => provider.id === id ? { ...provider, ...patch } : provider) })
  }

  return <Card>
    <CardHeader className="flex flex-wrap items-start justify-between gap-3 sm:flex-row">
      <div className="min-w-0 space-y-1.5">
        <CardTitle><h2>Models / Providers</h2></CardTitle>
        <CardDescription>Manage the catalogue used by conversation model picks and the default route.</CardDescription>
      </div>
      <Badge variant="outline">Not connected</Badge>
    </CardHeader>
    <CardContent>
      <form className="space-y-6" noValidate onSubmit={async event => {
        event.preventDefault()
        const validation = validateModelsConfiguration(draft)
        setError(validation)
        if (validation) return
        try {
          const result = await onSave(structuredClone(draft))
          setSaved(result)
          if (!result) setError("The draft could not be saved. Try again.")
        } catch {
          setSaved(false)
          setError("The draft could not be saved. Try again.")
        }
      }}>
        <p className="text-sm leading-6 text-muted-foreground">Preview configuration only. Nothing is sent to a provider. Endpoints and keys stay in memory until reload; use a placeholder key while trying this out.</p>
        <div className="grid items-start gap-3 border-y py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-1">
            <Label htmlFor="default-model-route">Default route</Label>
            <p className="text-sm leading-6 text-muted-foreground">Used when a conversation has no model override.</p>
          </div>
          <div className="min-w-0 space-y-2">
            <Select value={draft.defaultModelId ?? "none"} disabled={pending || !availableModels.length} onValueChange={value => updateDraft({ ...draft, defaultModelId: value === "none" ? null : value })}>
              <SelectTrigger id="default-model-route" className="w-full min-w-0"><SelectValue placeholder="No enabled models" /></SelectTrigger>
              <SelectContent>
                {availableModels.length ? availableModels.map(model => <SelectItem key={model.id} value={model.id}>{model.name} · {draft.providers.find(provider => provider.id === model.providerId)?.name}</SelectItem>) : <SelectItem value="none">No enabled models</SelectItem>}
              </SelectContent>
            </Select>
            {!availableModels.length && <p className="text-sm leading-6 text-muted-foreground">Enable a provider and one of its models to choose a route.</p>}
          </div>
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="min-w-0 space-y-4" aria-labelledby="model-providers-title">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="model-providers-title" className="font-medium">Providers</h3>
              <Button type="button" variant="ghost" size="sm" aria-pressed={showKeys} onClick={() => setShowKeys(value => !value)}>
                {showKeys ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}{showKeys ? "Hide keys" : "Show keys"}
              </Button>
            </div>
            {!draft.providers.length && <CollectionEmpty title="No providers configured" description="Provider configuration will appear here when it is available." />}
            {draft.providers.map(provider => <fieldset key={provider.id} className="min-w-0 space-y-3 border-t pt-3" disabled={pending}>
              <legend className="sr-only">{provider.name}</legend>
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{provider.name}</span>
                  <Badge variant="outline" className="text-muted-foreground">Not connected</Badge>
                </div>
                <Switch aria-label={`Enable ${provider.name}`} checked={provider.enabled} onCheckedChange={enabled => updateProvider(provider.id, { enabled })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="min-w-0 space-y-2">
                  <Label htmlFor={`model-${provider.id}-endpoint`}>Endpoint</Label>
                  <Input id={`model-${provider.id}-endpoint`} type="url" autoComplete="off" spellCheck={false} value={provider.endpoint} onChange={event => updateProvider(provider.id, { endpoint: event.target.value })} />
                </div>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor={`model-${provider.id}-key`}>API key draft</Label>
                  <Input id={`model-${provider.id}-key`} type={showKeys ? "text" : "password"} autoComplete="off" spellCheck={false} placeholder="Placeholder key" value={provider.apiKeyDraft} onChange={event => updateProvider(provider.id, { apiKeyDraft: event.target.value })} />
                </div>
              </div>
            </fieldset>)}
          </section>
          <section className="min-w-0 space-y-4" aria-labelledby="model-catalogue-title">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="model-catalogue-title" className="font-medium">Model catalogue</h3>
              <span className="text-xs text-muted-foreground">{availableModels.length} enabled</span>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">Sample model names and routes. Availability, capabilities, and pricing have not been checked.</p>
            <div className="divide-y border-y">
              {!draft.models.length && <CollectionEmpty title="No models configured" description="Models from your configuration will appear here and in the composer." />}
              {draft.models.map(model => {
                const provider = draft.providers.find(item => item.id === model.providerId)
                return <div key={model.id} className="space-y-2 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">{model.name}{draft.defaultModelId === model.id && <Badge variant="secondary">Default</Badge>}</p>
                      <p className="text-xs text-muted-foreground">{provider?.name ?? "Unknown provider"}{!provider?.enabled && " · Provider disabled"}</p>
                    </div>
                    <Switch disabled={pending} aria-label={`Enable ${model.name} through ${provider?.name ?? "unknown provider"}`} checked={model.enabled} onCheckedChange={enabled => updateDraft({ ...draft, models: draft.models.map(item => item.id === model.id ? { ...item, enabled } : item) })} />
                  </div>
                  <details className="group">
                    <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"><ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />Model route</summary>
                    <div className="mt-2 space-y-2">
                      <Label htmlFor={`model-route-${model.id}`}>Request model ID</Label>
                      <Input id={`model-route-${model.id}`} value={model.route} disabled={pending} autoComplete="off" spellCheck={false} onChange={event => updateDraft({ ...draft, models: draft.models.map(item => item.id === model.id ? { ...item, route: event.target.value } : item) })} />
                    </div>
                  </details>
                </div>
              })}
            </div>
          </section>
        </div>
        <ModelRolesEditor configuration={draft} pending={pending} onChange={roleSettings => updateDraft({ ...draft, roleSettings })} />
        {error && <p role="alert" className="text-sm leading-6 text-destructive">{error}</p>}
        <FormActions description={<span role="status">{saved ? "Saved for this preview. Catalogue available to chat; helper roles remain unwired." : dirty ? "Unsaved changes" : "Model draft is up to date"}</span>}>
          <Button type="button" variant="outline" disabled={pending || !dirty} onClick={() => {
            setDraft(structuredClone(configuration))
            setError(null)
            setSaved(false)
            setShowKeys(false)
          }}>Discard changes</Button>
          <Button type="submit" disabled={pending || !dirty}>{pending ? "Saving…" : "Save model draft"}</Button>
        </FormActions>
      </form>
    </CardContent>
  </Card>
}
