import { Check, ChevronDown, ChevronRight, Copy, File, Folder, FolderOpen } from "lucide-react"
import type { DirectoryEntry } from "@/lib/api/models"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type DirectoryTreeProps = {
  root: DirectoryEntry
  expanded: Set<string>
  selected: string
  onToggle: (path: string) => void
  onSelect: (path: string) => void
  onCopy: () => void
  copyStatus: "idle" | "copied" | "error"
}

export function DirectoryTree({ root, expanded, selected, onToggle, onSelect, onCopy, copyStatus }: DirectoryTreeProps) {
  const entry = (node: DirectoryEntry) => {
    const folder = node.kind === "directory"
    const open = folder && expanded.has(node.path)
    const Icon = folder ? open ? FolderOpen : Folder : File
    return <li key={node.path}>
      <button type="button" title={node.path} aria-label={node.name}
        aria-expanded={folder ? open : undefined} aria-current={!folder && selected === node.path ? "true" : undefined}
        onClick={() => { onSelect(node.path); if (folder) onToggle(node.path) }}
        className={cn("flex min-h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring", selected === node.path && "bg-accent text-accent-foreground")}>
        {folder ? open ? <ChevronDown className="size-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-3 shrink-0 text-muted-foreground" /> : <span className="size-3 shrink-0" />}
        <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="truncate">{node.name}</span>
      </button>
      {folder && open && <ul className="ml-3 border-l pl-2">{node.children.length ? node.children.map(entry) : <li className="px-2 py-2 text-xs text-muted-foreground">Empty folder</li>}</ul>}
    </li>
  }

  return <div className="flex min-h-0 flex-1 flex-col">
    <nav aria-label="Directory tree" className="min-h-0 flex-1 overflow-auto p-2"><ul>{entry(root)}</ul></nav>
    <div className="shrink-0 border-t p-3">
      <div className="mb-1 flex items-center justify-between gap-2"><p className="text-xs text-muted-foreground">Selected path</p>
        <Button type="button" variant="ghost" size="icon" className="size-8" onClick={onCopy} aria-label="Copy selected path" title="Copy selected path">{copyStatus === "copied" ? <Check /> : <Copy />}</Button></div>
      <p className="break-all font-mono text-xs leading-5">{selected}</p>
      <p role="status" className="mt-1 min-h-4 text-xs text-muted-foreground">{copyStatus === "copied" ? "Path copied" : copyStatus === "error" ? "Couldn’t copy. Select the path to copy it." : "Read-only preview"}</p>
    </div>
  </div>
}
