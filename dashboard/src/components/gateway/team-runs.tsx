import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Ban, CheckCheck, ChevronRight, MessagesSquare, Play, RefreshCw, Workflow } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmationDialog, FormActions, OverlayBody, TaskDialogContent } from '@/components/design-system'
import type { GatewayControlClient } from '@/lib/gateway/control'
import { TeamRunError, type GatewayTeamRun, type TeamRunState } from '@/lib/gateway/team-runs'
import { gatewayError } from '@/lib/gateway/transport'
import { forgetTeamRun, readOpenedTeamRuns, rememberTeamRun, TEAM_RUN_ID } from '@/lib/team-run-memory'
import { RUN_STATE_WORDS, STEP_STATE_WORDS, isOver, nextRoles, roleName, runSummary, usageOf } from '@/lib/team-run-view'

const POLL_MS = 3000
const stateVariant = (state: TeamRunState) => (state === 'blocked' || state === 'interrupted' ? 'destructive' : state === 'ready' || state === 'running' || state === 'held' ? 'default' : 'secondary')
const CAP_CODES = ['spending_cap_off', 'spending_cap_unavailable']
const message = (cause: unknown) => (cause instanceof TeamRunError ? cause.message : gatewayError(cause).message)

type Known = { id: string; run: GatewayTeamRun | null }

