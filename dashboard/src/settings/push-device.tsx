import { useEffect, useState } from 'react'
import { RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import type { GatewayControlClient } from '@/lib/gateway/control'
import type { PushDeviceRow } from '@/lib/gateway/push'
import { GatewayError } from '@/lib/gateway/transport'
import { browserPush, PushRefused, type PushDevice } from '@/pwa/register'
import { BROWSER_FAILED, LIMIT, NOT_ALLOWED, OFF_UNCONFIRMED, PUSH_WORDS, REMOVE_FAILED, SERVER_OFF } from './push-words'

let shared: PushDevice | undefined
const browserDevice = () => (shared ??= browserPush(import.meta.env.BASE_URL))

function problem(error: unknown): string {
  if (error instanceof PushRefused) return error.reason === 'no-worker' ? PUSH_WORDS.insecure : error.reason === 'dismissed' ? NOT_ALLOWED : ''
  if (error instanceof GatewayError) return error.status === 409 ? LIMIT : error.status === 503 ? SERVER_OFF : error.message
  return BROWSER_FAILED
}

const added = (seconds: number) => new Date(seconds * 1000).toLocaleString()

/**
 * Settings, Notifications: "Notifications on this device". Off until the owner turns it on here;
 * only then does the browser ask for permission and subscribe. "On" means this browser holds a
 * subscription and the server lists it, nothing less. Below the switch, every device with
 * notifications on, newest first, with when it was added and Remove, so one that is not the
 * owner's can be seen and taken off.
 */
export function PushDeviceBlock({ client, device }: { client: Pick<GatewayControlClient, 'push'>; device?: PushDevice }) {
  const push = device ?? browserDevice()
  // What the browser allows is read on every render; only the server's answer is kept.
  const support = push.support()
  const [checked, setChecked] = useState<'checking' | 'on' | 'off' | 'unknown'>('checking')
  const [rows, setRows] = useState<PushDeviceRow[]>([])
  const [mine, setMine] = useState<string | null>(null)
  const [pending, setPending] = useState<'on' | 'off' | 'remove' | null>(null)
  const [error, setError] = useState('')
  const [check, setCheck] = useState(0)
  useEffect(() => {
    let live = true
    Promise.all([client.push.state(), support === 'ok' ? push.current() : null])
      .then(([server, current]) => {
        if (!live) return
        setRows([...server.devices].sort((a, b) => b.created - a.created))
        setMine(current?.id ?? null)
        setChecked(current && server.devices.some(row => row.id === current.id) ? 'on' : 'off')
      })
      .catch(() => live && setChecked('unknown'))
    return () => {
      live = false
    }
  }, [client, push, support, check])
  const view = support === 'ok' ? checked : support

  async function turn(on: boolean) {
    setPending(on ? 'on' : 'off')
    setError('')
    try {
      if (on) {
        const keys = await push.subscribe((await client.push.state()).publicKey)
        try {
          await client.push.subscribe(keys)
        } catch (failure) {
          // The server did not keep it, so this browser does not keep it either.
          await push.unsubscribe().catch(() => undefined)
          throw failure
        }
      } else {
        const current = await push.current()
        await push.unsubscribe()
        if (current) await client.push.unsubscribe(current.id).catch(() => setError(OFF_UNCONFIRMED))
      }
    } catch (failure) {
      setError(problem(failure))
    } finally {
      setPending(null)
      setCheck(value => value + 1)
    }
  }

  async function remove(id: string) {
    if (id === mine) return turn(false)
    setPending('remove')
    setError('')
    try {
      await client.push.unsubscribe(id)
    } catch {
      setError(REMOVE_FAILED)
    } finally {
      setPending(null)
      setCheck(value => value + 1)
    }
  }

  const usable = view === 'on' || view === 'off'
  const line = pending === 'on' ? 'Turning on…' : pending === 'off' ? 'Turning off…' : PUSH_WORDS[view]
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-11 items-start gap-3">
        <Switch className="mt-0.5" aria-label="Notifications on this device" checked={view === 'on'} disabled={!usable || pending !== null} onCheckedChange={checked => void turn(checked)} />
        <p role="status" aria-live="polite" className="min-w-0 flex-1 text-sm leading-5 text-muted-foreground">
          {line}
        </p>
      </div>
      {view === 'unknown' && pending === null && (
        <Button type="button" size="sm" variant="outline" className="w-auto! self-start" onClick={() => setCheck(value => value + 1)}>
          <RefreshCw />
          Check again
        </Button>
      )}
      {rows.length > 0 && (
        <ul aria-label="Devices with notifications on" className="divide-y">
          {rows.map(row => (
            <li key={row.id} className="flex min-h-11 flex-wrap items-center justify-between gap-3 py-2">
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-medium">{row.id === mine ? `${row.label} (this device)` : row.label}</p>
                <p className="text-xs text-muted-foreground">Added {added(row.created)}</p>
              </div>
              <Button type="button" size="sm" variant="outline" className="w-auto!" disabled={pending !== null} aria-label={`Remove ${row.label}, added ${added(row.created)}`} onClick={() => void remove(row.id)}>
                <Trash2 />
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-sm leading-5 text-destructive-foreground">
          {error}
        </p>
      )}
    </div>
  )
}
