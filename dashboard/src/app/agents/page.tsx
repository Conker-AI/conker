import { useConker } from "@/lib/api/store"
import { BaseLayout } from "@/components/layouts/base-layout"
import { DataTable } from "@/components/data-table"
import { columns } from "./columns"

export default function AgentsPage() {
  const agents = useConker(data => data.agents)
  return (
    <BaseLayout
      title="Agents"
      description="Choose who you want to work with. Each agent can have its own conversations."
    >
      <div className="">
        <DataTable
          columns={columns}
          data={agents}
          searchColumn="name"
          searchPlaceholder="Search agents…"
        />
      </div>
    </BaseLayout>
  )
}
