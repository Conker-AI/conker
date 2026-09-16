import { useState } from "react"
import { FolderTree } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useConker } from "@/lib/api/store"
import { DirectoryTree } from "./directory-tree"

export function SystemFiles() {
  const files = useConker(data => data.files)
  const [expanded, setExpanded] = useState(() => new Set([
    files.root.path,
    `${files.root.path}/dashboard`,
    `${files.root.path}/dashboard/src`,
  ]))
  const [selected, setSelected] = useState(files.root.path)
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle")

  return <Card className="min-h-0 flex-1 gap-0 overflow-hidden py-0">
      <CardHeader className="flex shrink-0 flex-row flex-wrap items-center justify-between gap-3 border-b py-4">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-sm"><FolderTree className="size-4 text-muted-foreground" />Directory tree</CardTitle>
          <CardDescription className="mt-1 break-all font-mono text-xs">{files.root.path}</CardDescription>
        </div>
        {files.source === "sample" && <Badge variant="outline">Sample data</Badge>}
      </CardHeader>
      <DirectoryTree root={files.root} expanded={expanded} selected={selected} copyStatus={copyStatus}
        onToggle={path => setExpanded(current => {
          const next = new Set(current)
          if (next.has(path)) next.delete(path)
          else next.add(path)
          return next
        })}
        onSelect={path => { setSelected(path); setCopyStatus("idle") }}
        onCopy={async () => {
          try {
            await navigator.clipboard.writeText(selected)
            setCopyStatus("copied")
          } catch {
            setCopyStatus("error")
          }
        }}
      />
    </Card>
}
