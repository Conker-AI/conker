import { useCallback, useEffect, useRef, useState } from 'react'
import { CircleAlert, Info, LoaderCircle, Power, RefreshCw, ShieldCheck, TerminalSquare } from 'lucide-react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { PageHeader, WorkspaceAction } from '@/components/design-system/primitives'
import { GatewayPageFrame } from './page-frame'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { gatewayError } from '@/lib/gateway/transport'
import { createTerminalRequestId, decodeTerminalOutput, type GatewayCurrentTerminal, type GatewayTerminalClient } from '@/lib/gateway/terminal'

type Phase = 'checking' | 'idle' | 'starting' | 'active' | 'closing' | 'exited'

function lifetime(seconds: number) {
  return seconds % 60 === 0 ? `${seconds / 60} minutes` : `${seconds} seconds`
}

export function GatewayTerminalWorkspace({ client }: { client: GatewayTerminalClient }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const leaseRef = useRef<string | null>(null)
  const phaseRef = useRef<Phase>('checking')
  const uncertainRef = useRef(false)
  const inputQueue = useRef(Promise.resolve())
  const resizeKey = useRef('')
  const [ready, setReady] = useState(false)
  const [details, setDetails] = useState<GatewayCurrentTerminal | null>(null)
  const [lease, setLease] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('checking')
  const [error, setError] = useState<string | null>(null)
  const [uncertain, setUncertain] = useState(false)
  const [droppedBytes, setDroppedBytes] = useState(0)
  const [exitCode, setExitCode] = useState<number | null>(null)

  useEffect(() => { leaseRef.current = lease }, [lease])
  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { uncertainRef.current = uncertain }, [uncertain])

  const inspect = useCallback(async (signal?: AbortSignal) => {
    setPhase('checking'); setError(null)
    try {
      const current = await client.current(signal)
      setDetails(current); setLease(current.lease); setExitCode(null); setDroppedBytes(0)
      setPhase(current.lease ? 'active' : 'idle')
      if (current.lease) terminalRef.current?.writeln('\r\n\x1b[2mReconnected to the active browser lease.\x1b[0m')
    } catch (cause) {
      if (!signal?.aborted) { setPhase('idle'); setError(gatewayError(cause).message) }
    }
  }, [client])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => void inspect(controller.signal), 0)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [inspect])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const terminal = new Terminal({
      allowProposedApi: false, convertEol: false, cursorBlink: true, cursorStyle: 'bar', disableStdin: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: 13, lineHeight: 1.35,
      scrollback: 5000, theme: { background: '#08090a', foreground: '#fafafa', cursor: '#fafafa', selectionBackground: '#3f444a' },
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit); terminal.open(host)
    terminal.writeln('\x1b[1mConker owner terminal\x1b[0m')
    terminal.writeln('\x1b[2mShort-lived, isolated, and not written to Conker history.\x1b[0m\r\n')
    terminalRef.current = terminal; fitRef.current = fit; setReady(true)

    const input = terminal.onData(value => {
      const selected = leaseRef.current
      if (!selected || phaseRef.current !== 'active' || uncertainRef.current) return
      const bytes = new TextEncoder().encode(value)
      for (let offset = 0; offset < bytes.length; offset += 8192) {
        const chunk = bytes.slice(offset, offset + 8192)
        inputQueue.current = inputQueue.current.then(async () => {
          if (uncertainRef.current || leaseRef.current !== selected || phaseRef.current !== 'active') return
          try { await client.input(selected, chunk) }
          catch {
            uncertainRef.current = true; setUncertain(true)
            setError('Input may or may not have arrived. Review the output; nothing was retried.')
          }
        })
      }
    })
    let resizeTimer = 0
    const observer = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        try { fit.fit() } catch { return }
        const selected = leaseRef.current, rows = terminal.rows, columns = terminal.cols
        const key = `${selected}:${rows}:${columns}`
        if (!selected || phaseRef.current !== 'active' || rows < 2 || columns < 10 || key === resizeKey.current) return
        resizeKey.current = key
        void client.resize(selected, rows, columns).catch(() => setError('The shell is running, but its window size could not be synced.'))
      }, 80)
    })
    observer.observe(host)
    requestAnimationFrame(() => { try { fit.fit() } catch { /* measured on the next resize */ } })
    return () => {
      window.clearTimeout(resizeTimer); observer.disconnect(); input.dispose(); terminal.dispose()
      terminalRef.current = null; fitRef.current = null; setReady(false)
    }
  }, [client])

  useEffect(() => {
    if (!ready || !lease || phase !== 'active') return
    let cursor = 0, timer = 0
    const controller = new AbortController()
    const poll = async () => {
      try {
        const result = await client.read(lease, cursor, controller.signal)
        if (controller.signal.aborted) return
        cursor = result.cursor
        if (result.data) terminalRef.current?.write(decodeTerminalOutput(result.data))
        if (result.droppedBytes) setDroppedBytes(total => total + result.droppedBytes)
        if (result.exitCode !== null) { setExitCode(result.exitCode); setPhase('exited'); return }
        timer = window.setTimeout(poll, 300)
      } catch (cause) {
        if (!controller.signal.aborted) { setPhase('exited'); setError(gatewayError(cause).message) }
      }
    }
    void poll()
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [client, lease, phase, ready])

  const start = async () => {
    setPhase('starting'); setError(null); setUncertain(false); setDroppedBytes(0); setExitCode(null)
    terminalRef.current?.clear()
    terminalRef.current?.writeln('\x1b[2mWaiting for owner verification…\x1b[0m')
    try {
      const created = await client.create(createTerminalRequestId())
      setLease(created.id); setPhase(created.closed ? 'exited' : 'active')
      terminalRef.current?.writeln(created.replayed ? '\x1b[2mAttached to the existing lease.\x1b[0m\r\n' : '\x1b[2mTerminal ready.\x1b[0m\r\n')
      requestAnimationFrame(() => { fitRef.current?.fit(); terminalRef.current?.focus() })
    } catch (cause) {
      setPhase('idle'); setError(gatewayError(cause).message)
      terminalRef.current?.writeln('\r\n\x1b[31mTerminal did not start. Use Check status before trying again.\x1b[0m')
    }
  }

  const close = async () => {
    if (!lease) return
    setPhase('closing'); setError(null)
    try {
      await client.close(lease)
      terminalRef.current?.writeln('\r\n\x1b[2mTerminal closed. Output is no longer retained by the server.\x1b[0m')
      setLease(null); setPhase('idle')
    } catch (cause) {
      setPhase('exited'); setError(`${gatewayError(cause).message} Check status before sending another close request.`)
    }
  }

  const active = phase === 'active'
  const status = phase === 'checking' ? 'Checking' : phase === 'starting' ? 'Starting' : phase === 'closing' ? 'Closing' : active ? 'Live' : phase === 'exited' ? 'Ended' : 'Ready'

  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) return
    terminal.options.disableStdin = !active || uncertain
    if (active && !uncertain) requestAnimationFrame(() => terminal.focus())
  }, [active, uncertain])

  return <GatewayPageFrame className="flex flex-col gap-4 overflow-hidden">
    <PageHeader actionsOnly title="Terminal" description="Work directly in one operator-configured workspace through a short-lived isolated shell." density="compact" actions={<div className="flex items-center gap-2">
      <Tooltip><TooltipTrigger asChild><WorkspaceAction iconOnly disabled={phase === 'checking' || phase === 'starting' || phase === 'closing'} onClick={() => void inspect()} aria-label="Check terminal status"><RefreshCw /></WorkspaceAction></TooltipTrigger><TooltipContent>Check status</TooltipContent></Tooltip>
      {lease ? <WorkspaceAction disabled={phase === 'closing'} onClick={() => void close()}><Power />{phase === 'closing' ? 'Closing…' : 'Close terminal'}</WorkspaceAction> : <WorkspaceAction disabled={phase !== 'idle'} onClick={() => void start()}><TerminalSquare />{phase === 'starting' ? 'Starting…' : 'Start terminal'}</WorkspaceAction>}
    </div>} />

    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y py-3 text-xs text-muted-foreground">
      <StatusBadge tone={active ? 'live' : phase === 'exited' || error ? 'warning' : 'neutral'}>{status}</StatusBadge>
      <span className="min-w-0 truncate font-mono text-foreground" title={details?.workspace}>{details?.workspace ?? 'Workspace unavailable'}</span>
      {details && <><span>Maximum {lifetime(details.maximumLifetimeSeconds)}</span><span>Not saved to history or backups</span></>}
      <Popover><PopoverTrigger asChild><Button variant="ghost" size="icon" className="ml-auto size-8" aria-label="Terminal isolation details"><Info /></Button></PopoverTrigger><PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] text-sm"><p className="font-medium">Ephemeral owner shell</p><p className="mt-2 leading-6 text-muted-foreground">The server operator chooses the workspace. Conker does not persist commands, output, or the lease. Closing the shell or losing its isolated sidecar ends the session.</p></PopoverContent></Popover>
    </div>

    {error && <div className="flex shrink-0 items-start gap-3 border-y py-3 text-sm text-destructive" role="alert"><CircleAlert className="mt-0.5 size-4 shrink-0" /><div className="min-w-0 flex-1"><p>{error}</p>{uncertain && <Button className="mt-3" variant="outline" size="sm" onClick={() => { uncertainRef.current = false; setUncertain(false); setError(null); terminalRef.current?.focus() }}>Resume input without replay</Button>}</div></div>}
    {droppedBytes > 0 && <div className="flex shrink-0 items-start gap-3 border-y py-3 text-sm text-warning" role="status"><CircleAlert className="mt-0.5 size-4 shrink-0" /><p>{droppedBytes.toLocaleString()} earlier output bytes were no longer available. The live tail continues below.</p></div>}

    <section className="terminal-surface flex min-h-[20rem] min-w-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card text-card-foreground" aria-label="Owner terminal">
      <div className="flex min-h-10 shrink-0 items-center gap-2 border-b px-3 text-xs text-muted-foreground"><ShieldCheck className="size-4" aria-hidden="true" /><span>Isolated sidecar</span><span aria-hidden="true">·</span><span>One browser lease</span>{exitCode !== null && <span className="ml-auto tabular-nums">Exit {exitCode}</span>}{(phase === 'checking' || phase === 'starting' || phase === 'closing') && <LoaderCircle className="ml-auto size-4 animate-spin" aria-hidden="true" />}</div>
      <div ref={hostRef} className="min-h-0 flex-1 p-2" aria-label="Terminal output and input" />
      {!active && <div className="pointer-events-none absolute sr-only" aria-live="polite">Terminal {status.toLowerCase()}</div>}
    </section>
  </GatewayPageFrame>
}
