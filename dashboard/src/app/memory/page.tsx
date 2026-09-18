import { useConker } from "@/lib/api/store"
import { TriangleAlert } from "lucide-react"
import { BaseLayout } from "@/components/layouts/base-layout"
import { DataTable } from "@/components/data-table"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { useMemo, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { DetailPanel, OverlayBody, FormActions, RecordItem } from "@/components/design-system"
import { ReferenceSection } from "@/components/reference-section"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { memoryColumns } from "./columns"

export default function MemoryPage() {
  const memorySearch = useConker(data => data.memorySearch)
  const memories = useConker(data => data.memories)
  const location = useLocation()
  const [selectedId, setSelectedId] = useState(location.hash.slice(1))
  const selected = memories.find(memory => memory.id === selectedId)
  const columns = useMemo(() => memoryColumns(memory => setSelectedId(memory.id)), [])
  return (
    <BaseLayout variant="collection"
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
          itemLabel="memories"
          renderItem={memory => <RecordItem title={memory.text} lang={memory.language} description={memory.provenance} onOpen={() => setSelectedId(memory.id)} meta={<><Badge variant="outline">{memory.category}</Badge><span>{memory.confidence} confidence</span><span>{memory.age}</span></>} />}
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
      <DetailPanel open={!!selected} onOpenChange={open => { if (!open) setSelectedId("") }} title="Memory details" description="The record and the evidence behind it">
        {selected && <><OverlayBody>
          <ReferenceSection title="Memory"><p lang={selected.language}>{selected.text}</p><div className="flex flex-wrap gap-2"><Badge variant="outline">{selected.category}</Badge><Badge variant="secondary">{selected.confidence} confidence</Badge></div><p className="text-xs text-muted-foreground">Age: {selected.age} · sample dated 12 September 2026</p></ReferenceSection>
          <ReferenceSection title="Evidence"><p>{selected.provenance}</p><p className="text-xs text-muted-foreground">Confidence describes the stored record; it is not a guarantee. Review the original source for context.</p></ReferenceSection>
        </OverlayBody><FormActions inset><Button asChild><Link to={selected.source}>Open source</Link></Button></FormActions></>}
      </DetailPanel>
    </BaseLayout>
  )
}
