import { useConker } from "@/lib/api/store"
import { Link, useSearchParams } from "react-router-dom"
import { useMemo, useState } from "react"
import { BaseLayout } from "@/components/layouts/base-layout"
import { DataTable } from "@/components/data-table"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { DetailPanel, OverlayBody, FormActions, RecordItem } from "@/components/design-system"
import { ReferenceSection } from "@/components/reference-section"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { JournalEntry } from "@/lib/api/models"
import { journalColumns } from "./columns"

export default function JournalPage() {
  const entries = useConker(data => data.entries)
  const [params, setParams] = useSearchParams()
  const actor = params.get("actor") || "all"
  const [selected, setSelected] = useState<JournalEntry | null>(null)
  const columns = useMemo(() => journalColumns(setSelected), [])
  return (
    <BaseLayout variant="collection"
      title="Journal"
      description="What happened, who did it, and the evidence left behind."
    >
      <div className="flex flex-col gap-4 ">
        <DataTable
          columns={columns}
          data={entries.filter(entry => actor === "all" || entry.actor === actor)}
          searchColumn="detail"
          searchPlaceholder="Search event details…"
          itemLabel="events"
          renderItem={entry => <RecordItem title={entry.event} description={entry.detail} onOpen={() => setSelected(entry)} meta={<><Badge variant="outline">{entry.actor}</Badge><span>{entry.time}</span></>} />}
          toolbarAction={<div className="flex items-center gap-2">
          <Label htmlFor="actor-filter">Actor</Label>
          <Select
            value={actor}
            onValueChange={(value) =>
              setParams(value === "all" ? {} : { actor: value })
            }
          >
            <SelectTrigger id="actor-filter" size="sm" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All actors</SelectItem>
                {["Conker", "Workshop", "System", "You"].map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>} />
        <p className="text-xs text-muted-foreground">
          Fixture journal · 10–12 September 2026. A request, an approval, and an
          execution receipt are separate events.
        </p>
      </div>
      <DetailPanel open={!!selected} onOpenChange={open => { if (!open) setSelected(null) }} title={selected?.event ?? "Event details"} description="Recorded activity and its source">
        {selected && <><OverlayBody>
          <ReferenceSection title="Event"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{selected.actor}</Badge><span className="text-xs text-muted-foreground">{selected.time}</span></div><p>{selected.detail}</p></ReferenceSection>
          <ReferenceSection title="Provenance"><p className="text-muted-foreground">Sample journal · 10–12 September 2026. Requests, decisions, and execution receipts are separate events.</p><p className="font-mono text-xs">{selected.id}</p></ReferenceSection>
        </OverlayBody><FormActions inset><Button asChild><Link to={selected.source}>Open source</Link></Button></FormActions></>}
      </DetailPanel>
    </BaseLayout>
  )
}
