import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import './resilience.css'

function Bar({ className }: { className?: string }) {
  return <Skeleton className={cn('h-4 motion-reduce:animate-none', className)} />
}

function Row() {
  return <div className="flex items-center gap-3 py-3">
    <Skeleton className="size-8 shrink-0 rounded-lg motion-reduce:animate-none" />
    <div className="min-w-0 flex-1 space-y-2"><Bar className="w-2/5" /><Bar className="h-3 w-3/5" /></div>
    <Bar className="hidden h-3 w-12 sm:block" />
  </div>
}

/** Rows of a list while it loads. */
export function ListSkeleton({ rows = 6, label = 'Loading…', className }: { rows?: number; label?: string; className?: string }) {
  return <div role="status" aria-label={label} className={cn('conker-reveal divide-y', className)}>
    {Array.from({ length: rows }, (_, index) => <Row key={index} />)}
  </div>
}

/** A page's header and sections while its workspace opens. */
export function PageSkeleton({ label = 'Opening…', className }: { label?: string; className?: string }) {
  return <div role="status" aria-label={label} aria-busy="true" className={cn('conker-reveal min-h-0 flex-1 overflow-hidden p-4 sm:p-6', className)}>
    <div className="flex w-full flex-col gap-6">
      <div className="space-y-2"><Bar className="h-6 w-48" /><Bar className="w-72 max-w-full" /></div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="rounded-xl border p-4"><Bar className="mb-2 w-32" /><Row /><Row /><Row /></div>
        <div className="rounded-xl border p-4"><Bar className="mb-2 w-24" /><Row /><Row /></div>
      </div>
      <div className="rounded-xl border p-4"><Bar className="mb-2 w-40" /><Row /><Row /></div>
    </div>
  </div>
}

/** A conversation while it opens: a few turns and the composer. */
export function ChatSkeleton({ className }: { className?: string }) {
  return <div role="status" aria-label="Opening the conversation…" aria-busy="true" className={cn('conker-reveal flex min-h-0 flex-1 flex-col p-4 sm:p-6', className)}>
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6">
      <div className="ml-auto w-3/5 space-y-2"><Bar className="ml-auto w-full" /><Bar className="ml-auto w-2/3" /></div>
      <div className="w-4/5 space-y-2"><Bar /><Bar /><Bar className="w-1/2" /></div>
      <div className="ml-auto w-2/5"><Bar className="ml-auto w-full" /></div>
    </div>
    <Skeleton className="mx-auto mt-6 h-28 w-full max-w-3xl rounded-2xl motion-reduce:animate-none" />
  </div>
}

/** First paint while the app itself loads. */
export function AppLoading() {
  return <main role="status" aria-label="Opening Conker" className="flex min-h-dvh items-center justify-center bg-background text-foreground">
    <div className="conker-reveal flex flex-col items-center gap-4">
      <img src="/conker.png" alt="" width="48" height="48" className="size-12" />
      <div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner className="size-4" />Opening Conker…</div>
    </div>
  </main>
}
