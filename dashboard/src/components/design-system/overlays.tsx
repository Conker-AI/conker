import { useRef, type ComponentProps, type ReactNode } from "react"
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

/** Remember the initiating control even when a menu opened the overlay. */
function useOverlayFocus() {
  const origin = useRef<HTMLElement | null>(null)
  return {
    onOpenAutoFocus: () => {
      const active = document.activeElement
      origin.current = active instanceof HTMLElement ? active : null
    },
    onCloseAutoFocus: (event: Event) => {
      event.preventDefault()
      requestAnimationFrame(() => {
        // A dialog may be handing off to an inspector. Do not steal its focus.
        if (document.querySelector('[role="dialog"][data-state="open"]')) return
        if (origin.current?.isConnected) origin.current.focus()
      })
    },
  }
}

/** Focused creation/configuration. Children own a scroll body and action footer. */
export function TaskDialogContent({ title, description, size = "default", className, children, onOpenAutoFocus, onCloseAutoFocus, ...props }: Omit<ComponentProps<typeof DialogContent>, "title"> & {
  title: ReactNode; description: ReactNode; size?: "default" | "wide"
}) {
  const focus = useOverlayFocus()
  return <DialogContent {...props} onOpenAutoFocus={event => { focus.onOpenAutoFocus(); onOpenAutoFocus?.(event) }} onCloseAutoFocus={onCloseAutoFocus ?? focus.onCloseAutoFocus} data-pattern="task-dialog" className={cn("flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0", size === "wide" && "sm:max-w-2xl", className)}>
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

/** Reference/details preserve the page's place; multi-field forms use TaskDialogContent. */
export function DetailPanel({ open, onOpenChange, title, description, children, onCloseAutoFocus, busy = false }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: ReactNode; description: ReactNode;
  children: ReactNode; onCloseAutoFocus?: ComponentProps<typeof SheetContent>["onCloseAutoFocus"]; busy?: boolean
}) {
  const focus = useOverlayFocus()
  return <Sheet open={open} onOpenChange={next => { if (!busy) onOpenChange(next) }}>
    <SheetContent {...focus} closeButtonDisabled={busy} onCloseAutoFocus={onCloseAutoFocus ?? focus.onCloseAutoFocus} data-pattern="detail-panel" className="w-full gap-0 overflow-hidden sm:max-w-xl">
      <SheetHeader className="shrink-0 border-b p-5 pr-14">
        <SheetTitle className="break-words leading-6">{title}</SheetTitle>
        <SheetDescription className="leading-5">{description}</SheetDescription>
      </SheetHeader>
      {children}
    </SheetContent>
  </Sheet>
}

export function ConfirmationDialog({ open, onOpenChange, title, description, children, actionLabel, pending, error, onConfirm, onCloseAutoFocus }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; children?: ReactNode;
  actionLabel: string; pending: boolean; error?: string | null; onConfirm: () => void | Promise<void>;
  onCloseAutoFocus?: ComponentProps<typeof DialogContent>["onCloseAutoFocus"]
}) {
  const cancel = useRef<HTMLButtonElement>(null)
  return <Dialog open={open} onOpenChange={next => { if (!pending) onOpenChange(next) }}>
    <TaskDialogContent title={title} description={description} showCloseButton={!pending}
      onOpenAutoFocus={event => { event.preventDefault(); cancel.current?.focus() }}
      {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}>
      {(children || error) && <OverlayBody>{children}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</OverlayBody>}
      <FormActions inset>
        <Button ref={cancel} type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button type="button" variant="destructive" disabled={pending} onClick={() => void onConfirm()}>{pending ? "Working…" : actionLabel}</Button>
      </FormActions>
    </TaskDialogContent>
  </Dialog>
}
