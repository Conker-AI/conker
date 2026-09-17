import { useRef, useState, type ReactNode } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Archive, ChevronDown, ChevronRight, GitFork, Info, Newspaper, Pencil, Pin, Settings, SquarePen, Trash2 } from "lucide-react"
import { ConversationAgent } from "@/components/conversation-agent"
import { ConversationIncognito } from "@/components/conversation-incognito"
import { CompanionPortrait } from "@/components/companion-portrait"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog } from "@/components/ui/dialog"
import { TaskDialogContent, OverlayBody, FormActions, ConfirmationDialog } from "@/components/design-system"
import { DropdownMenu, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
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
  const error = useConkerStore(state => state.error)
  const mutate = useConkerStore(state => state.mutate)
  const streaming = useConversationWorkspace(state => state.streams[session.id])
  const openRail = useConversationWorkspace(state => state.openRail)
  const focusReference = useRef(false)
  const menuTrigger = useRef<HTMLButtonElement>(null)
  const [dialog, setDialog] = useState<"rename" | "route" | "delete" | null>(null)
  const [title, setTitle] = useState(session.title)
  const [modelId, setModelId] = useState(conversation?.modelId || "default")
  const navigate = useNavigate()
  const busy = pending || !!streaming
  const update = (patch: Parameters<typeof conkerClient.updateConversation>[1]) => mutate(() => conkerClient.updateConversation(session.id, patch))
  const main = session.id === data.companionSessionId
  const restoreFocus = (event: Event) => { event.preventDefault(); menuTrigger.current?.focus() }
  if (!conversation) return null

  return <>
    <nav aria-label={main ? "Companion path" : "Conversation path"} data-home="conversation" className="flex min-w-0 flex-1 items-center gap-1.5">
      {main ? <CompanionPortrait profile={data.profile} name={data.profile.name} className="size-7 rounded-lg" /> : <ConversationAgent session={session} />}
      {!main && <><Link to="/chat" className="hidden min-h-8 shrink-0 items-center px-1 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:inline-flex">Chats</Link><ChevronRight className="hidden size-3 shrink-0 text-muted-foreground sm:block" aria-hidden="true" /></>}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={menuTrigger} variant="ghost" className="h-8 min-w-0 shrink justify-start gap-1 px-1.5 has-[>svg]:px-1.5" aria-label={`Conversation menu: ${session.title}`} title={session.title}>
            <span className="min-w-0 truncate text-sm font-medium">{main ? data.profile.name : session.title}</span><ChevronDown className="size-3 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56" onCloseAutoFocus={event => { if (focusReference.current) { event.preventDefault(); focusReference.current = false } }}>
          {!main && <DropdownMenuItem disabled={busy} onSelect={() => { setTitle(session.title); setDialog("rename") }}><Pencil />Rename</DropdownMenuItem>}
          <DropdownMenuLabel>Response mode · preview</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={conversation.presentationMode || "focus"} onValueChange={presentationMode => void update({ presentationMode: presentationMode as "focus" | "character" })}>
            <DropdownMenuRadioItem value="focus" disabled={busy}>Focus</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="character" disabled={busy}>Character</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={busy} onSelect={() => { setModelId(conversation.modelId || "default"); setDialog("route") }}><Settings />Model / route</DropdownMenuItem>
          {!main && <><DropdownMenuItem disabled={busy} onSelect={() => void update({ pinned: !session.pinned })}><Pin />{session.pinned ? "Unpin conversation" : "Pin conversation"}</DropdownMenuItem><DropdownMenuItem disabled={busy} onSelect={() => void update({ archived: !session.archived })}><Archive />{session.archived ? "Restore conversation" : "Archive conversation"}</DropdownMenuItem></>}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => { focusReference.current = true; openRail(session.id, "overview") }}><Info />Conversation info</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => { focusReference.current = true; openRail(session.id, "forks") }}><GitFork />Sessions & forks</DropdownMenuItem>
          {main && <DropdownMenuItem onSelect={() => { focusReference.current = true; openRail(session.id, "daily") }}><Newspaper />Daily context</DropdownMenuItem>}
          <DropdownMenuItem asChild><Link to="/settings/companion"><Settings />Edit companion</Link></DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={busy} variant="destructive" onSelect={() => setDialog("delete")}><Trash2 />{main ? "Clear conversation" : "Delete conversation"}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
    <Button variant="ghost" size="icon" className="size-8 shrink-0" asChild><Link to="/chat/new" aria-label="New chat" title="New chat"><SquarePen /></Link></Button>
    {search}
    <ConversationIncognito privacy={conversation.privacy} busy={busy} onChange={privacy => { void update({ privacy }) }} onInspect={() => openRail(session.id, "privacy")} />
    <Dialog open={dialog === "rename" || dialog === "route"} onOpenChange={open => { if (!open && !pending) setDialog(null) }}>
      <TaskDialogContent title={dialog === "rename" ? "Rename conversation" : "Conversation model / route"}
        description={dialog === "route" ? "Choose the default for this conversation. Tools can override it for the next turn." : "Give this conversation a name you can find later."}
        onCloseAutoFocus={restoreFocus} onInteractOutside={event => event.preventDefault()} showCloseButton={!pending}>
        {dialog === "rename" && <form className="flex min-h-0 flex-col" onSubmit={async event => { event.preventDefault(); if (await update({ title })) setDialog(null) }}>
          <OverlayBody><div className="space-y-2"><Label htmlFor="conversation-title">Title</Label><Input id="conversation-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={120} required /></div></OverlayBody>
          <FormActions inset><Button type="button" variant="outline" disabled={pending} onClick={() => setDialog(null)}>Cancel</Button><Button disabled={busy || !title.trim()}>Save name</Button></FormActions>
        </form>}
        {dialog === "route" && <><OverlayBody>
          <div className="space-y-2"><Label htmlFor="conversation-route">Default model</Label>
          <Select value={modelId} onValueChange={setModelId}><SelectTrigger id="conversation-route" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="default">Use workspace default</SelectItem>{getAvailableModels(data.modelsConfiguration).map(model => <SelectItem key={model.id} value={model.id}>{model.name} · {data.modelsConfiguration.providers.find(provider => provider.id === model.providerId)?.name}</SelectItem>)}</SelectContent></Select>
          </div><Link to="/settings?tab=models" className="text-sm underline underline-offset-4">Manage Models / Providers</Link>
        </OverlayBody><FormActions inset><Button variant="outline" disabled={pending} onClick={() => setDialog(null)}>Cancel</Button><Button disabled={busy} onClick={async () => { if (await update({ modelId: modelId === "default" ? null : modelId })) setDialog(null) }}>Save route</Button></FormActions></>}
        {error && <p role="alert" className="px-5 pb-4 text-sm text-destructive">{error}</p>}
      </TaskDialogContent>
    </Dialog>
    <ConfirmationDialog open={dialog === "delete"} onOpenChange={open => { if (!open) setDialog(null) }}
      title={main ? "Clear this conversation?" : "Delete this conversation?"} description="This removes messages from this local preview. It cannot be undone. No external service is contacted."
      actionLabel={main ? "Clear conversation" : "Delete conversation"} pending={busy} error={error} onCloseAutoFocus={restoreFocus} onConfirm={async () => {
        if (await mutate(() => conkerClient.deleteConversation(session.id))) { setDialog(null); useConkerStore.getState().setDraft(session.id, ""); useConversationWorkspace.getState().reset(session.id); if (!main) navigate("/chat") }
      }}><p className="text-sm font-medium">{session.title}</p></ConfirmationDialog>
  </>
}
