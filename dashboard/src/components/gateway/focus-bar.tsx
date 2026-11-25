import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Crosshair } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import type { GatewayControlClient } from '@/lib/gateway/control'
import { gatewayError } from '@/lib/gateway/transport'
import { publishServerSettings, serverSetting } from '@/settings/server-setting'

type SettingsClient = Pick<GatewayControlClient['settings'], 'read' | 'save'>
type Turning = { state: 'idle' } | { state: 'working' } | { state: 'failed'; message: string } | { state: 'unknown' }

/**
 * Turns Focus mode off from the saved settings: read the latest document, save it without the
 * setting (back to its default, as Settings does), and show the result. Focus is off only once the
 * server says so; if the save failed it reads again, so a save that did land is not reported as failed.
 */
async function turnOffFocus(client: SettingsClient): Promise<Turning> {
  try {
    const current = await client.read()
    const values = { ...current.values }
    delete values['day.focus_mode']
    publishServerSettings(await client.save(values, current.revision))
    return { state: 'idle' }
  } catch (cause) {
    const failure = gatewayError(cause)
    try {
      publishServerSettings(await client.read())
    } catch {
      return { state: 'unknown' }
    }
    if (!serverSetting('day.focus_mode', false)) return { state: 'idle' }
    return { state: 'failed', message: failure.status === 409 ? 'Your settings changed somewhere else. Try again.' : failure.message }
  }
}

/**
 * Settings > Your day > Focus mode, said where it hides things (Home and Inbox): that it is on, what
 * is hidden and how many, and one tap to turn it off.
 */
export function FocusBar({ client, hidden }: { client?: SettingsClient; hidden: string }) {
  const [turning, setTurning] = useState<Turning>({ state: 'idle' })
  const working = turning.state === 'working'
  const turnOff = async () => {
    if (!client) return
    setTurning({ state: 'working' })
    setTurning(await turnOffFocus(client))
  }
  return (
    <section aria-label="Focus mode" className="flex min-w-0 flex-col gap-2 rounded-xl border px-4 py-3 text-sm">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <Crosshair aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <p className="min-w-0 flex-1 basis-48">
          <span className="font-medium">Focus on.</span> <span className="text-muted-foreground">{hidden}</span>
        </p>
        {client ? (
          <Button type="button" size="sm" variant="outline" disabled={working} onClick={() => void turnOff()}>
            {working && <Spinner aria-hidden="true" className="motion-reduce:animate-none" />}
            {working ? 'Turning off…' : turning.state === 'idle' ? 'Turn off focus' : 'Try again'}
          </Button>
        ) : (
          <Button size="sm" variant="outline" render={<Link to="/settings?group=day&focus=day.focus_mode" />}>
            Turn off in Settings
          </Button>
        )}
      </div>
      {turning.state === 'failed' && (
        <p role="alert" className="text-destructive-foreground">
          Focus is still on. {turning.message}
        </p>
      )}
      {turning.state === 'unknown' && (
        <p role="alert" className="text-warning-foreground">
          Couldn’t check whether focus turned off. Check your connection, then try again.
        </p>
      )}
    </section>
  )
}
