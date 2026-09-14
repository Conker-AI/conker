import { useId, type ReactNode } from "react"

/** A topic within a contextual reference panel, with a distinct heading and body. */
export function ReferenceSection({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  const id = useId()
  return <section aria-labelledby={id} data-slot="reference-section" className="min-w-0 overflow-hidden rounded-xl border bg-card text-card-foreground">
    <h3 id={id} className="flex items-center gap-2 border-b bg-surface-inset px-4 py-3 text-sm font-semibold [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground">{icon}{title}</h3>
    <div className="space-y-3 px-4 py-4 text-sm leading-6 [overflow-wrap:anywhere]">{children}</div>
  </section>
}
