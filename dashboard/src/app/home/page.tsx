import { Link } from "react-router-dom"
import { ArrowUpRight } from "lucide-react"
import { useConker } from "@/lib/api/store"
import { getDailyOverview } from "@/lib/daily-overview"
import { BaseLayout } from "@/components/layouts/base-layout"
import { DailyNews } from "@/components/daily-news"
import {
  AgentIdentityPortrait,
  CollectionRow,
  CollectionSection,
} from "@/components/design-system"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const planningPrompt = "Help me plan the coming days. Review my upcoming schedule and suggest one useful next step."

function shortDay(day: string) {
  return day.toLowerCase().replace(/\b[a-z]/g, letter => letter.toUpperCase())
}

/** Relative fixture labels must stay anchored to the day they describe. */
function activityTime(value: string, sourceDate: Date, sample: boolean) {
  if (!sample) return value
  const yesterday = new Date(sourceDate)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const format = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
  return value.replace(/^Today\b/i, format(sourceDate)).replace(/^Yesterday\b/i, format(yesterday))
}

export default function HomePage() {
  const data = useConker(snapshot => snapshot)
  const overview = getDailyOverview(data)
  const { briefing, pendingTickets, agenda, recentActivity, recentSessions, planSource } = overview
  const companionName = data.profile.name || "Conker"
  const sample = briefing.mode === "sample"
  const sourceDate = new Date(`${briefing.date}T12:00:00Z`)
  const weekday = sourceDate.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" })
  const calendarDate = sourceDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })

  return (
    <BaseLayout title="Home" description="Your plans, decisions, and what has changed. All in one place.">

      <div className="grid min-w-0 items-start gap-(--page-section-gap) xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardHeader>
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-3xl leading-tight font-medium tracking-tight sm:text-5xl">{weekday}</h2>
                <p className="mt-2 text-lg text-muted-foreground"><time dateTime={briefing.date}>{calendarDate}</time></p>
              </div>
              <Badge variant="outline">{sample ? "Sample day" : "Daily overview"}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground">{briefing.summary}</p>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">{sample ? "Sample plan and activity" : "Local schedule"} · {briefing.timezone}</p>
          </CardContent>
          <CardContent className="border-t pt-4">
            <CollectionSection title="Coming up">
              {agenda.map((item, index) => (
                <CollectionRow
                  key={`${item.day}-${index}`}
                  to={planSource}
                  title={item.title}
                  description={<span className="min-w-0 truncate">{item.detail}</span>}
                  descriptionTitle={item.detail}
                  leading={<span className="flex w-16 flex-col gap-0.5 text-center"><span className="text-xs text-muted-foreground">{shortDay(item.day)}</span>{item.date && <span className="text-xl leading-6 font-medium tabular-nums">{item.date}</span>}</span>}
                />
              ))}
            </CollectionSection>
            {!agenda.length && <p className="px-3 py-4 text-sm leading-6 text-muted-foreground">No plan yet. Start with what matters to you and build it with {companionName}.</p>}
            <p className="mt-3 px-3 text-xs leading-5 text-muted-foreground sm:px-4">A suggested plan. Open the conversation to review the details.</p>
          </CardContent>
          <CardFooter className="flex-wrap gap-2 border-t">
            <Button variant="outline" asChild><Link to="/companion" state={{ prompt: planningPrompt }}><span className="max-w-44 truncate">Plan with {companionName}</span></Link></Button>
            {agenda.length > 0 && <Button variant="ghost" asChild><Link to={planSource}>Open plan<ArrowUpRight aria-hidden="true" /></Link></Button>}
          </CardFooter>
        </Card>

        <div className="min-w-0 space-y-(--page-section-gap)">
          <Card>
            <CardHeader>
              <CardTitle><h2>Needs you</h2></CardTitle>
              <CardDescription>{pendingTickets.length ? `${pendingTickets.length} ${pendingTickets.length === 1 ? "request is" : "requests are"} waiting for your decision.` : "You’re all caught up."}</CardDescription>
            </CardHeader>
            <CardContent>
              {pendingTickets.length ? (
                <ul className="divide-y divide-border/50">
                  {pendingTickets.slice(0, 3).map(ticket => (
                    <CollectionRow
                      key={ticket.id}
                      to={`/inbox/${ticket.id}`}
                      title={ticket.request}
                      leading={<AgentIdentityPortrait name={ticket.agent} />}
                      description={<><span className="max-w-24 shrink-0 truncate">{ticket.agent}</span><span aria-hidden="true">·</span><span className="min-w-0 truncate">{ticket.effect === "Proposal" ? "A suggestion to review" : ticket.effect === "Deletion" ? "Files stay until you decide" : "Nothing sent yet"}</span></>}
                    />
                  ))}
                </ul>
              ) : <p className="text-sm leading-6 text-muted-foreground">When {companionName} needs a decision, you’ll find it here.</p>}
            </CardContent>
            <CardFooter className="border-t"><Button variant="ghost" asChild><Link to="/inbox">{pendingTickets.length > 3 ? `Review all ${pendingTickets.length} requests` : "Open Inbox"}<ArrowUpRight aria-hidden="true" /></Link></Button></CardFooter>
          </Card>

          <CollectionSection title="Pick up where you left off">
            {recentSessions.slice(0, 2).map(session => (
              <CollectionRow
                key={session.id}
                to={`/chat/${session.id}`}
                title={session.title}
                leading={<AgentIdentityPortrait name={session.agent} />}
                description={<span className="min-w-0 truncate">{session.subtitle}</span>}
                descriptionTitle={session.subtitle}
              />
            ))}
            {!recentSessions.length && <li className="px-3 py-4 text-sm leading-6 text-muted-foreground sm:px-4">Your other conversations will appear here.</li>}
          </CollectionSection>
        </div>
      </div>

      <div className="grid min-w-0 items-start gap-(--page-section-gap) xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <section aria-labelledby="home-activity-title" className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="home-activity-title" className="text-base leading-6 font-medium">Recent activity</h2>
            <Button variant="ghost" size="sm" asChild><Link to="/journal">View journal<ArrowUpRight aria-hidden="true" /></Link></Button>
          </div>
          <ul className="divide-y divide-border/50">
            {recentActivity.map(entry => (
              <CollectionRow
                key={entry.id}
                to={entry.source}
                title={entry.event}
                description={<span className="min-w-0 truncate">{entry.detail}</span>}
                descriptionTitle={entry.detail}
                trailing={<><span>{activityTime(entry.time, sourceDate, sample).split(" · ")[0]}</span><span>{activityTime(entry.time, sourceDate, sample).split(" · ").slice(1).join(" · ")}</span></>}
              />
            ))}
          </ul>
          {!recentActivity.length && <p className="py-4 text-sm leading-6 text-muted-foreground">Activity will appear as you work with {companionName}.</p>}
        </section>
        <section aria-labelledby="home-news-title" className="min-w-0">
          <h2 id="home-news-title" className="mb-3 text-base leading-6 font-medium">News &amp; breakthroughs</h2>
          <DailyNews news={briefing.news} />
        </section>
      </div>
    </BaseLayout>
  )
}
