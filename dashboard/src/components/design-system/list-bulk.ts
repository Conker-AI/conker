import { notifyFailure } from "@/components/resilience/notify"
import { toastManager } from "@/components/ui/toast"
import { gatewayError } from "@/lib/gateway/transport"

/**
 * Run one action on each picked row, one at a time (the gates take one write per item), then say
 * what happened in one toast: "3 agents archived · Undo". Rows that fail are named by count with
 * the first reason; the ones that worked stay done. `undo` gets the results of the ones that worked.
 */
export async function runBulk<T, R>(items: readonly T[], act: (item: T) => Promise<R>, text: { done: (count: number) => string; failed: string }, undo?: (results: R[]) => void): Promise<R[]> {
  const results: R[] = []
  let failed = 0, reason: string | undefined
  for (const item of items) {
    try { results.push(await act(item)) } catch (error) { failed += 1; reason ??= gatewayError(error).message }
  }
  if (results.length) toastManager.add({ type: "success", title: text.done(results.length), timeout: 6000, actionProps: undo ? { children: "Undo", onClick: () => undo(results) } : undefined })
  if (failed) notifyFailure(text.failed, `${failed} of ${items.length} did not change${reason ? `: ${reason}` : "."}`)
  return results
}
