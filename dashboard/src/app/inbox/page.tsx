import { useNavigate } from "react-router-dom"
import { BaseLayout } from "@/components/layouts/base-layout"
import { DataTable } from "@/components/data-table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { columns } from "./columns"
import { useConker } from "@/lib/api/store"

export default function InboxPage() {
  const navigate = useNavigate()
  const tickets = useConker((state) => state.tickets)
  const pending = tickets.filter((ticket) => ticket.status === "Needs you")
  return (
    <BaseLayout
      title="Inbox"
      description="The intent, the effect, and your say. Fixture decisions reset on reload."
    >
      <Tabs defaultValue="pending" className="gap-4 ">
        <TabsList className="border">
          <TabsTrigger value="pending">
            Needs you{" "}
            <span className="ml-1 text-muted-foreground">{pending.length}</span>
          </TabsTrigger>
          <TabsTrigger value="history">Decision history</TabsTrigger>
        </TabsList>
        <TabsContent value="pending">
          {pending.length === 0 && (
            <p role="status" className="mb-4 text-sm text-muted-foreground">
              You’re all caught up. Your fixture decisions are in Decision
              history.
            </p>
          )}
          <DataTable
            columns={columns}
            data={pending}
            searchColumn="request"
            searchPlaceholder="Search requests…"
            onRowClick={(ticket) => navigate(`/inbox/${ticket.id}`)}
          />
        </TabsContent>
        <TabsContent value="history">
          <DataTable
            columns={columns}
            data={tickets.filter((ticket) => ticket.status !== "Needs you")}
            searchColumn="request"
            searchPlaceholder="Search decisions…"
            onRowClick={(ticket) => navigate(`/inbox/${ticket.id}`)}
          />
        </TabsContent>
      </Tabs>
    </BaseLayout>
  )
}
