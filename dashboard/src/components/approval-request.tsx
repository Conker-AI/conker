import { Link } from "react-router-dom"
import { ArrowRight, CalendarDays, Files, Mail } from "lucide-react"
import type { Ticket } from "@/lib/api/models"

/** A conversation points to a request; the actual decision stays in Inbox. */
export function ApprovalRequest({ ticket }: { ticket: Ticket }) {
  const pending = ticket.status === "Needs you"
  const action = pending ? "Review request" : "View decision"
  const Icon = ticket.effect === "Deletion" ? Files : ticket.effect === "Proposal" ? CalendarDays : Mail

  return <Link
    to={`/inbox/${ticket.id}`}
    data-slot="approval-request"
    aria-label={`${action}: ${ticket.request}`}
    className="group/request grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 rounded-lg border bg-card px-4 py-3 transition-colors hover:border-ring/50 hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:grid-cols-[1rem_minmax(0,1fr)_auto]"
  >
    <Icon className="mt-0.5 size-4 text-muted-foreground" aria-hidden="true" />
    <span className="min-w-0">
      <span className="block text-sm font-medium leading-5 [overflow-wrap:anywhere]">{ticket.request}</span>
      <span className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs leading-5 text-muted-foreground">
        <span>{ticket.service}</span><span aria-hidden="true">·</span><span>{pending ? ticket.effect === "Proposal" ? "Ready for your review" : "Needs your approval" : ticket.status}</span><span aria-hidden="true">·</span><span>Preview</span>
      </span>
    </span>
    <span className="col-start-2 inline-flex min-h-8 items-center gap-2 text-xs font-medium group-hover/request:text-primary sm:col-start-3 sm:row-start-1 sm:self-center">
      {action}<ArrowRight className="size-3.5" aria-hidden="true" />
    </span>
  </Link>
}
