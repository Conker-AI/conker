import type { ReactNode } from 'react'
import { Check, Lock, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { NARROW, SettingControl } from './controls'
import { SETTINGS_BY_ID, type Setting } from './registry'
import type { SettingsState } from './use-settings'

/**
 * The one row every setting uses: title, one plain sentence, its control, and the same marks
 * everywhere: "Not used yet" (saved for a feature still being built), "This device", a lock when
 * saving asks for the password, Changed with Reset, and Saving / Saved / what went wrong.
 */
export function SettingRow({ setting, state, custom }: { setting: Setting; state: SettingsState; custom: (setting: Setting) => ReactNode }) {
  const id = `setting-${setting.id}`
  const isCustom = setting.type === 'custom'
  const narrow = NARROW.has(setting.type)
  const dependency = setting.dependsOn ? SETTINGS_BY_ID.get(setting.dependsOn.id) : undefined
  const blocked = Boolean(dependency && state.value(dependency) !== setting.dependsOn?.value)
  const status = state.statuses[setting.id]
  const changed = state.changed(setting)
  const disabled = !state.available(setting) || blocked || status?.state === 'saving'
  const control = isCustom ? custom(setting)
    : <SettingControl setting={setting} id={`${id}-control`} value={state.value(setting)} disabled={disabled} onChange={value => state.set(setting, value)} />
  const reset = changed && !isCustom && <Button type="button" size="xs" variant="ghost" className="text-muted-foreground" disabled={disabled} onClick={() => state.reset(setting)}><RotateCcw />Reset</Button>
  return <div id={id} className="scroll-mt-28 py-4">
    <div className={cn('flex min-w-0 flex-col gap-3', narrow && 'sm:flex-row sm:items-start sm:justify-between sm:gap-6', setting.type === 'toggle' && 'flex-row items-start justify-between gap-4')}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Label id={`${id}-control-title`} htmlFor={isCustom ? undefined : `${id}-control`} className="text-sm font-medium leading-5">{setting.title}</Label>
          {changed && <span aria-label="Changed from the default" title="Changed from the default" className="size-1.5 rounded-full bg-primary" />}
          {setting.effect === 'stored' && <Badge variant="outline" size="sm" title="Your choice is saved; the feature that uses it is still being built.">Not used yet</Badge>}
          {setting.scope === 'device' && <Badge variant="secondary" size="sm">This device</Badge>}
          {setting.home?.service !== 'browser' && setting.home?.verify &&<Lock aria-label="Saving asks for your password" className="size-3.5 text-muted-foreground" />}
        </div>
        <p className="mt-0.5 text-sm leading-5 text-muted-foreground">{setting.description}</p>
        {blocked && dependency && <p className="mt-1 text-xs text-muted-foreground">Turn on {dependency.title} first.</p>}
        {status && <p role={status.state === 'failed' ? 'alert' : 'status'} className={cn('mt-1 flex items-center gap-1 text-xs', status.state === 'failed' ? 'text-destructive-foreground' : 'text-muted-foreground')}>
          {status.state === 'saving' ? 'Saving…' : status.state === 'saved' ? <><Check className="size-3.5 text-success-foreground" />Saved</> : status.message ?? 'Not saved.'}
        </p>}
      </div>
      {narrow && <div className="flex shrink-0 flex-wrap items-center gap-1 sm:justify-end">{reset}{control}</div>}
    </div>
    {!narrow && <div className="mt-3 flex min-w-0 flex-col items-start gap-2 [&>*]:w-full">{control}{reset && <div className="w-auto!">{reset}</div>}</div>}
  </div>
}
