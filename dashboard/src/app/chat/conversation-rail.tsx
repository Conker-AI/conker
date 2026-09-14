import { useEffect, useRef, useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { File, GitFork, Pin, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { useConker } from "@/lib/api/store"
import { useConversationWorkspace } from "@/lib/conversation-workspace"
import type { Session } from "@/lib/api/models"

function useWideRail() {
  const [wide, setWide] = useState(() => window.matchMedia("(min-width: 1280px)").matches)
  useEffect(() => { const query = window.matchMedia("(min-width: 1280px)"); const update = () => setWide(query.matches); query.addEventListener("change", update); return () => query.removeEventListener("change", update) }, [])
  return wide
}

function RailContent({ session, children }: { session: Session; children?: ReactNode }) {
  const data = useConker(data => data)
  const rail = useConversationWorkspace(state => state.rails[session.id])
  const closeRail = useConversationWorkspace(state => state.closeRail)
  const forksSection = useRef<HTMLElement>(null)
  const conversation = data.conversations[session.id]
  const selected = conversation.messages.find(message => message.id === rail?.messageId)
  const sourceRecord = data.threads[session.id]?.sources?.find(source => source.id === rail?.messageId)
  const model = data.modelsConfiguration.models.find(model => model.id === (conversation.modelId || data.modelsConfiguration.defaultModelId))
  const sessionLink = (id: string) => id === data.companionSessionId ? "/companion" : `/chat/${id}`
  const forks = data.sessions.filter(item => data.conversations[item.id]?.parentSessionId === session.id)
  const parent = data.sessions.find(item => item.id === conversation.parentSessionId)
  const other = data.sessions.filter(item => item.agent === session.agent && item.id !== session.id && !item.archived)
  const close = () => closeRail(session.id)
  useEffect(() => {
    if (rail?.view !== "forks") return
    const frame = requestAnimationFrame(() => { forksSection.current?.scrollIntoView({ block: "start" }); forksSection.current?.focus({ preventScroll: true }) })
    return () => cancelAnimationFrame(frame)
  }, [rail?.view])
  return <div className="space-y-5 px-4 pb-6 text-sm">
    {(rail?.view === "source" || rail?.view === "explain") && <section className="space-y-2 rounded-lg border p-3" aria-label={rail.view === "source" ? "Message source" : "Message explanation"}>
      <h3 className="font-medium">{rail.view === "source" ? "Message source" : "About this message"}</h3>
      {selected ? <>
        <p className="text-xs leading-5 text-muted-foreground">{selected.role === "user" ? "A user-authored message" : selected.scenario ? "A recorded fixture response" : "A simulated preview response"}{selected.edited ? ", edited locally" : ""}. {selected.redacted ? "Its content has been redacted." : "No provider was contacted by this preview."}</p>
        {!selected.redacted && <blockquote className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs leading-5 [overflow-wrap:anywhere]">{selected.text}</blockquote>}
        <p className="text-xs text-muted-foreground">{selected.source?.label || "Local preview"}</p>
        {selected.source?.href?.startsWith("/") && <Link className="text-xs underline underline-offset-4" to={selected.source.href} onClick={close}>Go to original message</Link>}
      </> : sourceRecord ? <><p className="text-xs text-muted-foreground">{sourceRecord.time} · Recorded source</p><blockquote className="text-xs leading-5">{sourceRecord.text}</blockquote></> : <p className="text-xs text-muted-foreground">Choose a message’s Open source or Explain action.</p>}
    </section>}
    <section className="space-y-2" aria-label="Model and usage"><h3 className="font-medium">Model & cost</h3><p>{model?.name || "No default route"}</p><p className="text-xs text-muted-foreground">{model?.providerId || "Configure a provider in Settings"} · Not connected</p><dl className="grid grid-cols-2 gap-2 text-xs"><dt className="text-muted-foreground">Input / output</dt><dd className="text-right tabular-nums">{conversation.usage.inputTokens} / {conversation.usage.outputTokens}</dd><dt className="text-muted-foreground">Cost</dt><dd className="text-right">{conversation.usage.costUsd === null ? "Not metered" : `$${conversation.usage.costUsd.toFixed(4)}`}</dd></dl><p className="text-xs text-muted-foreground">Sample usage; no provider billing.</p></section>
    <section className="space-y-2 border-t pt-4" aria-label="Conversation autonomy"><h3 className="font-medium">Grants & autonomy</h3><Badge variant="outline">No live grants</Badge><p className="text-xs leading-5 text-muted-foreground">{conversation.autonomy.detail}</p>{conversation.grants.map(grant => <p key={grant.id} className="text-xs leading-5">{grant.label}<span className="block text-muted-foreground">{grant.scope} · {grant.status}</span></p>)}</section>
    <section ref={forksSection} tabIndex={-1} className="scroll-mt-16 space-y-2 border-t pt-4 outline-none" aria-label="Session and fork tree"><h3 className="flex items-center gap-2 font-medium"><GitFork className="size-4" />Sessions & forks</h3>
      {conversation.parentSessionId && (parent ? <Link className="block rounded-md border px-3 py-2 text-xs hover:bg-muted" to={sessionLink(parent.id)} onClick={close}>Parent: {parent.title}</Link> : <p className="text-xs text-muted-foreground">Parent conversation was deleted.</p>)}
      <p className="rounded-md bg-muted/40 px-3 py-2 text-xs font-medium">{session.title} · Current</p>
      {forks.length ? forks.map(fork => <Link key={fork.id} className="ml-3 block border-l pl-3 py-2 text-xs hover:text-primary" to={sessionLink(fork.id)} onClick={close}>{fork.title}</Link>) : <p className="text-xs text-muted-foreground">No forks yet. Fork from a message’s menu.</p>}
      {other.length > 0 && <><h4 className="pt-2 text-xs font-medium text-muted-foreground">Other sessions with {session.agent}</h4>{other.map(item => <Link key={item.id} className="block rounded-md px-2 py-2 text-xs hover:bg-muted" to={sessionLink(item.id)} onClick={close}>{item.title}</Link>)}</>}
    </section>
    <section className="space-y-2 border-t pt-4" aria-label="Memory scope"><h3 className="font-medium">Memory & incognito</h3><div className="flex flex-wrap gap-2"><Badge variant="outline">{conversation.privacy.memoryDisabled ? "No memory" : "Memory allowed"}</Badge><Badge variant="outline">{conversation.privacy.harnessDisabled ? "No harness" : "Harness allowed"}</Badge></div><p className="text-xs leading-5 text-muted-foreground">{conversation.privacy.memoryDisabled ? "Memory reads and writes are excluded for this conversation in the preview." : `Read scope: ${conversation.memory.scope}. Memory writes are not connected.`}</p><p className="text-xs leading-5 text-muted-foreground">{conversation.privacy.harnessDisabled ? "Pi harness session excluded." : "Pi harness session allowed."} Server privacy controls are not connected.</p>{!conversation.privacy.memoryDisabled && conversation.memory.sources.map(source => <p key={source.id} className="text-xs">{source.label}</p>)}</section>
    <section className="space-y-2 border-t pt-4" aria-label="Conversation files"><h3 className="flex items-center gap-2 font-medium"><File className="size-4" />Files</h3>{conversation.files.length ? conversation.files.map(file => <p key={file.id} className="text-xs leading-5">{file.name}<span className="block text-muted-foreground">Reference only · not uploaded</span></p>) : <p className="text-xs text-muted-foreground">No files attached. Uploads are not connected.</p>}</section>
    {conversation.messages.some(message => message.pinned) && <section className="space-y-2 border-t pt-4" aria-label="Pinned messages"><h3 className="flex items-center gap-2 font-medium"><Pin className="size-4" />Pinned messages</h3>{conversation.messages.filter(message => message.pinned).map(message => <Link key={message.id} to={`${sessionLink(session.id)}#${encodeURIComponent(message.id)}`} onClick={close} className="block truncate text-xs underline underline-offset-4">{message.text}</Link>)}</section>}
    {children && <div className="border-t pt-4">{children}</div>}
  </div>
}

export function ConversationRail({ session, children }: { session: Session; children?: ReactNode }) {
  const rail = useConversationWorkspace(state => state.rails[session.id])
  const close = useConversationWorkspace(state => state.closeRail)
  const wide = useWideRail()
  if (wide) return rail?.open ? <aside id="conversation-reference" data-home="reference" aria-label="Conversation details" className="w-80 shrink-0 overflow-y-auto border-l">
    <div className="sticky top-0 z-10 mb-4 flex h-14 items-center justify-between border-b bg-background px-4"><h2 className="text-sm font-semibold">Conversation details</h2><Button variant="ghost" size="icon" className="size-8" onClick={() => close(session.id)} aria-label="Close conversation details"><X /></Button></div>
    <RailContent session={session}>{children}</RailContent>
  </aside> : null
  return <Sheet open={!!rail?.open} onOpenChange={open => { if (!open) close(session.id) }}><SheetContent id="conversation-reference" data-home="reference" className="w-full gap-0 overflow-y-auto sm:max-w-sm"><SheetHeader className="mb-4 border-b pr-12"><SheetTitle className="text-sm">Conversation details</SheetTitle><SheetDescription className="text-xs">Reference for this conversation · fixture preview</SheetDescription></SheetHeader><RailContent session={session}>{children}</RailContent></SheetContent></Sheet>
}
