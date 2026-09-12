import { Link, useParams } from "react-router-dom"
import {
  ArrowLeft,
  Clock3,
  Mail,
  Files,
  CalendarDays,
  ShieldAlert,
} from "lucide-react"
import { BaseLayout } from "@/components/layouts/base-layout"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useConker, useConkerStore } from "@/lib/api/store"

const outcomes: Record<string, string> = {
  "Approved once":
    "Approval recorded in this fixture. No email was sent and no files were deleted. A real grant would cover only these exact arguments, once, within the spend window.",
  Denied:
    "Denied in this fixture. No execution grant was created; nothing changed outside this page.",
  Accepted:
    "Proposal accepted in this fixture. The two study blocks are ready for review; your calendar has not changed.",
  Dismissed:
    "Proposal dismissed in this fixture. Your calendar has not changed.",
  Consumed:
    "Fixture delivery receipt retained. This approval was used once and cannot be used again.",
  Expired:
    "The decision deadline elapsed in this fixture. Nothing was sent. A new request would need a new decision.",
}

export default function ApprovalDetailPage() {
  const { id } = useParams()
  const ticket = useConker((state) =>
    state.tickets.find((item) => item.id === id)
  )
  const decide = useConkerStore((state) => state.decide)
  const Icon =
    ticket?.effect === "Deletion"
      ? Files
      : ticket?.effect === "Proposal"
        ? CalendarDays
        : Mail
  return (
    <BaseLayout
      title={ticket?.effect === "Proposal" ? "Proposal" : "Approval detail"}
      description="Review the exact request before making a decision."
    >
      <div className="flex flex-col gap-4 ">
        <Button variant="ghost" size="sm" asChild className="self-start">
          <Link to="/inbox">
            <ArrowLeft />
            Back to Inbox
          </Link>
        </Button>
        {!ticket ? (
          <Alert>
            <ShieldAlert />
            <AlertTitle>Request not found</AlertTitle>
            <AlertDescription>
              No fixture request matches “{id}”. This is not an empty inbox.
              Return to Inbox to see available requests.
            </AlertDescription>
          </Alert>
        ) : (
          <Card className="gap-5 py-5 shadow-none">
            <CardHeader className="gap-3 px-5">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Icon className="mr-1 size-5 text-muted-foreground" />
                <span>
                  {ticket.service} · {ticket.agent}
                </span>
                <Badge variant="outline">{ticket.effect}</Badge>
                <Badge variant="outline" className="ml-auto">
                  {ticket.status}
                </Badge>
              </div>
              <CardTitle className="text-xl leading-snug">
                {ticket.request}
              </CardTitle>
              <CardDescription>
                Fixture request · 12 September 2026 · no connected executor
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5 px-5">
              <div className="grid gap-5 md:grid-cols-2">
                <section className="flex flex-col gap-2">
                  <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    You asked
                  </h2>
                  <blockquote className="text-sm leading-relaxed">
                    “{ticket.asked}”
                  </blockquote>
                  <Link
                    className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                    to={ticket.source}
                  >
                    View source conversation
                  </Link>
                </section>
                <section className="flex flex-col gap-2 md:border-l md:pl-5">
                  <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    It wants to
                  </h2>
                  <p className="text-sm leading-relaxed">{ticket.wants}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {ticket.tool} · version {ticket.version}
                  </p>
                </section>
              </div>
              <Separator />
              <dl className="flex flex-col gap-4">
                {ticket.args.map((arg) => (
                  <div
                    key={arg.label}
                    className="grid gap-1 sm:grid-cols-[90px_1fr]"
                  >
                    <dt className="text-sm text-muted-foreground">
                      {arg.label}
                    </dt>
                    <dd className="break-words text-sm leading-relaxed">
                      {arg.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <Alert
                variant={ticket.effect === "Proposal" ? "default" : "warning"}
              >
                <ShieldAlert />
                <AlertTitle>
                  {ticket.effect === "Deletion"
                    ? "This action goes beyond your intent"
                    : ticket.effect === "Proposal"
                      ? "A plan for your review"
                      : "What changes beyond your grant"}
                </AlertTitle>
                <AlertDescription>
                  {ticket.delta}
                  <span className="mt-2 block font-mono text-xs">
                    {ticket.grant}
                  </span>
                </AlertDescription>
              </Alert>
              <div className="grid gap-4 text-sm sm:grid-cols-2">
                <div className="flex gap-2">
                  <Clock3 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-muted-foreground">Decide by</p>
                    <p className="mt-1 tabular-nums">{ticket.decideBy}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Clock3 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-muted-foreground">Spend window</p>
                    <p className="mt-1 tabular-nums">{ticket.spendWindow}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {ticket.effect === "Proposal"
                        ? "Accepting creates no execution permission."
                        : "Separate from the deadline to make your decision."}
                    </p>
                  </div>
                </div>
              </div>
              {ticket.status !== "Needs you" && (
                <Alert role="status">
                  <AlertTitle>{ticket.status}</AlertTitle>
                  <AlertDescription>{outcomes[ticket.status]}</AlertDescription>
                </Alert>
              )}
              <p className="break-all font-mono text-xs text-muted-foreground">
                {ticket.record}
              </p>
            </CardContent>
            <CardFooter className="flex flex-wrap justify-between gap-3 border-t px-5 pt-5">
              <p className="max-w-sm text-xs text-muted-foreground">
                {ticket.effect === "Proposal"
                  ? "A suggestion is not permission to act."
                  : "One request. These arguments only. No standing permission."}
              </p>
              {ticket.status === "Needs you" && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      decide(
                        ticket.id,
                        ticket.effect === "Proposal" ? "Dismissed" : "Denied"
                      )
                    }
                  >
                    {ticket.effect === "Proposal" ? "Dismiss" : "Deny"}
                  </Button>
                  <Button
                    onClick={() =>
                      decide(
                        ticket.id,
                        ticket.effect === "Proposal"
                          ? "Accepted"
                          : "Approved once"
                      )
                    }
                  >
                    {ticket.effect === "Proposal"
                      ? "Accept proposal"
                      : "Approve once"}
                  </Button>
                </div>
              )}
            </CardFooter>
          </Card>
        )}
      </div>
    </BaseLayout>
  )
}
