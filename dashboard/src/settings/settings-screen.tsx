import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, TriangleAlert } from 'lucide-react'
import { CollectionSearch } from '@/components/design-system'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { GatewayPageFrame } from '@/components/gateway/page-frame'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { GatewayControlClient } from '@/lib/gateway/control'
import { cn } from '@/lib/utils'
import { AccessProvider } from './access-blocks'
import { useAppearance } from './appearance'
import { settingBlocks } from './blocks'
import { groupIcon } from './icons'
import { ModelsProvider } from './models-context'
import { CATEGORIES, matches, onScreen, SETTINGS_BY_ID, SETTINGS_GROUPS, type Setting, type SettingsGroup, type SettingsSection } from './registry'
import { SettingRow } from './setting-row'
import { useSettings, type SettingsState } from './use-settings'

/** Links from before the topics existed (`?tab=`) open the matching topic. */
const OLD_TABS: Record<string, { group: string; focus?: string }> = {
  general: { group: 'you' }, models: { group: 'models' }, providers: { group: 'models', focus: 'models.providers' }, connections: { group: 'integrations' },
  access: { group: 'access' }, search: { group: 'search' },
}

function ChatScopeRow({ setting }: { setting: Setting }) {
  return <div className="py-3">
    <p className="text-sm font-medium leading-5">{setting.title}</p>
    <p className="mt-0.5 text-sm leading-5 text-muted-foreground">{setting.description} <span className="whitespace-nowrap">Set in each {setting.scope}.</span></p>
  </div>
}

function SectionCard({ section, rows, state, custom, label }: { section: Pick<SettingsSection, 'id' | 'title' | 'description'>; rows: Setting[]; state: SettingsState; custom: (setting: Setting) => ReactNode; label?: string }) {
  return <section aria-labelledby={`section-${section.id}`} className="flex flex-col gap-2">
    <div>
      <h3 id={`section-${section.id}`} className="text-sm font-semibold">{label ? <span className="font-normal text-muted-foreground">{label} · </span> : null}{section.title}</h3>
      {section.description && <p className="mt-0.5 text-sm text-muted-foreground">{section.description}</p>}
    </div>
    <div className="divide-y rounded-xl border bg-card px-4">
      {rows.map(setting => onScreen(setting) ? <SettingRow key={setting.id} setting={setting} state={state} custom={custom} /> : <ChatScopeRow key={setting.id} setting={setting} />)}
    </div>
  </section>
}

function GroupNav({ selected, onPick, query, onQuery, advanced, onAdvanced, changedOnly, onChangedOnly, changedCount }: {
  selected: string | null; onPick: (group: string) => void; query: string; onQuery: (value: string) => void
  advanced: boolean; onAdvanced: (value: boolean) => void; changedOnly: boolean; onChangedOnly: (value: boolean) => void; changedCount: number
}) {
  return <nav aria-label="Settings topics" className="flex flex-col gap-4">
    <CollectionSearch label="Search settings" placeholder="Search settings" compact value={query} onChange={event => onQuery(event.target.value)} />
    <div className="flex flex-col gap-2.5 rounded-lg border px-3 py-2.5">
      <Label htmlFor="settings-advanced" className="justify-between font-normal">Show advanced<Switch id="settings-advanced" checked={advanced} onCheckedChange={value => onAdvanced(value)} /></Label>
      <Label htmlFor="settings-changed" className="justify-between font-normal">Changed only{changedCount > 0 && <span className="ml-auto pr-2 text-xs text-muted-foreground tabular-nums">{changedCount}</span>}<Switch id="settings-changed" checked={changedOnly} onCheckedChange={value => onChangedOnly(value)} /></Label>
    </div>
    {CATEGORIES.map(category => {
      const groups = SETTINGS_GROUPS.filter(group => group.category === category.id)
      return groups.length ? <div key={category.id} className="flex flex-col gap-0.5">
        <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">{category.title}</p>
        {groups.map(group => {
          const Icon = groupIcon(group.icon)
          const active = group.id === selected && !query && !changedOnly
          return <button key={group.id} type="button" aria-current={active ? 'page' : undefined} onClick={() => onPick(group.id)}
            className={cn('flex min-h-9 items-center gap-2.5 rounded-md px-2 text-left text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring', active && 'bg-accent font-medium')}>
            <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{group.title}</span><ChevronRight aria-hidden="true" className="size-4 text-muted-foreground md:hidden" />
          </button>
        })}
      </div> : null
    })}
  </nav>
}

/**
 * Settings: every setting in the registry, by topic, in one row template. Search, "Show advanced"
 * and "Changed only" work across all topics. On a phone the topic list comes first and a topic
 * opens on its own page; on wider screens they sit side by side.
 */
export function SettingsScreen({ client, authStore, onSignOut }: { client: GatewayControlClient; authStore: GatewayAuthStore; onSignOut?: () => void }) {
  return <ModelsProvider client={client}><AccessProvider client={client}><Screen client={client} authStore={authStore} onSignOut={onSignOut} /></AccessProvider></ModelsProvider>
}

