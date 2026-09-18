import { useConker } from "@/lib/api/store"
import { BaseLayout } from "@/components/layouts/base-layout"
import { DataTable } from "@/components/data-table"
import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Wrench } from "lucide-react"
import { DetailPanel, OverlayBody, FormActions, RecordItem } from "@/components/design-system"
import { ReferenceSection } from "@/components/reference-section"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { Tool } from "@/lib/api/models"
import { toolColumns } from "./columns"

export default function ToolsPage() {
  const tools = useConker(data => data.tools)
  const tickets = useConker(data => data.tickets)
  const [selected, setSelected] = useState<Tool | null>(null)
  const columns = useMemo(() => toolColumns(setSelected), [])
  return (
    <BaseLayout variant="collection"
      title="Tools"
      description="What each tool can do, and who is scoped to it. Availability is not permission."
    >
      <div className="flex flex-col gap-4 ">
        <DataTable
          columns={columns}
          data={tools}
          itemLabel="tools"
          renderItem={tool => <RecordItem title={tool.name} description={tool.purpose} leading={<Wrench className="size-4 text-muted-foreground" />} onOpen={() => setSelected(tool)} meta={<><Badge variant="outline">{tool.sensitivity}</Badge><span>{tool.scope}</span><span>{tool.recentUse}</span></>} />}
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
      <DetailPanel open={!!selected} onOpenChange={open => { if (!open) setSelected(null) }} title={selected?.name ?? "Tool details"} description="Capability, scope, and recorded activity">
        {selected && <><OverlayBody>
          <ReferenceSection title="Capability"><p>{selected.purpose}</p><Badge variant="outline">{selected.sensitivity}</Badge></ReferenceSection>
          <ReferenceSection title="Scope & recent use"><dl className="space-y-3"><div><dt className="text-xs text-muted-foreground">Agent scope</dt><dd>{selected.scope}</dd></div><div><dt className="text-xs text-muted-foreground">Last recorded use</dt><dd>{selected.recentUse}</dd></div></dl><p className="text-xs text-muted-foreground">Sample registry. Availability does not grant permission to execute a tool.</p></ReferenceSection>
          <ReferenceSection title="Related requests">{tickets.some(ticket => ticket.tool === selected.name) ? <ul className="divide-y">{tickets.filter(ticket => ticket.tool === selected.name).map(ticket => <li key={ticket.id}><Link className="block rounded-md py-3 hover:underline focus-visible:outline-2 focus-visible:outline-ring" to={`/inbox/${ticket.id}`}><span className="block font-medium">{ticket.request}</span><span className="text-xs text-muted-foreground">{ticket.status}</span></Link></li>)}</ul> : <p className="text-muted-foreground">No requests recorded for this tool.</p>}</ReferenceSection>
        </OverlayBody><FormActions inset><Button asChild variant="outline"><Link to="/settings?tab=connections">Manage connections</Link></Button></FormActions></>}
      </DetailPanel>
    </BaseLayout>
  )
}
