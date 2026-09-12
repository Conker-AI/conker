import { BaseLayout } from "@/components/layouts/base-layout"
import { DataTable } from "@/components/data-table"
import { columns } from "./columns"
import { agents } from "./data"

export default function AgentsPage() {
  return (
    <BaseLayout
      title="Agents"
      description="Persistent identities. Readable contracts. Temporary workers stay inside their runs."
    >
      <div className="px-4 lg:px-6">
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
