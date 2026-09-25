import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { z } from 'zod'

const receipt = z.object({
  modelConfigurationRevision: z.number().int().nonnegative(),
  attempts: z.array(z.object({
    role: z.enum(['answer', 'routing', 'context-selection', 'summarization', 'memory-ranking', 'proposals']),
    modelId: z.string().max(200), actualModel: z.string().max(300).optional(), status: z.enum(['completed', 'unavailable']),
    decision: z.object({ confidence: z.number().min(0).max(1).optional(), elapsed_ms: z.number().nonnegative().optional(), inputScope: z.literal('latest-user-request').optional() }).optional(),
  })).max(20),
})

/** Public execution metadata only; never render arbitrary provider raw fields. */
export function ModelRoutingEvidence({ detail }: { detail: string | null }) {
  if (!detail || detail.length > 16000) return null
  let parsed: z.infer<typeof receipt>
  try { parsed = receipt.parse(JSON.parse(detail)) } catch { return null }
  return <details className="pt-1"><summary className="cursor-pointer rounded-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">Model selection · configuration {parsed.modelConfigurationRevision}</summary><ol className="mt-2 space-y-2 border-l pl-3">{parsed.attempts.map((attempt, index) => <li key={index} className="break-words"><p>{attempt.role} · {attempt.actualModel ?? attempt.modelId} · {attempt.status}</p>{attempt.decision && <p>{attempt.decision.inputScope === 'latest-user-request' && 'Current request only · '}{attempt.decision.elapsed_ms !== undefined && `${Math.round(attempt.decision.elapsed_ms)} ms · `}{attempt.decision.confidence !== undefined && `Decision confidence ${Math.round(attempt.decision.confidence * 100)}%`}</p>}</li>)}</ol></details>
}

/** Map known failures to recovery guidance; never echo arbitrary backend errors. */
export function TurnFailureGuidance({ status, detail, hasAction }: { status: string; detail: string | null; hasAction: boolean }) {
  if (status !== 'failed') return null
  const modelUnavailable = detail === 'No configured eligible model could answer; no unapproved substitute was used.'
  return <div className="space-y-2 rounded-md bg-muted p-3">
    <p className="font-medium text-foreground">Answer unavailable</p>
    <p>{modelUnavailable
      ? 'The configured model route could not answer. Check model availability in Settings, or select an available answer model in the composer before sending a new message.'
      : 'This turn stopped before completing its answer. Review the saved turn and service status before sending another request.'}</p>
    {hasAction && <p>Review the action outcome first. Sending again could repeat work.</p>}
    {modelUnavailable && <Button asChild variant="outline" size="sm"><Link to="/settings">Review models</Link></Button>}
  </div>
}
