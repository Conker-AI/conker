import { useRef, useState } from "react"
import { Info, Maximize2, Minimize2, Terminal } from "lucide-react"
import { useConker } from "@/lib/api/store"
import { BaseLayout } from "@/components/layouts/base-layout"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export default function TerminalPage() {
  const terminal = useConker(data => data.terminal)
  const [fullscreen, setFullscreen] = useState(false)
  const fullscreenButton = useRef<HTMLButtonElement>(null)

  const workbench = <div data-slot="terminal-workbench" className="terminal-surface flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card text-card-foreground">
    <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <Terminal className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate font-mono text-xs sm:text-sm">{terminal.prompt}</span>
        <span className="hidden sm:inline-flex"><StatusBadge>Offline</StatusBadge></span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" aria-label="Project context" title="Project context"><Info /></Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto">
            <p className="font-medium">Project context</p>
            <p className="mt-1 text-xs text-muted-foreground">Sample snapshot · not live repository data</p>
            <dl className="my-4 space-y-3">
              {terminal.context.map(([label, value]) => <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 break-words font-mono text-xs leading-5">{value}</dd>
              </div>)}
            </dl>
            <p className="border-t pt-3 text-xs leading-5 text-muted-foreground">This preview has no shell connection and accepts no commands. A separate owner-authenticated shell is required; SystemGate stays read-only.</p>
          </PopoverContent>
        </Popover>
        <Button ref={fullscreenButton} variant="ghost" size="icon" className="size-8"
          onClick={() => setFullscreen(open => !open)} aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          title={fullscreen ? "Exit fullscreen (Esc)" : "Enter fullscreen"}>
          {fullscreen ? <Minimize2 /> : <Maximize2 />}
        </Button>
      </div>
    </div>
    <div className="flex min-h-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col px-2 pb-2">
        <div data-slot="terminal-output" role="region" aria-label="Terminal output" tabIndex={0}
          className="min-h-0 flex-1 overflow-auto rounded-lg border bg-muted p-4 font-mono text-xs leading-7 break-words focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:text-sm">
          <p className="text-muted-foreground">Conker · owner shell</p>
          <p className="text-muted-foreground">No authenticated terminal session.</p>
          <p className="mt-5">Connection: offline</p>
          <p className="text-muted-foreground">Waiting for a separate shell transport.</p>
          <p className="mt-5 text-muted-foreground" aria-hidden="true">
            {terminal.prompt}:~${" "}<span className="terminal-cursor inline-block h-4 w-2 translate-y-0.5 bg-foreground" />
          </p>
        </div>
      </div>
    </div>
    <div className="flex shrink-0 items-center justify-between gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
      <span>Offline · Preview only</span>
      <span className="hidden sm:inline">{fullscreen ? "Esc to exit fullscreen" : "Owner shell"}</span>
    </div>
  </div>

  return (
    <BaseLayout
      title="Terminal"
      description="Your server, when you need to work directly."
      variant="workspace"
    >
      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        {!fullscreen && workbench}
        <DialogContent showCloseButton={false}
          className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-card p-0 shadow-none duration-0 data-[state=open]:animate-none data-[state=closed]:animate-none sm:max-w-none"
          onCloseAutoFocus={event => {
            event.preventDefault()
            requestAnimationFrame(() => fullscreenButton.current?.focus())
          }}>
          <DialogTitle className="sr-only">Terminal fullscreen</DialogTitle>
          <DialogDescription className="sr-only">Terminal output. Press Escape to return to the dashboard.</DialogDescription>
          {fullscreen && workbench}
        </DialogContent>
      </Dialog>
    </BaseLayout>
  )
}
