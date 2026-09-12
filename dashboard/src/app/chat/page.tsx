import { useNavigate } from "react-router-dom"
import { BaseLayout } from "@/components/layouts/base-layout"
import { DataTable } from "@/components/data-table"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { columns as agentColumns } from "@/app/agents/columns"
import { agents } from "@/app/agents/data"
import { columns } from "./columns"
import { sessions } from "./data"

export default function ChatsPage() {
  const navigate = useNavigate()
  return (
    <BaseLayout title="Chats" description="Pick up where you left off.">
      <Tabs defaultValue="sessions" className="gap-4 ">
        <TabsList className="border">
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
        </TabsList>
        <TabsContent value="sessions">
          <DataTable
            columns={columns}
            data={sessions}
            searchColumn="title"
            searchPlaceholder="Find a conversation…"
            onRowClick={(session) => navigate(`/chat/${session.id}`)}
          />
        </TabsContent>
        <TabsContent value="agents">
          <DataTable
            columns={agentColumns}
            data={agents}
            searchColumn="name"
            searchPlaceholder="Find an agent…"
          />
        </TabsContent>
        <p className="text-xs text-muted-foreground">
          Fixture conversations · relative times at 12 September 2026, 16:43.
        </p>
      </Tabs>
    </BaseLayout>
  )
}
