import { AlertCircle, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import type { GatewayControlClient } from '@/lib/gateway/control'
import { setupLabels, summarizeSetup } from './setup-presentation'
import { useGatewaySetupStatus } from './setup-status-hook'

export function SetupReadinessPrompt({ client }: { client: GatewayControlClient }) {
  const { status, error } = useGatewaySetupStatus(client)
  if (!status || status.state === 'complete') return null

  const summary = summarizeSetup(status)
  const next = summary.current ? setupLabels[summary.current.id] : null
  const detail = summary.current?.evidence[0]?.detail ?? next?.description
  return <section aria-labelledby="setup-readiness-title" className="grid min-w-0 gap-4 rounded-lg border border-warning-border bg-warning-subtle p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5">
    <div className="min-w-0 space-y-3">
      <div className="flex min-w-0 items-start gap-3">
        <AlertCircle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 id="setup-readiness-title" className="text-base font-semibold">Finish setting up Conker</h2>
            <span className="text-xs text-muted-foreground tabular-nums">{summary.resolved} of {status.steps.length} resolved</span>
          </div>
          {next && <p className="mt-1 text-sm font-medium">Next: {next.title}</p>}
          {detail && <p className="mt-1 max-w-prose text-sm leading-6 text-muted-foreground">{detail}</p>}
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{summary.remainingRequired} required {summary.remainingRequired === 1 ? 'check remains' : 'checks remain'}.{error ? ' Showing the last verified result.' : ''}</p>
        </div>
      </div>
      <Progress value={(summary.resolved / status.steps.length) * 100} aria-label={`${summary.resolved} of ${status.steps.length} setup steps resolved`} />
    </div>
    <Button asChild className="w-full sm:w-auto"><Link to="/setup">Continue setup<ArrowRight /></Link></Button>
  </section>
}
