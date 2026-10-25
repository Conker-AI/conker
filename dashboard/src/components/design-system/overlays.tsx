import { useEffect, useRef, type ComponentProps, type ReactNode } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"

/** Canvas inspection stays nonmodal so the user can select another point. */
export function WorkspaceInspector({ title, description, onClose, children, label = "Memory inspector" }: { title: ReactNode; description: ReactNode; onClose: () => void; children: ReactNode; label?: string }) {
  return <aside aria-label={label} className="workspace-inspector">
    <header className="flex shrink-0 items-start gap-3 border-b p-4"><div className="min-w-0 flex-1"><h2 className="break-words text-sm font-semibold">{title}</h2><p className="mt-1 text-xs text-muted-foreground">{description}</p></div><Button size="icon" variant="ghost" aria-label="Close inspector" onClick={onClose}><X /></Button></header>
    {children}
  </aside>
}

/** Focused creation/configuration. Children own a scroll body and action footer.
 * Base UI returns focus to the control that opened the overlay and leaves it alone when another
 * overlay took it, so callers only pass `initialFocus` / `finalFocus` to change that. */
export function TaskDialogContent({ title, description, size = "default", className, children, ...props }: Omit<ComponentProps<typeof DialogContent>, "title"> & {
  title: ReactNode; description: ReactNode; size?: "default" | "wide"
}) {
  return <DialogContent {...props} data-pattern="task-dialog" className={cn("flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0", size === "wide" && "sm:max-w-2xl", className)}>
    <DialogHeader className="shrink-0 border-b p-5 pr-14 text-left">
      <DialogTitle className="break-words leading-6">{title}</DialogTitle>
      <DialogDescription className="leading-5">{description}</DialogDescription>
    </DialogHeader>
    {children}
  </DialogContent>
}

export function OverlayBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("min-h-0 flex-1 space-y-5 overflow-y-auto p-5 [overflow-wrap:anywhere]", className)} {...props} />
}

/** Secondary before primary; feedback belongs beside the actions, never in a toast alone. */
export function FormActions({ children, description, inset = false, className }: {
  children: ReactNode; description?: ReactNode; inset?: boolean; className?: string
}) {
  return <div data-pattern="form-actions" className={cn("flex shrink-0 flex-wrap items-center justify-end gap-3 border-t", inset ? "p-5" : "pt-4", className)}>
    {description && <div className="mr-auto min-w-0 text-xs leading-5 text-muted-foreground">{description}</div>}
    <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">{children}</div>
  </div>
}

/**
 * Details open in place, under the item that was chosen (owner, 24 October: no side windows). The
 * heading takes focus so the details are read first; Escape, the close button or choosing the item
 * again closes them, and focus goes back to the item.
 */
export function InlineDetails({ open = true, onOpenChange, onClose, ...props }: {
  title: ReactNode; description?: ReactNode; busy?: boolean; children: ReactNode
  /** Same contract as DetailPanel, so a screen can switch without changing its state. */
  open?: boolean; onOpenChange?: (open: boolean) => void; onClose?: () => void
}) {
  return open ? <InlineDetailsBody {...props} onClose={() => { onClose?.(); onOpenChange?.(false) }} /> : null
}

function InlineDetailsBody({ title, description, onClose, busy = false, children }: {
  title: ReactNode; description?: ReactNode; onClose: () => void; busy?: boolean; children: ReactNode
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const node = heading.current
    const region = node?.closest<HTMLElement>('[data-slot="inline-details"]')
    // Return focus to the item that owns these details (its expandable control), else to where it was.
    const owner = region?.parentElement?.closest<HTMLElement>('li, [data-pattern="record-item"]')?.querySelector<HTMLElement>('[aria-expanded]') ?? null
    const origin = owner ?? (document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null)
    node?.focus({ preventScroll: true })
    region?.scrollIntoView({ block: "nearest" })
    return () => {
      requestAnimationFrame(() => {
        const active = document.activeElement
        if (origin?.isConnected && (!active || active === document.body)) origin.focus({ preventScroll: true })
      })
    }
  }, [])
  return <div data-slot="inline-details" role="region" aria-label={typeof title === "string" ? title : undefined}
    onKeyDown={event => { if (event.key === "Escape" && !busy && !event.defaultPrevented) { event.stopPropagation(); onClose() } }}
    className="mx-2 mb-3 mt-1 flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card text-card-foreground sm:mx-3">
    <div className="flex items-start gap-3 border-b px-4 py-3">
      <div className="min-w-0 flex-1">
        <h3 ref={heading} tabIndex={-1} className="break-words font-medium leading-6 outline-none">{title}</h3>
        {description && <p className="text-sm leading-5 text-muted-foreground">{description}</p>}
      </div>
      <Button type="button" size="icon-sm" variant="ghost" aria-label="Close details" title="Close details" disabled={busy} onClick={onClose}><X /></Button>
    </div>
    {children}
  </div>
}

/** Reference/details preserve the page's place; multi-field forms use TaskDialogContent. */
export function DetailPanel({ open, onOpenChange, title, description, children, finalFocus, busy = false }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: ReactNode; description: ReactNode;
  children: ReactNode; finalFocus?: ComponentProps<typeof SheetContent>["finalFocus"]; busy?: boolean
}) {
  return <Sheet open={open} onOpenChange={next => { if (!busy) onOpenChange(next) }}>
    <SheetContent closeProps={{ disabled: busy }} finalFocus={finalFocus} data-pattern="detail-panel" className="w-full gap-0 overflow-hidden sm:max-w-xl">
      <SheetHeader className="shrink-0 border-b p-5 pr-14">
        <SheetTitle className="break-words leading-6">{title}</SheetTitle>
        <SheetDescription className="leading-5">{description}</SheetDescription>
      </SheetHeader>
      {children}
    </SheetContent>
  </Sheet>
}

export function ConfirmationDialog({ open, onOpenChange, title, description, children, actionLabel, pending, error, onConfirm, finalFocus, actionVariant = "destructive" }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; children?: ReactNode;
  actionLabel: string; pending: boolean; error?: string | null; onConfirm: () => void | Promise<void>;
  finalFocus?: ComponentProps<typeof DialogContent>["finalFocus"]; actionVariant?: "default" | "destructive"
}) {
  const cancel = useRef<HTMLButtonElement>(null)
  return <Dialog open={open} onOpenChange={next => { if (!pending) onOpenChange(next) }}>
    <TaskDialogContent title={title} description={description} showCloseButton={!pending} initialFocus={cancel} finalFocus={finalFocus}>
      {(children || error) && <OverlayBody>{children}{error && <p role="alert" className="text-sm text-destructive-foreground">{error}</p>}</OverlayBody>}
      <FormActions inset>
        <Button ref={cancel} type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button type="button" variant={actionVariant} disabled={pending} onClick={() => void onConfirm()}>{pending ? "Working…" : actionLabel}</Button>
      </FormActions>
    </TaskDialogContent>
  </Dialog>
}
