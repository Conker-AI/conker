import { useState } from 'react'
import { Copy, Webhook } from 'lucide-react'
import { ConfirmationDialog } from '@/components/design-system'
import { Button } from '@/components/ui/button'
import { GatewayJobMutationError, type GatewayHookIssued, type GatewayJobsClient } from '@/lib/gateway/jobs'
import { gatewayError } from '@/lib/gateway/transport'

function message(error: unknown) { return error instanceof GatewayJobMutationError ? error.message : gatewayError(error).message }

function CopyLine({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return <div className="space-y-1">
    <p className="text-xs text-muted-foreground">{label}</p>
    <div className="flex min-w-0 items-center gap-2">
      <code className="min-w-0 flex-1 break-all rounded-md border bg-muted px-2.5 py-1.5 text-xs">{value}</code>
      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Copy ${label.toLowerCase()}`} title="Copy" onClick={() => { void navigator.clipboard?.writeText(value).then(() => setCopied(true)) }}><Copy /></Button>
    </div>
    {copied && <p role="status" className="text-xs text-muted-foreground">Copied.</p>}
  </div>
}

/** An AI job's webhook: anything that can call a web address starts the job. The secret shows once. */
export function AgentJobWebhook({ jobId, configured, clockless, client, onChanged }: {
  jobId: string; configured: boolean; clockless: boolean; client: Pick<GatewayJobsClient, 'issueHook' | 'revokeHook'>; onChanged: (configured: boolean) => void
}) {
  const [issued, setIssued] = useState<GatewayHookIssued | null>(null), [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null)
  const [stopping, setStopping] = useState(false)
  const issue = async () => {
    setPending(true); setError(null)
    try { setIssued(await client.issueHook(jobId)); onChanged(true) } catch (cause) { setError(message(cause)) } finally { setPending(false) }
  }
  const revoke = async () => {
    setPending(true); setError(null)
    try { await client.revokeHook(jobId); setIssued(null); setStopping(false); onChanged(false) } catch (cause) { setError(message(cause)) } finally { setPending(false) }
  }
  return <section className="space-y-3" aria-labelledby="job-webhook-heading">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="job-webhook-heading" className="text-lg font-semibold">Webhook</h2>
      {configured && !issued && <span className="text-sm text-muted-foreground">On</span>}
    </div>
    <p className="text-sm leading-6 text-muted-foreground">{clockless && !configured ? 'This job starts only from its webhook. Make one to get its address.' : 'Start this job from anything that can call a web address: an MCP listener, n8n, a phone shortcut or a script. What it sends reaches Conker as information, never as instructions.'}</p>
    {issued && <div className="space-y-3 rounded-lg border p-3">
      <p role="status" className="text-sm font-medium">Copy the secret now: Conker shows it only once.</p>
      <CopyLine label="Address (POST)" value={`${window.location.origin}${issued.path}`} />
      <CopyLine label={`Header ${issued.header}`} value={issued.token} />
      <p className="text-xs leading-5 text-muted-foreground">Send JSON or plain text, up to 16 KB, at most once every 30 seconds. It works from your own devices; a service on the internet can reach it only if you expose Conker yourself.</p>
    </div>}
    {error && <p role="alert" className="text-sm text-destructive-foreground">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant={configured ? 'outline' : 'default'} disabled={pending} onClick={() => void issue()}><Webhook />{pending ? 'Working…' : configured ? 'Make a new secret' : 'Make a webhook'}</Button>
      {configured && <Button type="button" variant="outline" disabled={pending} onClick={() => setStopping(true)}>Stop webhook</Button>}
    </div>
    {configured && <p className="text-xs text-muted-foreground">A new secret replaces the old one; anything still using the old one stops working.</p>}
    <ConfirmationDialog open={stopping} onOpenChange={setStopping} title="Stop this webhook?" description="Calls to its address stop starting the job. You can make a new webhook later; it gets a new secret." actionLabel="Stop webhook" actionVariant="destructive" pending={pending} error={error} onConfirm={() => void revoke()} />
  </section>
}
