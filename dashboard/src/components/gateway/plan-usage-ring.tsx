import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { GatewayControlClient } from '@/lib/gateway/control'
import type { PlanUsage } from '@/lib/gateway/plans'

/** The selected model's plan window as a small ring; tap for every window and when each resets. */
export function PlanUsageRing({ client, provider }: { client: GatewayControlClient; provider: 'claude' | 'chatgpt' }) {
  const [usage, setUsage] = useState<PlanUsage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const result = await client.plans.usage(controller.signal)
        if (controller.signal.aborted) return
        setUsage(result)
        setError(null)
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Failed to load usage')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    const interval = setInterval(() => void load(), 5 * 60 * 1000)
    void load()

    return () => {
      controller.abort()
      clearInterval(interval)
    }
  }, [client])

  // Update current time every minute
  useEffect(() => {
    const timeInterval = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000))
    }, 60 * 1000) // 1 minute

    return () => clearInterval(timeInterval)
  }, [])

  if (loading || error || !usage) return null

  const windows = usage.windows.filter(w => w.provider === provider)
  if (windows.length === 0) return null

  // Find shortest window: first with 5-hour or session, otherwise first
  const shortestWindow = windows.find(w => w.label.toLowerCase().includes('5-hour') || w.label.toLowerCase().includes('session')) || windows[0]

  const getRingColor = (percent: number) => {
    if (percent >= 95) return 'text-destructive'
    if (percent >= 80) return 'text-warning'
    return 'text-muted-foreground'
  }

  const formatResetTime = (resetsAt: string | null) => {
    if (!resetsAt) return 'Reset time unknown'
    const now = new Date()
    const reset = new Date(resetsAt)
    const diffMs = reset.getTime() - now.getTime()

    if (diffMs <= 0) return 'Resets soon'

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

    if (diffHours < 24) {
      if (diffHours > 0) {
        return `Resets in ${diffHours} hr ${diffMinutes} min`
      } else {
        return `Resets in ${diffMinutes} min`
      }
    } else {
      const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const weekday = weekdays[reset.getDay()]
      const hours = reset.getHours()
      const minutes = reset.getMinutes()
      const ampm = hours >= 12 ? 'PM' : 'AM'
      const displayHours = hours % 12 || 12
      return `Resets ${weekday} ${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`
    }
  }

  const formatCheckedAgo = (checkedAt: number, now: number) => {
    const diff = now - checkedAt
    const minutes = Math.floor(diff / 60)
    if (minutes < 1) return 'Checked just now'
    if (minutes < 60) return `Checked ${minutes} min ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `Checked ${hours} hr ago`
    return `Checked ${Math.floor(hours / 24)} days ago`
  }

  const newestCheckedAt = Math.max(...windows.map(w => w.checkedAt))

  const radius = 8
  const circumference = 2 * Math.PI * radius
  const strokeDasharray = `${(shortestWindow.usedPercent / 100) * circumference} ${circumference}`

  return <Popover>
    <PopoverTrigger render={<Button type="button" size="icon" variant="ghost" className="size-8 shrink-0 rounded-full" aria-label={`Plan usage: ${shortestWindow.usedPercent}% of ${shortestWindow.label} used`}>
      <svg width="18" height="18" viewBox="0 0 18 18" className="transform -rotate-90">
        <circle
          cx="9"
          cy="9"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-border"
        />
        <circle
          cx="9"
          cy="9"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray={strokeDasharray}
          strokeLinecap="round"
          className={getRingColor(shortestWindow.usedPercent)}
        />
      </svg>
    </Button>} />
    <PopoverContent align="end" sideOffset={8} className="w-[min(18rem,calc(100vw-1rem))] space-y-3 p-3">
      <div>
        <p className="text-sm font-medium">Plan usage · {provider === 'claude' ? 'Claude' : 'ChatGPT'}</p>
      </div>
      {windows.map(window => (
        <div key={window.window} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span>{window.label}</span>
            <span className="font-medium">{window.usedPercent}%</span>
          </div>
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full bg-current ${getRingColor(window.usedPercent)}`}
              style={{ width: `${window.usedPercent}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {formatResetTime(window.resetsAt)}
          </p>
        </div>
      ))}
      <p className="text-xs text-muted-foreground pt-1">
        {formatCheckedAgo(newestCheckedAt, currentTime)}
      </p>
    </PopoverContent>
  </Popover>
}