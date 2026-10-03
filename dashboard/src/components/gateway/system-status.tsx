import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, Check, CircleMinus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CollectionSection, PageHeader } from '@/components/design-system/primitives'
import { GatewayPageFrame } from './page-frame'
import type { GatewayControlClient, GatewayDiagnostics } from '@/lib/gateway/control'

const areaLabels: Record<GatewayDiagnostics['findings'][number]['area'], string> = {
  access: 'Owner access', services: 'Services', models: 'Answer models',
}
const statusLabels = { ok: 'Working', attention: 'Needs attention', optional: 'Optional' } as const

function StatusIcon({ status }: { status: GatewayDiagnostics['findings'][number]['status'] }) {
  if (status === 'ok') return <Check aria-hidden="true" />
  if (status === 'attention') return <AlertCircle aria-hidden="true" />
  return <CircleMinus aria-hidden="true" />
}

export function GatewaySystemStatus({ client }: { client: GatewayControlClient }) {
  const [report, setReport] = useState<GatewayDiagnostics | null>(null)
  const [failed, setFailed] = useState(false)
  const [pending, setPending] = useState(true)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    client.diagnostics(controller.signal).then(value => {
      if (!controller.signal.aborted) { setReport(value); setFailed(false); setPending(false) }
    }).catch(() => {
      if (!controller.signal.aborted) { setReport(null); setFailed(true); setPending(false) }
    })
    return () => controller.abort()
  }, [client, revision])
  const refresh = () => { setPending(true); setFailed(false); setRevision(value => value + 1) }
  return <GatewayPageFrame>
    <div className="max-w-4xl space-y-6">
      <PageHeader title="System status" actionsOnly />
      <div className="flex flex-wrap justify-end gap-3"><Button variant="outline" size="sm" disabled={pending} onClick={refresh}><RefreshCw />{pending ? 'Checking…' : 'Refresh'}</Button></div>
      {pending && <p role="status" className="text-sm text-muted-foreground">Checking connected services…</p>}
      {failed && <div className="space-y-3"><p role="alert" className="text-sm text-destructive">Conker could not produce a diagnostic report. No recovery action was attempted.</p><Button variant="outline" size="sm" onClick={refresh}><RefreshCw />Try again</Button></div>}
      {report && <>
        <section aria-labelledby="diagnostic-summary" className="flex flex-wrap items-center justify-between gap-3 border-b pb-5">
          <div><h2 id="diagnostic-summary" className="text-base font-semibold">{report.status === 'ok' ? 'Everything is working' : `${report.summary.attention} ${report.summary.attention === 1 ? 'thing needs' : 'things need'} attention`}</h2><p className="mt-1 text-sm text-muted-foreground">{report.summary.ok} working · {report.summary.optional} optional</p></div>
          <Badge variant={report.status === 'ok' ? 'secondary' : 'destructive'}>{report.status === 'ok' ? 'Healthy' : 'Action needed'}</Badge>
        </section>
        {(['access', 'services', 'models'] as const).map(area => <CollectionSection key={area} title={areaLabels[area]} contained><dl className="divide-y">{report.findings.filter(item => item.area === area).map(item => <div key={item.id} className="flex min-w-0 flex-wrap items-start gap-3 p-4">
          <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border [&>svg]:size-4 ${item.status === 'attention' ? 'text-destructive' : 'text-muted-foreground'}`}><StatusIcon status={item.status} /></span>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><dt className="text-sm font-medium">{item.label}</dt><Badge variant="outline">{statusLabels[item.status]}</Badge></div><dd className="mt-1 text-sm leading-5 text-muted-foreground">{item.detail}</dd>
            {item.recovery && <div className="mt-3 flex flex-wrap items-center gap-2">{item.recovery.uiRoute && item.recovery.uiRoute !== '/system' && <Button asChild variant="outline" size="sm"><Link to={item.recovery.uiRoute}>{item.recovery.label}</Link></Button>}{item.recovery.command && <code className="rounded-md border bg-background px-2.5 py-1.5 text-xs">{item.recovery.command}</code>}</div>}
          </div>
        </div>)}</dl></CollectionSection>)}
        <p className="text-xs leading-5 text-muted-foreground">Checked {new Date(report.generatedAt).toLocaleString()}. Findings contain status only; credentials and service responses are never included.</p>
      </>}
    </div>
  </GatewayPageFrame>
}
