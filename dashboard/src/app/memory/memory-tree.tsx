import { Folder, FileText, MessageSquare, BookOpen, ChevronRight, StickyNote } from "lucide-react"
import { memoryTitle } from "@/lib/memory-explorer"
import type { Memory } from "@/lib/api/models"

export function MemoryTree({ memories, onOpen }: { memories: Memory[]; onOpen: (memory: Memory) => void }) {
  const groups = [
    { name: "Conversations", icon: MessageSquare, items: memories.filter(memory => memory.origin !== "manual" && memory.source.startsWith("/chat/")) },
    { name: "Journal", icon: BookOpen, items: memories.filter(memory => memory.origin !== "manual" && !memory.source.startsWith("/chat/")) },
    { name: "Manual notes", icon: StickyNote, items: memories.filter(memory => memory.origin === "manual") },
  ]
  return <div className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs">
    <div className="border-b bg-muted px-4 py-3"><h2 className="text-sm font-medium">Source tree</h2><p className="mt-1 text-xs text-muted-foreground">Grouped by origin. These are evidence links, not folders on your server.</p></div>
    <div className="divide-y">{groups.map(group => <details key={group.name} open className="group/source">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 text-sm font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"><ChevronRight className="size-4 transition-transform group-open/source:rotate-90" /><group.icon className="size-4 text-muted-foreground" />{group.name}<span className="ml-auto text-xs tabular-nums text-muted-foreground">{group.items.length} records</span></summary>
      {group.items.length ? <div className="space-y-1 px-4 pb-4 pl-8">{[...new Set(group.items.map(memory => memory.origin === "manual" ? memory.category : memory.source.split("#")[0]))].map(source => <details key={source} open className="group/folder border-l pl-4">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"><ChevronRight className="size-3.5 shrink-0 transition-transform group-open/folder:rotate-90" /><Folder className="size-4 shrink-0 text-muted-foreground" /><span className="break-all">{source}</span></summary>
        {group.items.filter(memory => (memory.origin === "manual" ? memory.category : memory.source.split("#")[0]) === source).map(memory => <button key={memory.id} type="button" onClick={() => onOpen(memory)} className="flex w-full items-start gap-3 rounded-md px-4 py-3 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"><FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span className="min-w-0"><span className="block text-sm font-medium">{memoryTitle(memory)}</span><span className="mt-1 block text-xs text-muted-foreground">{memory.category} · {memory.confidence} confidence</span></span></button>)}
      </details>)}</div> : <p className="px-12 pb-4 text-xs text-muted-foreground">No records in this view.</p>}
    </details>)}</div>
  </div>
}
