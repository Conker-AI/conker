import { CircleAlert, CircleCheck, CircleDot, CircleHelp } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { resultView, runResult, type RunAnswer, type RunState } from '@/lib/tool-run'

/** Each state's mark, next to its word (RUN_STATE): never color alone. */
export function RunStateMark({ state, className }: { state: RunState; className?: string }) {
  const style = cn('size-4 shrink-0', className)
  if (state === 'working') return <Spinner aria-hidden="true" className={cn(style, 'text-muted-foreground motion-reduce:animate-none')} />
  if (state === 'done') return <CircleCheck aria-hidden="true" className={cn(style, 'text-muted-foreground')} />
  if (state === 'failed') return <CircleAlert aria-hidden="true" className={cn(style, 'text-destructive-foreground')} />
  if (state === 'approval') return <CircleDot aria-hidden="true" className={cn(style, 'text-primary')} />
  return <CircleHelp aria-hidden="true" className={cn(style, 'text-warning-foreground')} />
}

/** What the tool gave back, readable: text, a list, fields, a table, or folded JSON. */
export function RunResult({ answer }: { answer: RunAnswer }) {
  const view = resultView(runResult(answer))
  const title = view.title && <p className="text-xs font-medium text-muted-foreground">{view.title}</p>
  if (view.kind === 'empty') return <div className="flex flex-col gap-1">{title}<p className="text-sm text-muted-foreground">It finished without a result to show.</p></div>
  if (view.kind === 'text') return <div className="flex flex-col gap-1">{title}<p className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6">{view.text}</p></div>
  if (view.kind === 'list') return <div className="flex flex-col gap-1">{title}{view.items.length
    ? <ul className="list-disc space-y-0.5 pl-5 text-sm leading-6 marker:text-muted-foreground">{view.items.map((item, index) => <li key={index} className="break-words">{item}</li>)}</ul>
    : <p className="text-sm text-muted-foreground">An empty list.</p>}</div>
  if (view.kind === 'fields') return <div className="flex flex-col gap-1">{title}<dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[minmax(7rem,max-content)_1fr]">{view.fields.map(field => <div key={field.label} className="contents">
    <dt className="text-muted-foreground">{field.label}</dt><dd className="break-words">{field.value || '—'}</dd>
  </div>)}</dl></div>
  if (view.kind === 'table') return <div className="flex min-w-0 flex-col gap-1">{title}
    <div className="rounded-lg border"><Table>
      <TableHeader><TableRow>{view.columns.map(column => <TableHead key={column}>{column}</TableHead>)}</TableRow></TableHeader>
      <TableBody>{view.rows.map((row, index) => <TableRow key={index}>{row.map((value, column) => <TableCell key={column} className="max-w-64 whitespace-normal break-words align-top">{value}</TableCell>)}</TableRow>)}</TableBody>
    </Table></div>
    {view.total > view.rows.length && <p className="text-sm text-muted-foreground">Showing {view.rows.length} of {view.total}. The rest is under More details.</p>}
  </div>
  const lines = view.text.split('\n').length
  return <details open={lines <= 12} className="group min-w-0">
    <summary className="cursor-pointer text-sm font-medium">{view.title ? `${view.title} (JSON)` : 'The result (JSON)'}{lines > 12 && <span className="font-normal text-muted-foreground"> · {lines} lines</span>}</summary>
    <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">{view.text}</pre>
  </details>
}

/** Everything the server answered about one run: its steps and the raw answer. */
export function RunDetails({ answer, version, actionId }: { answer?: RunAnswer; version: number; actionId: string }) {
  return <details className="text-sm">
    <summary className="cursor-pointer font-medium text-muted-foreground">More details</summary>
    <div className="mt-2 flex flex-col gap-2">
      {answer?.steps?.length ? <ol className="flex flex-col gap-1">{answer.steps.map(step => <li key={step.nodeId} className="flex flex-wrap gap-x-2">
        <span>{step.label}</span><span className="text-muted-foreground">{step.status === 'completed' ? 'Done' : step.status === 'failed' ? 'Failed' : 'Skipped'}</span>
        {step.error && <span className="basis-full text-destructive-foreground">{step.error}</span>}
      </li>)}</ol> : null}
      <p className="text-muted-foreground">Version {version} · Run {actionId}</p>
      {answer && <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">{JSON.stringify(answer, null, 2)}</pre>}
    </div>
  </details>
}