function Screen({ client, authStore, onSignOut }: { client: GatewayControlClient; authStore: GatewayAuthStore; onSignOut?: () => void }) {
  const state = useSettings(client)
  const [params, setParams] = useSearchParams()
  const old = OLD_TABS[params.get('tab') ?? '']
  const groupId = params.get('group') ?? old?.group ?? null
  const focus = params.get('focus') ?? old?.focus ?? null
  const group = SETTINGS_GROUPS.find(item => item.id === groupId) ?? null
  const [query, setQuery] = useState(''), [changedOnly, setChangedOnly] = useState(false)
  const advancedSetting = SETTINGS_BY_ID.get('settings.advanced')!
  const advanced = state.value(advancedSetting) === true
  const blocks = useMemo(() => settingBlocks({ client, authStore, onSignOut }), [client, authStore, onSignOut])
  const custom = (setting: Setting) => blocks[setting.component ?? '']?.() ?? null
  useAppearance(state.loading ? undefined : state.value(SETTINGS_BY_ID.get('appearance.accent')!))
  useEffect(() => {
    if (!focus) return
    const timer = window.setTimeout(() => document.getElementById(`setting-${focus}`)?.scrollIntoView({ block: 'start' }), 150)
    return () => window.clearTimeout(timer)
  }, [focus, groupId])
  const visible = (setting: Setting) => advanced || setting.tier === 'basic' || setting.id === focus
  const pick = (id: string) => { setQuery(''); setChangedOnly(false); setParams({ group: id }) }
  const changed = SETTINGS_GROUPS.flatMap(item => item.sections.flatMap(section => section.settings.filter(setting => onScreen(setting) && state.changed(setting))))
  const problems = Object.values(state.loadErrors).filter(Boolean)

  let content: ReactNode
  if (query.trim() || changedOnly) {
    const found = SETTINGS_GROUPS.flatMap(item => item.sections.map(section => ({ group: item, section,
      rows: section.settings.filter(setting => (changedOnly ? onScreen(setting) && state.changed(setting) : true) && (!query.trim() || matches(setting, query))) }))).filter(item => item.rows.length)
    content = <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold">{changedOnly && !query.trim() ? 'Changed from the default' : `Results for “${query.trim()}”`}</h2>
      {found.length ? found.map(item => <SectionCard key={`${item.group.id}.${item.section.id}`} section={item.section} label={item.group.title} rows={item.rows} state={state} custom={custom} />)
        : <p className="text-sm text-muted-foreground">{changedOnly ? 'Everything is at its default.' : 'No setting matches. Try another word.'}</p>}
    </div>
  } else if (group) {
    content = <GroupPage group={group} state={state} custom={custom} visible={visible} showAdvanced={() => state.set(advancedSetting, true)} />
  }

  return <GatewayPageFrame className="p-0 sm:p-0">
    <div className="mx-auto grid w-full max-w-6xl gap-6 p-4 sm:p-6 md:grid-cols-[15rem_minmax(0,1fr)] md:gap-10">
      <aside className={cn('md:sticky md:top-0 md:max-h-[calc(100dvh-6rem)] md:self-start md:overflow-y-auto md:pb-6', (group || query.trim() || changedOnly) && 'hidden md:block')}>
        <GroupNav selected={group?.id ?? SETTINGS_GROUPS[0].id} onPick={pick} query={query} onQuery={setQuery} advanced={advanced} onAdvanced={value => state.set(advancedSetting, value)}
          changedOnly={changedOnly} onChangedOnly={setChangedOnly} changedCount={changed.length} />
      </aside>
      <div data-settings-content className={cn('min-w-0 pb-16', !(group || query.trim() || changedOnly) && 'hidden md:block')}>
        {(group || query.trim() || changedOnly) && <Button variant="ghost" size="sm" className="mb-3 -ml-2 md:hidden" render={<Link to="/settings" onClick={() => { setQuery(''); setChangedOnly(false) }} />}><ChevronLeft />All settings</Button>}
        {problems.length > 0 && <Alert variant="warning" className="mb-4"><TriangleAlert /><AlertDescription>Some settings can’t be read right now, so they can’t be changed: {problems[0]} <button type="button" className="underline underline-offset-4" onClick={() => void state.reload()}>Try again</button></AlertDescription></Alert>}
        {content ?? <GroupPage group={SETTINGS_GROUPS[0]} state={state} custom={custom} visible={visible} showAdvanced={() => state.set(advancedSetting, true)} />}
      </div>
    </div>
  </GatewayPageFrame>
}

function GroupPage({ group, state, custom, visible, showAdvanced }: { group: SettingsGroup; state: SettingsState; custom: (setting: Setting) => ReactNode; visible: (setting: Setting) => boolean; showAdvanced: () => void }) {
  const sections = group.sections.map(section => ({ section, rows: section.settings.filter(visible) })).filter(item => item.rows.length)
  const hidden = group.sections.reduce((count, section) => count + section.settings.filter(setting => !visible(setting)).length, 0)
  return <div className="flex flex-col gap-7">
    <header>
      <h2 className="text-xl font-semibold">{group.title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{group.description}</p>
    </header>
    {state.loading && <p role="status" className="text-sm text-muted-foreground">Loading your settings…</p>}
    {sections.map(item => <SectionCard key={item.section.id} section={item.section} rows={item.rows} state={state} custom={custom} />)}
    {hidden > 0 && <p className="text-sm text-muted-foreground">{hidden} advanced {hidden === 1 ? 'setting is' : 'settings are'} hidden here. <button type="button" className="font-medium text-foreground underline underline-offset-4" onClick={showAdvanced}>Show advanced</button></p>}
  </div>
}
