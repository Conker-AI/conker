import { History, Pencil } from "lucide-react"
import type { Job } from "@/lib/api/models"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { OverlayBody } from "@/components/design-system"
import { ReferenceSection } from "@/components/reference-section"
import { JobActions, type JobControls } from "./row-actions"

export function JobDetails({ job, agentName, controls }: { job: Job; agentName: string; controls: JobControls }) {
  return <>
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
      <Button size="sm" variant="outline" onClick={() => controls.edit(job)} disabled={controls.pending}><Pencil />Edit job</Button>
      <JobActions job={job} controls={controls} />
    </div>
    <OverlayBody>
      <ReferenceSection title="Configuration">
        <div className="flex items-center gap-2"><Badge variant="outline">{job.status}</Badge><span className="text-sm text-muted-foreground">{agentName}</span></div>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div><dt className="text-xs text-muted-foreground">Schedule</dt><dd className="mt-1">{job.schedule}</dd><dd className="mt-1 text-xs text-muted-foreground">{job.timeZone}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Next run</dt><dd className="mt-1">{job.status === "Paused" ? "Paused" : job.nextRun}</dd></div>
        </dl>
      </ReferenceSection>
      <ReferenceSection title="Instructions"><p className="whitespace-pre-wrap break-words">{job.instructions}</p></ReferenceSection>
      <ReferenceSection title={`Run history · ${job.history.length}`} icon={<History />}>
        {job.history.length ? <ol className="divide-y">{job.history.map(run => <li key={run.id} className="space-y-2 py-3 first:pt-0">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className={run.status === "Failed" ? "text-sm text-destructive" : "text-sm font-medium"}>{run.source === "preview" ? "Preview complete" : run.status}</span><Badge variant="outline" className="font-normal">{run.source === "preview" ? "Simulated" : "Sample receipt"}</Badge></div>
          <time dateTime={run.startedAt} className="block text-xs text-muted-foreground">{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: job.timeZone }).format(new Date(run.startedAt))} · {job.timeZone}</time>
          <p className="text-sm leading-6 text-muted-foreground">{run.summary}</p>
        </li>)}</ol> : <div className="space-y-2 py-4 text-sm text-muted-foreground"><History className="size-5" /><p>No runs yet. Use Run now to try a preview.</p></div>}
      </ReferenceSection>
    </OverlayBody>
  </>
}
