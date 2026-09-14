import { ChevronDown, Wrench } from "lucide-react"
import type { Thread } from "@/lib/api/client"

export function ToolActivity({ activity }: { activity: NonNullable<Thread["tool"]> }) {
  return (
    <details className="group min-w-0 rounded-lg border bg-surface-inset px-3 text-muted-foreground">
      <summary className="flex min-h-10 w-fit max-w-full cursor-pointer list-none items-center gap-2 rounded-md py-1 text-xs focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <Wrench className="size-3.5 shrink-0" />
        <span className="min-w-0 leading-5">{activity.summary}</span>
        <ChevronDown className="size-3.5 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="space-y-3 border-t py-3">
        <p className="text-xs"><span className="font-mono text-foreground">{activity.name}</span> · Recorded preview activity</p>
        <pre className="max-h-64 overflow-auto text-xs leading-6" tabIndex={0} aria-label="Tool arguments and receipt">{JSON.stringify(activity.record, null, 2)}</pre>
        <p className="text-xs leading-5">Recorded fixture evidence. No service is connected.</p>
      </div>
    </details>
  )
}
