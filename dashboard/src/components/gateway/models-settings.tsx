import { useEffect, useState } from 'react'
import { Check, Monitor, Moon, Sun, Trash2, Upload } from 'lucide-react'
import { ModelsProviders } from '@/app/settings/models-providers'
import type { ModelsConfiguration } from '@/lib/api/model-catalogue'
import type { GatewayControlClient, OwnerModelSettings, ProviderStatus } from '@/lib/gateway/control'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { withAnswerModel, withIdeas } from '@/lib/api/model-roles'
import { Switch } from '@/components/ui/switch'
import { PageHeader, WorkspaceSection } from '@/components/design-system/primitives'
import { GatewayPageFrame } from './page-frame'
import { Input } from '@/components/ui/input'
import { OwnerAvatar } from './owner-avatar'
import { saveOwnerProfile, useOwnerProfile } from '@/lib/owner-profile'
import { useTheme } from '@/hooks/use-theme'

const providerNames: Record<string, string> = { ollama: 'Local model', openrouter: 'OpenRouter', anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Google Gemini' }
const providerName = (id: string) => providerNames[id] ?? id.charAt(0).toUpperCase() + id.slice(1)
const providerState = (provider: ProviderStatus) => provider.busy ? 'Busy' : provider.status === 'ok' ? 'Ready' : provider.status === 'unverified' ? 'Configured on server' : provider.status === 'not_configured' ? 'Not set up' : 'Unavailable'
const PROVIDER_DOCS = 'https://github.com/Conker-AI/conker/blob/main/docs/reference/provider-credentials.md'
const IDEAS_DOCS = 'https://github.com/Conker-AI/pi/blob/main/docs/proposals.md#turning-it-on'

export function GatewayModelsSettings({ client }: { client: GatewayControlClient }) {
  const profile = useOwnerProfile()
  const [profileName, setProfileName] = useState(profile.name)
  const [profileError, setProfileError] = useState('')
  const { theme, setTheme } = useTheme()
  const [value, setValue] = useState<OwnerModelSettings | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [reload, setReload] = useState(0)
  const [retry, setRetry] = useState(0)
  const [providers, setProviders] = useState<ProviderStatus[]>([])
  const [providerError, setProviderError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    client.models(controller.signal).then(value => { if (!controller.signal.aborted) setValue(value) }).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [client, retry])
  useEffect(() => {
    const controller = new AbortController()
    client.providers(controller.signal).then(value => { if (!controller.signal.aborted) setProviders(value) }).catch(() => { if (!controller.signal.aborted) setProviderError('Provider health could not be verified.') })
    return () => controller.abort()
  }, [client, reload])
  if (!value) return <GatewayPageFrame>{error ? <><p role="alert">{error}</p><Button variant="outline" onClick={() => setRetry(value => value + 1)}>Retry</Button></> : <p role="status">Loading model settings…</p>}</GatewayPageFrame>
  const configuration: ModelsConfiguration = value.configuration ? {
    ...value.configuration, providers: value.configuration.providers.map(provider => ({ ...provider, endpoint: '', apiKeyDraft: '' })),
  } : { providers: [], models: [], defaultModelId: null }
  const saved = value.configuration
  const enabled = saved ? saved.models.filter(model => model.enabled && saved.providers.some(provider => provider.id === model.providerId && provider.enabled)) : []
  // Pi answers with the Answer role's model; in router mode a helper chooses per message.
  const answering = saved?.roleSettings.answerMode === 'manual' && saved.roleSettings.roles.answer.enabled ? saved.roleSettings.roles.answer.modelId : null
  const onlyLocal = providers.length > 0 && !providers.slice(1).some(provider => ['ok', 'unverified'].includes(provider.status))
  const ideas = saved?.roleSettings.roles.proposals
  const ideasOn = Boolean(ideas?.enabled && ideas.modelId && enabled.some(model => model.id === ideas.modelId))
  async function save(next: Parameters<GatewayControlClient['saveModels']>[0]) {
    if (!value || pending) return
    setPending(true); setError('')
    try { setValue(await client.saveModels(next, value.revision)) }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not save settings.') }
    finally { setPending(false) }
  }
  const chooseAnswerModel = (modelId: string) => { if (saved && modelId !== answering) void save(withAnswerModel(saved, modelId)) }
  // Ideas use the answering model; off keeps the role's other settings for next time.
  const setIdeas = (on: boolean) => { if (saved) void save(withIdeas(saved, on ? answering ?? enabled[0]?.id ?? null : null)) }
  const saveProfileName = () => { saveOwnerProfile({ ...profile, name: profileName }); setProfileError('') }
  const choosePhoto = (file?: File) => {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 512 * 1024) {
      setProfileError('Choose a PNG, JPEG, or WebP image under 512 KB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => { if (typeof reader.result === 'string') { saveOwnerProfile({ ...profile, name: profileName, avatar: reader.result }); setProfileError('') } }
    reader.onerror = () => setProfileError('That photo could not be read. Choose another image.')
    reader.readAsDataURL(file)
  }
  return <GatewayPageFrame><div className="w-full max-w-3xl space-y-7">
    <PageHeader title="Settings" actionsOnly />
    <WorkspaceSection title="Profile" description="Your local identity in Conker and call mode. It is not an online account.">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <OwnerAvatar className="size-16" />
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild><label className="cursor-pointer"><Upload />Choose photo<input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { choosePhoto(event.target.files?.[0]); event.target.value = '' }} /></label></Button>
          {profile.avatar && <Button variant="ghost" size="sm" onClick={() => saveOwnerProfile({ ...profile, avatar: '' })}><Trash2 />Remove photo</Button>}
          <p className="w-full text-xs text-muted-foreground">Stored only in this browser · PNG, JPEG, or WebP · 512 KB max</p>
        </div>
      </div>
      <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={event => { event.preventDefault(); saveProfileName() }}>
        <div className="min-w-0 flex-1 space-y-2"><Label htmlFor="profile-name">Display name</Label><Input id="profile-name" maxLength={60} value={profileName} onChange={event => setProfileName(event.target.value)} /></div>
        <Button type="submit" variant="outline" disabled={!profileName.trim() || profileName.trim() === profile.name}>Save name</Button>
      </form>
      {profileError && <p role="alert" className="text-sm text-destructive">{profileError}</p>}
    </WorkspaceSection>
    <WorkspaceSection title="Appearance" description="Choose a theme for this browser.">
      <div role="radiogroup" aria-label="Color theme" className="grid grid-cols-3 rounded-lg border p-1">
        {([['system', 'System', Monitor], ['light', 'Light', Sun], ['dark', 'Dark', Moon]] as const).map(([value, label, Icon]) => <Button key={value} type="button" variant={theme === value ? 'secondary' : 'ghost'} size="sm" role="radio" aria-checked={theme === value} onClick={() => setTheme(value)}><Icon />{label}{theme === value && <Check className="hidden size-3.5 sm:block" />}</Button>)}
      </div>
    </WorkspaceSection>
    <WorkspaceSection title="Answers" description="The model that replies to you in every chat, unless you pick another one in a chat.">
      <div className="space-y-2">
        <Label htmlFor="answer-model">Answers come from</Label>
        <Select value={answering ?? ''} disabled={pending || !enabled.length} onValueChange={chooseAnswerModel}>
          <SelectTrigger id="answer-model" className="w-full min-w-0"><SelectValue placeholder={saved?.roleSettings.answerMode === 'router' ? 'Chosen automatically for each message' : enabled.length ? 'Choose a model' : 'No models set up yet'} /></SelectTrigger>
          <SelectContent>{enabled.map(model => <SelectItem key={model.id} value={model.id}>{model.name} · {saved?.providers.find(provider => provider.id === model.providerId)?.name}</SelectItem>)}</SelectContent>
        </Select>
        {pending && <p role="status" className="text-xs text-muted-foreground">Saving…</p>}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error} Reload the page if settings changed elsewhere.</p>}
      {onlyLocal && <p className="rounded-lg bg-muted p-3 text-sm leading-6">Conker is using a small model on your server. For answers closer to ChatGPT or Claude, add a hosted model on the server. <a className="underline underline-offset-4" href={PROVIDER_DOCS} target="_blank" rel="noreferrer">How to add one</a></p>}
    </WorkspaceSection>
    <WorkspaceSection title={<Label htmlFor="ideas-switch" className="text-base font-semibold">Ideas from Conker</Label>} description={<>Once a day Conker reads your recent chats and suggests things it could take off your plate. It only suggests; nothing runs without you. No ideas after a day? <a className="underline underline-offset-4" href={IDEAS_DOCS} target="_blank" rel="noreferrer">Check the server</a></>} action={<Switch id="ideas-switch" checked={ideasOn} disabled={pending || !enabled.length} onCheckedChange={setIdeas} />} />
    <WorkspaceSection title="Providers" description="Connections configured on the Conker server." action={<Button size="sm" variant="outline" disabled={pending} onClick={() => { setProviderError(''); setReload(value => value + 1) }}>Refresh</Button>}>
        {providerError && <p role="status" className="text-sm text-muted-foreground">{providerError}</p>}
        <dl className="space-y-2 text-sm">{providers.map(provider => <div key={provider.id} className="flex flex-wrap justify-between gap-2"><dt>{providerName(provider.id)}{provider.model && <span className="text-muted-foreground"> · {provider.model}</span>}</dt><dd className="text-muted-foreground">{providerState(provider)}</dd></div>)}</dl>
    </WorkspaceSection>
    <details className="group">
      <summary className="cursor-pointer rounded-md py-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">Advanced model settings</summary>
      <div className="border-t pt-3">
    <ModelsProviders key={value.revision} configuration={configuration} pending={pending} serverManaged onSave={async next => {
      if (!next.roleSettings || pending) return false
      setPending(true); setError('')
      try {
        const saved = await client.saveModels({ ...next, roleSettings: next.roleSettings, models: next.models.map(model => ({ ...model, routingDescription: model.routingDescription ?? '' })) }, value.revision)
        setValue(saved); return true
      } catch (error) { setError(error instanceof Error ? error.message : 'Could not save settings.'); return false }
      finally { setPending(false) }
    }} />
      </div>
    </details>
  </div></GatewayPageFrame>
}
