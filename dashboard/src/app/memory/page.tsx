import { useConker } from "@/lib/api/store"
import { TriangleAlert } from "lucide-react"
import { BaseLayout } from "@/components/layouts/base-layout"
import { DataTable } from "@/components/data-table"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { columns } from "./columns"

export default function MemoryPage() {
  const memorySearch = useConker(data => data.memorySearch)
  const memories = useConker(data => data.memories)
  return (
    <BaseLayout
      title="Memory"
      description="What Conker thinks it knows. Evidence first; confidence is not certainty."
    >
      <div className="flex flex-col gap-4 ">
        {memorySearch.degraded && <Alert variant="warning">
          <TriangleAlert />
          <AlertTitle>Degraded search</AlertTitle>
          <AlertDescription>
            MemoryGate’s vector index is unavailable in this fixture. Source
            records are safe; meaning search is paused. Search below matches the
            displayed text only, in its original language.
          </AlertDescription>
        </Alert>}
        <DataTable
          columns={columns}
          data={memories}
          searchColumn="text"
          searchPlaceholder="Search memory text…"
          filters={[
            {
              column: "category",
              title: "Category",
              options: ["Training", "School", "Preference", "Projects"].map(
                (value) => ({ label: value, value })
              ),
            },
          ]}
        />
        <p className="text-xs text-muted-foreground">
          Fixture records · ages at 12 September 2026. An older preference can
          conflict with a newer routine; both sources remain visible.
        </p>
      </div>
    </BaseLayout>
  )
}
