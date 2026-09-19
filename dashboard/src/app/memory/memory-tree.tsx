import { Folder, FileText, ChevronRight } from "lucide-react"
import { memoryTitle } from "@/lib/memory-explorer"
import type { Memory } from "@/lib/api/models"
import { cn } from "@/lib/utils"

export function MemoryTree({ memories, selectedId, onOpen }: { memories: Memory[]; selectedId?: string; onOpen: (memory: Memory) => void }) {
  const categories = [...new Set(memories.map(memory => memory.category))].sort()
  return <nav aria-label="Memory folders" className="memory-folder-browser">
    <div className="border-b p-3"><p className="text-sm font-medium">Library</p><p className="mt-1 text-xs text-muted-foreground">Category → record</p></div>
    <div className="min-h-0 flex-1 overflow-auto p-2">{categories.map(category => <details key={category} open className="group/folder">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-3 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"><ChevronRight className="size-3 shrink-0 group-open/folder:rotate-90" /><Folder className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{category}</span><span className="text-xs text-muted-foreground">{memories.filter(memory => memory.category === category).length}</span></summary>
      <div className="ml-3 border-l pl-2">{memories.filter(memory => memory.category === category).map(memory => <button key={memory.id} type="button" aria-current={selectedId === memory.id ? "true" : undefined} onClick={() => onOpen(memory)} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring", selectedId === memory.id && "bg-accent text-accent-foreground")}><FileText className="size-3 shrink-0 text-muted-foreground" /><span className="truncate">{memoryTitle(memory)}</span></button>)}</div>
    </details>)}</div>
    <p className="border-t p-3 text-xs text-muted-foreground">Organizational hierarchy, not server folders.</p>
  </nav>
}