/** The runs opened in this browser, and a box for a run id from `conker team run`: Pi has no list of runs to read. */
export function TeamRunsSection({ control, onOpen }: { control: GatewayControlClient; onOpen: (id: string) => void }) {
  const [known, setKnown] = useState<Known[]>(() => readOpenedTeamRuns().map(item => ({ id: item.id, run: null })))
  const [value, setValue] = useState(''),
    [problem, setProblem] = useState<string | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    for (const item of readOpenedTeamRuns()) {
      control.teamRuns
        .get(item.id, controller.signal)
        .then(run => {
          if (!controller.signal.aborted) setKnown(current => current.map(row => (row.id === run.id ? { ...row, run } : row)))
        })
        .catch(cause => {
          if (controller.signal.aborted || gatewayError(cause).status !== 404) return
          forgetTeamRun(item.id)
          setKnown(current => current.filter(row => row.id !== item.id))
        })
    }
    return () => controller.abort()
  }, [control])
  const open = (event: FormEvent) => {
    event.preventDefault()
    const id = value.trim()
    if (!TEAM_RUN_ID.test(id)) {
      setProblem('That is not a run id. It starts with teamrun_ and is printed when you start a run.')
      return
    }
    setProblem(null)
    setValue('')
    onOpen(id)
  }
  return (
    <section className="space-y-4" aria-labelledby="team-runs-heading">
      <div>
        <h2 id="team-runs-heading" className="text-sm font-semibold">
          Team runs
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Conker keeps no list of runs, so open one by its id. Start a run from your computer with <code className="text-xs">conker team run</code>; it prints the id. Runs you open here are remembered in this browser.
        </p>
      </div>
      <form onSubmit={open} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor="team-run-id">Run id</Label>
          <Input
            id="team-run-id"
            value={value}
            placeholder="teamrun_…"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={problem ? true : undefined}
            onChange={event => {
              setValue(event.target.value)
              setProblem(null)
            }}
          />
        </div>
        <Button type="submit" variant="outline" disabled={!value.trim()}>
          Open run
        </Button>
      </form>
      {problem && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {problem}
        </p>
      )}
      {known.length > 0 && (
        <ul className="divide-y border-y">
          {known.map(item => (
            <li key={item.id}>
              <button type="button" onClick={() => onOpen(item.id)} className="flex min-h-12 w-full items-center gap-3 py-3 text-left text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
                <Workflow aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{item.run?.snapshot.definition.name ?? 'Team run'}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.run ? `${item.run.steps.length === 1 ? '1 role has' : `${item.run.steps.length} roles have`} run` : 'Loading…'}</span>
                </span>
                {item.run && <Badge variant={stateVariant(item.run.state)}>{RUN_STATE_WORDS[item.run.state]}</Badge>}
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function CapNote() {
  return (
    <div role="note" className="space-y-1 border p-3 text-sm">
      <p>The daily spending cap is what keeps a run from spending without a limit.</p>
      <p className="text-muted-foreground">
        The cap is not in Settings yet. On your computer run <code className="text-xs">conker spending cap --on</code>. The other spending limits are in{' '}
        <Link className="font-medium text-foreground underline underline-offset-4" to="/settings?group=money">
          Money and limits
        </Link>
        .
      </p>
    </div>
  )
}

/** One run (remount it with a `key` of the run id): its roles in order, where it stands, and what the owner may do next. Every role is started by him, one at a time. */
export function TeamRunDialog({ control, runId, onClose }: { control: GatewayControlClient; runId: string | null; onClose: () => void }) {
  const [run, setRun] = useState<GatewayTeamRun | null>(null),
    [error, setError] = useState<{ text: string; code: string | null } | null>(null)
  const [pending, setPending] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [ending, setEnding] = useState<'completed' | 'cancelled' | null>(null)
  const fail = useCallback((cause: unknown) => setError({ text: message(cause), code: cause instanceof TeamRunError ? cause.code : null }), [])
  const reload = useCallback(
    async (id: string) => {
      const fresh = await control.teamRuns.get(id)
      setRun(fresh)
      return fresh
    },
    [control],
  )
  useEffect(() => {
    if (!runId) return
    const controller = new AbortController()
    control.teamRuns
      .get(runId, controller.signal)
      .then(fresh => {
        if (!controller.signal.aborted) {
          setRun(fresh)
          rememberTeamRun(fresh.id)
        }
      })
      .catch(cause => {
        if (!controller.signal.aborted) setError({ text: gatewayError(cause).status === 404 ? 'This run is not here. Check the id, or it belongs to a chat that was deleted.' : gatewayError(cause).message, code: null })
      })
    return () => controller.abort()
  }, [control, runId])
  const running = run?.state === 'running'
  useEffect(() => {
    if (!running || !runId) return
    const timer = window.setInterval(() => {
      void reload(runId).catch(() => undefined)
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [running, runId, reload])
  const act = async (work: (current: GatewayTeamRun) => Promise<GatewayTeamRun>) => {
    if (!run || !runId) return
    setPending(true)
    setError(null)
    try {
      setRun(await work(run))
      setReviewed(false)
    } catch (cause) {
      fail(cause)
      if (cause instanceof TeamRunError && cause.stale) await reload(runId).catch(() => undefined)
    } finally {
      setPending(false)
    }
  }
  const next = run ? nextRoles(run) : []
  const definition = run?.snapshot.definition
  const usage = run ? usageOf(run) : null
  const first = run !== null && run.steps.length === 0
  const canEnd = run !== null && (run.state === 'ready' || run.state === 'blocked' || run.state === 'interrupted')
  return (
    <>
      <Dialog
        open={runId !== null}
        onOpenChange={open => {
          if (!open) onClose()
        }}
      >
        <TaskDialogContent title={definition?.name ?? 'Team run'} description="Each role runs only when you start it" size="wide">
          {run && definition ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <OverlayBody>
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={stateVariant(run.state)}>{RUN_STATE_WORDS[run.state]}</Badge>
                    <span className="text-xs text-muted-foreground">{run.steps.length === 1 ? '1 role has run' : `${run.steps.length} roles have run`}</span>
                  </div>
                  <p className="text-sm">{runSummary(run)}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" render={<Link to={`/chat?session=${encodeURIComponent(run.rootSessionId)}`} />}>
                      <MessagesSquare />
                      The task you gave
                    </Button>
                    {run.state === 'held' && (
                      <Button variant="outline" size="sm" render={<Link to="/inbox" />}>
                        Open the Inbox
                      </Button>
                    )}
                  </div>
                  <section className="space-y-3" aria-labelledby="run-roles">
                    <h3 id="run-roles" className="text-sm font-semibold">
                      Roles so far
                    </h3>
                    {run.steps.length ? (
                      <ol className="divide-y border-y">
                        {run.steps.map((step, index) => (
                          <li key={step.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 text-sm">
                            <span className="w-5 text-xs text-muted-foreground">{index + 1}</span>
                            <span className="min-w-0 flex-1 font-medium">{roleName(definition, step.role_id)}</span>
                            <Badge variant={step.state === 'blocked' || step.state === 'interrupted' ? 'destructive' : 'outline'}>{STEP_STATE_WORDS[step.state]}</Badge>
                            <Button variant="ghost" size="sm" render={<Link to={`/chat?session=${encodeURIComponent(step.session_id)}`} />}>
                              {step.state === 'complete' ? 'Read the answer' : 'Open its chat'}
                            </Button>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-sm text-muted-foreground">No role has run yet.</p>
                    )}
                  </section>
                  {usage && (
                    <p className="text-xs text-muted-foreground">
                      Used {usage.tokens.toLocaleString()} tokens{usage.costUsd !== null ? ` · $${usage.costUsd.toFixed(4)}` : ''} of the {definition.budget.maxTokens.toLocaleString()} this team may use
                      {usage.unknownAnswers ? ` · ${usage.unknownAnswers === 1 ? 'one answer' : `${usage.unknownAnswers} answers`} could not be measured` : ''}.
                    </p>
                  )}
                  {next.length > 0 && (
                    <section className="space-y-3 border-t pt-5" aria-labelledby="run-next">
                      <h3 id="run-next" className="text-sm font-semibold">
                        {first ? 'Start the first role' : 'Run the next role'}
                      </h3>
                      {!first && (
                        <label className="flex items-start gap-3 text-sm">
                          <Checkbox checked={reviewed} onCheckedChange={checked => setReviewed(checked === true)} />
                          <span>I read the last answer and what the handoff asks for is true.</span>
                        </label>
                      )}
                      <div className="space-y-3">
                        {next.map(item => (
                          <div key={item.roleId} className="space-y-2">
                            {item.condition && <p className="text-xs text-muted-foreground">Handoff asks: {item.condition}</p>}
                            <Button
                              disabled={pending || (!first && !reviewed)}
                              onClick={() => void act(current => control.teamRuns.step(current, { roleId: item.roleId, ...(item.handoffId ? { handoffId: item.handoffId, reviewed: true } : {}) }))}
                            >
                              <Play />
                              {pending ? 'Starting…' : `Run ${item.roleName}`}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                  {error && (
                    <div ref={node => node?.scrollIntoView({ block: 'nearest' })} className="space-y-3">
                      <p role="alert" className="text-sm text-destructive-foreground">
                        {error.text}
                      </p>
                      {error.code && CAP_CODES.includes(error.code) && <CapNote />}
                    </div>
                  )}
                </div>
              </OverlayBody>
              <FormActions inset description={isOver(run) ? 'This run is over.' : 'Nothing runs unless you start it here.'}>
                {(run.state === 'running' || run.state === 'held') && (
                  <Button variant="outline" disabled={pending} onClick={() => void act(() => control.teamRuns.reconcile(run.id))}>
                    <RefreshCw />
                    Check again
                  </Button>
                )}
                {canEnd && (
                  <Button variant="outline" disabled={pending} onClick={() => setEnding('cancelled')}>
                    <Ban />
                    Cancel run
                  </Button>
                )}
                {run.state === 'ready' && !first && (
                  <Button disabled={pending} onClick={() => setEnding('completed')}>
                    <CheckCheck />
                    Mark finished
                  </Button>
                )}
              </FormActions>
            </div>
          ) : (
            <div className="p-6">
              {error ? (
                <p role="alert" className="text-sm text-destructive-foreground">
                  {error.text}
                </p>
              ) : (
                <p role="status" className="text-sm text-muted-foreground">
                  Loading run…
                </p>
              )}
            </div>
          )}
        </TaskDialogContent>
      </Dialog>
      <ConfirmationDialog
        open={ending !== null}
        onOpenChange={open => !open && setEnding(null)}
        title={ending === 'completed' ? 'Mark this run finished?' : 'Cancel this run?'}
        description={ending === 'completed' ? 'No further role will run. The answers stay in their chats.' : 'No further role will run, and it cannot be started again. What the roles already answered stays in their chats.'}
        actionLabel={ending === 'completed' ? 'Mark finished' : 'Cancel run'}
        actionVariant={ending === 'completed' ? 'default' : 'destructive'}
        pending={pending}
        error={error?.text ?? null}
        onConfirm={async () => {
          const state = ending
          if (!state) return
          await act(current => control.teamRuns.finish(current, state))
          setEnding(null)
        }}
      />
    </>
  )
}
