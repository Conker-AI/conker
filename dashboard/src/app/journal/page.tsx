import { useSearchParams } from "react-router-dom"
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
import { columns } from "./columns"
import { entries } from "./data"

export default function JournalPage() {
  const [params, setParams] = useSearchParams()
  const actor = params.get("actor") || "all"
  return (
    <BaseLayout
      title="Journal"
      description="What happened, who did it, and the evidence left behind."
    >
      <div className="flex flex-col gap-4 ">
        <div className="flex items-center gap-3">
          <Label htmlFor="actor-filter">Actor</Label>
          <Select
            value={actor}
            onValueChange={(value) =>
              setParams(value === "all" ? {} : { actor: value })
            }
          >
            <SelectTrigger id="actor-filter" className="w-44">
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
        </div>
        <DataTable
          columns={columns}
          data={entries.filter(
            (entry) => actor === "all" || entry.actor === actor
          )}
          searchColumn="detail"
          searchPlaceholder="Search event details…"
        />
        <p className="text-xs text-muted-foreground">
          Fixture journal · 10–12 September 2026. A request, an approval, and an
          execution receipt are separate events.
        </p>
      </div>
    </BaseLayout>
  )
}
