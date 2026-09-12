import { useConker } from "@/lib/api/store"
import { BaseLayout } from "@/components/layouts/base-layout"
import { DataTable } from "@/components/data-table"
import { columns } from "./columns"

export default function ToolsPage() {
  const tools = useConker(data => data.tools)
  return (
    <BaseLayout
      title="Tools"
      description="What each tool can do, and who is scoped to it. Availability is not permission."
    >
      <div className="flex flex-col gap-4 ">
        <DataTable
          columns={columns}
          data={tools}
          searchColumn="name"
          searchPlaceholder="Search tools…"
          filters={[
            {
              column: "sensitivity",
              title: "Sensitivity",
              options: ["Observe", "Prepare", "Act locally", "Act outward"].map(
                (value) => ({ label: value, value })
              ),
            },
          ]}
        />
        <p className="text-xs text-muted-foreground">
          Fixture registry · recent use describes recorded outcomes, including
          blocked actions.
        </p>
      </div>
    </BaseLayout>
  )
}
