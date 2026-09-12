import { ChevronDown, Wrench } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/status-badge"
export function ToolActivity({ reminder = false }: { reminder?: boolean }) {
  const tool = reminder ? "reminder.create" : "calendar.read"
  const record = reminder ? { arguments: { title: "Check server backup", at: "Sunday 17:00" }, action_id: "act_fixture_reminder_009", outcome: "completed", turn_status: "acted_no_reply" } : { arguments: { calendar: "Personal", from: "2026-09-13", to: "2026-09-18" }, action_id: "act_fixture_calendar_031", duration: "180 ms", outcome: "Read 3 events. Nothing changed." }
  return <Card className="gap-2 py-3 shadow-none">
    <CardHeader className="gap-2 px-4"><CardTitle className="flex flex-wrap items-center gap-2 text-sm"><Wrench className="size-4 text-muted-foreground" /><span className="font-mono font-normal">{tool}</span><StatusBadge tone="live">Live</StatusBadge></CardTitle><CardDescription className="text-xs">{reminder ? "Fixture receipt · Action completed · Reminder saved" : "Fixture receipt · Checked 1s ago · Read 3 events"}</CardDescription></CardHeader>
    <CardContent className="px-4"><Collapsible><CollapsibleTrigger asChild><Button variant="ghost" size="sm" className="group -ml-2 h-7 text-xs">Arguments & record<ChevronDown className="transition-transform group-data-[state=open]:rotate-180" /></Button></CollapsibleTrigger><CollapsibleContent><pre className="mt-2 overflow-x-auto rounded-md border bg-background p-3 font-mono text-xs leading-relaxed">{JSON.stringify(record, null, 2)}</pre><p className="mt-2 text-xs text-muted-foreground">Recorded fixture evidence. “Live” describes this sample; no service is connected.</p></CollapsibleContent></Collapsible></CardContent>
  </Card>
}

