import { useState } from "react"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from "@/components/ui/command"
import type { WorkspaceNode } from "@/lib/memory-layout"

export function MemoryFinder({ nodes, onSelect }: { nodes: WorkspaceNode[]; onSelect: (node: WorkspaceNode) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const terms = query.toLocaleLowerCase().trim().split(/\s+/)
  const results = nodes.filter(node => terms.every(term => `${node.label} ${node.kind}`.toLocaleLowerCase().includes(term)))
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button variant="outline" aria-label="Find a memory or connection"><Search /><span className="hidden sm:inline">Find a point…</span></Button></PopoverTrigger>
    <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-0"><Command shouldFilter={false}><CommandInput placeholder="Search memories, topics, folders…" value={query} onValueChange={setQuery} /><CommandList><CommandEmpty>No matching points.</CommandEmpty>{results.slice(0,40).map(node => <CommandItem key={node.id} value={node.id} onSelect={() => { onSelect(node); setOpen(false) }}><span className="min-w-0 flex-1 truncate">{node.label}</span><span className="text-xs text-muted-foreground">{node.kind}</span></CommandItem>)}</CommandList><p className="border-t px-3 py-2 text-xs text-muted-foreground">{results.length > 40 ? `Showing 40 of ${results.length}. Keep typing to narrow results.` : `${results.length} searchable points`}</p></Command></PopoverContent>
  </Popover>
}
