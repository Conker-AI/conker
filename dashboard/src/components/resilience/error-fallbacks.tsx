import { useEffect, useRef, useState } from 'react'
import { Check, CircleAlert, Copy, RefreshCw, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { cn } from '@/lib/utils'
import { errorReport, isChunkLoadError } from './error-details'
import type { ErrorFallbackProps } from './error-boundary'

/** Copies a redacted report so a failure can be shared without exposing the server or records. */
export function CopyErrorDetails({ error, size = 'default' }: { error: unknown; size?: 'default' | 'sm' }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const copy = async () => {
    try { await navigator.clipboard.writeText(errorReport(error)); setState('copied') } catch { setState('failed') }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), 2500)
  }
  return <Button type="button" variant="ghost" size={size} onClick={() => void copy()} aria-live="polite">
    {state === 'copied' ? <Check /> : <Copy />}
    {state === 'copied' ? 'Copied' : state === 'failed' ? 'Couldn’t copy' : 'Copy details'}
  </Button>
}

function reload() { window.location.reload() }

/** Whole-app fallback: shown only when the frame itself failed. */
export function CrashScreen({ error, reset }: ErrorFallbackProps) {
  const updated = isChunkLoadError(error)
  return <main className="flex min-h-dvh items-center justify-center bg-background p-4 text-foreground">
    <Empty className="max-w-md">
      <EmptyHeader>
        <EmptyMedia variant="icon">{updated ? <RefreshCw /> : <CircleAlert className="text-destructive-foreground" />}</EmptyMedia>
        <EmptyTitle>{updated ? 'Conker was updated' : 'Conker hit a problem'}</EmptyTitle>
        <EmptyDescription>{updated
          ? 'Your server has a newer version of Conker. Reload to use it.'
          : 'This is a problem in this browser tab. Your chats, memory and settings are stored on your server. Reload to continue.'}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" onClick={reload}><RefreshCw />Reload Conker</Button>
          {!updated && <Button type="button" variant="outline" onClick={reset}><RotateCcw />Try again</Button>}
        </div>
        {!updated && <CopyErrorDetails error={error} size="sm" />}
      </EmptyContent>
    </Empty>
  </main>
}

/** One workspace failed; the sidebar and header stay usable, so the owner can go elsewhere. */
export function WorkspaceError({ error, reset, className }: ErrorFallbackProps & { className?: string }) {
  const updated = isChunkLoadError(error)
  return <div role="alert" className={cn('flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-4', className)}>
    <Empty className="max-w-md">
      <EmptyHeader>
        <EmptyMedia variant="icon">{updated ? <RefreshCw /> : <CircleAlert className="text-destructive-foreground" />}</EmptyMedia>
        <EmptyTitle>{updated ? 'Conker was updated' : 'This page didn’t open'}</EmptyTitle>
        <EmptyDescription>{updated
          ? 'This page belongs to a newer version on your server. Reload to open it.'
          : 'Something went wrong while showing this page. The rest of Conker still works, and nothing on your server changed because of this.'}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex flex-wrap justify-center gap-2">
          {updated
            ? <Button type="button" onClick={reload}><RefreshCw />Reload Conker</Button>
            : <><Button type="button" onClick={reset}><RotateCcw />Try again</Button><Button type="button" variant="outline" onClick={reload}><RefreshCw />Reload Conker</Button></>}
        </div>
        {!updated && <CopyErrorDetails error={error} size="sm" />}
      </EmptyContent>
    </Empty>
  </div>
}

/** A single tile or section failed; its neighbours keep working. */
export function SectionError({ reset, label = 'this part' }: ErrorFallbackProps & { label?: string }) {
  return <div role="alert" className="flex min-h-24 flex-wrap items-center gap-x-3 gap-y-2 p-4 text-sm">
    <CircleAlert className="size-4 shrink-0 text-destructive-foreground" aria-hidden="true" />
    <p className="min-w-0 flex-1 text-muted-foreground">Couldn’t show {label}.</p>
    <Button type="button" size="sm" variant="outline" onClick={reset}><RotateCcw />Try again</Button>
  </div>
}
