import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, Check, CircleMinus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CollectionSection, PageHeader, WorkspaceSection } from '@/components/design-system/primitives'
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
      <PageHeader title="System status" actionsOnly actions={<Button variant="ghost" size="icon" aria-label="Refresh system status" disabled={pending} onClick={refresh}><RefreshCw /></Button>} />
      {pending && <p role="status" className="text-sm text-muted-foreground">Checking connected services…</p>}
      {failed && <div className="space-y-3"><p role="alert" className="text-sm text-destructive">Conker could not produce a diagnostic report. No recovery action was attempted.</p><Button variant="outline" size="sm" onClick={refresh}><RefreshCw />Try again</Button></div>}
      {report && <>
        <WorkspaceSection title={report.status === 'ok' ? 'Everything is working' : `${report.summary.attention} ${report.summary.attention === 1 ? 'thing needs' : 'things need'} attention`} description={`${report.summary.ok} working · ${report.summary.optional} optional`} />
        {(['access', 'services', 'models'] as const).map(area => <CollectionSection key={area} title={areaLabels[area]}><dl>{report.findings.filter(item => item.area === area).map(item => <div key={item.id} className="flex min-h-(--collection-row-height) min-w-0 items-start gap-3 px-4 py-3">
          <div className="min-w-0 flex-1"><dt className="text-sm font-medium">{item.label}</dt><dd className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</dd>
            {item.recovery && <div className="mt-3 flex flex-wrap items-center gap-2">{item.recovery.uiRoute && item.recovery.uiRoute !== '/system' && <Button asChild variant="outline" size="sm"><Link to={item.recovery.uiRoute}>{item.recovery.label}</Link></Button>}{item.recovery.command && <code className="rounded-md border bg-background px-2.5 py-1.5 text-xs">{item.recovery.command}</code>}</div>}
          </div>
          <Badge variant={item.status === 'attention' ? 'destructive' : 'outline'} className="shrink-0"><StatusIcon status={item.status} />{statusLabels[item.status]}</Badge>
        </div>)}</dl></CollectionSection>)}
        <p className="text-xs leading-5 text-muted-foreground">Checked {new Date(report.generatedAt).toLocaleString()}. Findings contain status only; credentials and service responses are never included.</p>
      </>}
    </div>
  </GatewayPageFrame>
}
