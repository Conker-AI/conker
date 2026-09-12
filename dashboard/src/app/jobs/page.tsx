import { Info } from "lucide-react"
import { BaseLayout } from "@/components/layouts/base-layout"
import { DataTable } from "@/components/data-table"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { columns } from "./columns"
import { useJobs } from "./store"
export default function JobsPage() {
  const { jobs, notice } = useJobs()
  return (
    <BaseLayout
      title="Jobs"
      description="What runs on its own, and when it should stop."
    >
      <div className="flex flex-col gap-4 px-4 lg:px-6">
        <DataTable
          columns={columns}
          data={jobs}
          searchColumn="name"
          searchPlaceholder="Search jobs…"
        />
        {notice && (
          <Alert role="status">
            <Info />
            <AlertTitle>Fixture updated</AlertTitle>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
        <p className="text-xs text-muted-foreground">
          Fixture schedules · Asia/Jerusalem · snapshot at 12 September 2026,
          16:43. Pause and Run now update this preview until reload.
        </p>
      </div>
    </BaseLayout>
  )
}
