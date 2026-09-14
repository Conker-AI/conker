import { useState, type ReactNode } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Archive, ChevronDown, ChevronRight, GitFork, Pencil, Pin, PanelRight, Settings, Trash2 } from "lucide-react"
import { ConversationIncognito } from "@/components/conversation-incognito"
import { CompanionPortrait } from "@/components/companion-portrait"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useConker, useConkerStore } from "@/lib/api/store"
import { conkerClient } from "@/lib/api"
import { getAvailableModels } from "@/lib/api/model-catalogue"
import { useConversationWorkspace } from "@/lib/conversation-workspace"
import type { Session } from "@/lib/api/models"

export function ConversationAppbar({ session, search }: { session: Session; search: ReactNode }) {
  const data = useConker(data => data)
  const conversation = data.conversations[session.id]
  const pending = useConkerStore(state => state.pending)
  const mutate = useConkerStore(state => state.mutate)
  const rail = useConversationWorkspace(state => state.rails[session.id])
  const streaming = useConversationWorkspace(state => state.streams[session.id])
  const { openRail, closeRail } = useConversationWorkspace()
  const [dialog, setDialog] = useState<"rename" | "route" | "delete" | null>(null)
  const [title, setTitle] = useState(session.title)
  const [modelId, setModelId] = useState(conversation?.modelId || "default")
  const navigate = useNavigate()
  const companion = data.agents.find(agent => agent.name === session.agent)?.kind === "companion"
  const busy = pending || !!streaming
  const update = (patch: Parameters<typeof conkerClient.updateConversation>[1]) => mutate(() => conkerClient.updateConversation(session.id, patch))
  const main = session.id === data.companionSessionId
  if (!conversation) return null

  return <>
    <nav aria-label="Conversation path" data-home="conversation" className="flex min-w-0 flex-1 items-center gap-1.5">
      <Link to="/chat" aria-label="Chats" title="All conversations" className="shrink-0 rounded-lg focus-visible:outline-2 focus-visible:outline-ring"><CompanionPortrait profile={companion ? data.profile : undefined} name={session.agent} tone="graphite" className="size-7 rounded-lg" /></Link>
      <Link to="/chat" className="hidden min-h-8 shrink-0 items-center px-1 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:inline-flex">Chats</Link>
      <ChevronRight className="hidden size-3 shrink-0 text-muted-foreground sm:block" aria-hidden="true" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 min-w-0 shrink justify-start gap-1 px-1.5 has-[>svg]:px-1.5" aria-label={`Conversation menu: ${session.title}`} title={session.title}>
            <span className="min-w-0 truncate text-sm font-medium">{session.title}</span><ChevronDown className="size-3 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem disabled={busy} onSelect={() => { setTitle(session.title); setDialog("rename") }}><Pencil />Rename</DropdownMenuItem>
          <DropdownMenuItem disabled={busy} onSelect={() => { setModelId(conversation.modelId || "default"); setDialog("route") }}><Settings />Model / route</DropdownMenuItem>
          <DropdownMenuItem disabled={busy} onSelect={() => void update({ pinned: !session.pinned })}><Pin />{session.pinned ? "Unpin conversation" : "Pin conversation"}</DropdownMenuItem>
          <DropdownMenuItem disabled={busy} onSelect={() => void update({ archived: !session.archived })}><Archive />{session.archived ? "Restore conversation" : "Archive conversation"}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => openRail(session.id, "forks")}><GitFork />View forks</DropdownMenuItem>
          <DropdownMenuItem asChild><Link to="/settings/companion"><Settings />Edit companion</Link></DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={busy} variant="destructive" onSelect={() => setDialog("delete")}><Trash2 />{main ? "Clear conversation" : "Delete conversation"}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
    {search}
    <ConversationIncognito privacy={conversation.privacy} busy={busy} onChange={privacy => { void update({ privacy }) }} />
    <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label={rail?.open ? "Hide conversation details" : "Show conversation details"} aria-expanded={!!rail?.open} aria-controls="conversation-reference" title="Conversation details" onClick={() => rail?.open ? closeRail(session.id) : openRail(session.id)}><PanelRight /></Button>
    <Dialog open={dialog !== null} onOpenChange={open => { if (!open) setDialog(null) }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{dialog === "rename" ? "Rename conversation" : dialog === "route" ? "Conversation model / route" : main ? "Clear this conversation?" : "Delete this conversation?"}</DialogTitle>
          <DialogDescription>{dialog === "route" ? "Choose the default for this conversation. Tools can override it for the next turn." : dialog === "delete" ? "This removes messages from this local preview. It cannot be undone. No external service is contacted." : "Give this conversation a name you can find later."}</DialogDescription>
        </DialogHeader>
        {dialog === "rename" && <form className="space-y-4" onSubmit={async event => { event.preventDefault(); if (await update({ title })) setDialog(null) }}>
          <Label htmlFor="conversation-title">Title</Label><Input id="conversation-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={120} required />
          <DialogFooter><Button type="button" variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button disabled={busy || !title.trim()}>Save name</Button></DialogFooter>
        </form>}
        {dialog === "route" && <div className="space-y-4">
          <Label htmlFor="conversation-route">Default model</Label>
          <Select value={modelId} onValueChange={setModelId}><SelectTrigger id="conversation-route" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="default">Use workspace default</SelectItem>{getAvailableModels(data.modelsConfiguration).map(model => <SelectItem key={model.id} value={model.id}>{model.name} · {data.modelsConfiguration.providers.find(provider => provider.id === model.providerId)?.name}</SelectItem>)}</SelectContent></Select>
          <Link to="/settings?tab=models" className="text-sm underline underline-offset-4">Manage Models / Providers</Link>
          <DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button disabled={busy} onClick={async () => { if (await update({ modelId: modelId === "default" ? null : modelId })) setDialog(null) }}>Save route</Button></DialogFooter>
        </div>}
        {dialog === "delete" && <DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button variant="destructive" disabled={busy} onClick={async () => {
          if (await mutate(() => conkerClient.deleteConversation(session.id))) { setDialog(null); useConkerStore.getState().setDraft(session.id, ""); useConversationWorkspace.getState().reset(session.id); if (!main) navigate("/chat") }
        }}>{main ? "Clear conversation" : "Delete conversation"}</Button></DialogFooter>}
      </DialogContent>
    </Dialog>
  </>
}
