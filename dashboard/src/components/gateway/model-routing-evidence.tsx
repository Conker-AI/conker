import { z } from 'zod'

const receipt = z.object({
  modelConfigurationRevision: z.number().int().nonnegative(),
  attempts: z.array(z.object({
    role: z.enum(['answer', 'routing', 'context-selection', 'summarization']),
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
