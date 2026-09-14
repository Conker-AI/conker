import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { ArrowUpRight, Brain, ChartNoAxesColumn, File, FileSearch, GitFork, Info, MessageSquare, Newspaper, Pin, Shield, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ReferenceSection } from "@/components/reference-section"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { useConker } from "@/lib/api/store"
import { useConversationWorkspace, type RailView } from "@/lib/conversation-workspace"
import type { Session } from "@/lib/api/models"

const views = {
  overview: { title: "Conversation info", icon: Info },
  source: { title: "Sources", icon: FileSearch },
  explain: { title: "Message info", icon: Info },
  usage: { title: "Usage & cost", icon: ChartNoAxesColumn },
  privacy: { title: "Memory & permissions", icon: Shield },
  forks: { title: "Sessions & forks", icon: GitFork },
  daily: { title: "Daily context", icon: Newspaper },
} satisfies Record<RailView, { title: string; icon: typeof Info }>

function useWideRail() {
  const [wide, setWide] = useState(() => window.matchMedia("(min-width: 1280px)").matches)
  useEffect(() => { const query = window.matchMedia("(min-width: 1280px)"); const update = () => setWide(query.matches); query.addEventListener("change", update); return () => query.removeEventListener("change", update) }, [])
  return wide
}

function DetailList({ items }: { items: [string, ReactNode][] }) {
  return <dl className="divide-y divide-border/60">{items.map(([label, value]) => <div key={label} className="flex items-start justify-between gap-4 py-2 first:pt-0 last:pb-0"><dt className="shrink-0 text-xs text-muted-foreground">{label}</dt><dd className="min-w-0 text-right text-xs font-medium tabular-nums">{value}</dd></div>)}</dl>
}

const referenceLink = "flex min-h-10 items-center justify-between gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
const note = "text-xs leading-5 text-muted-foreground"
const excerpt = "max-h-60 overflow-auto whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]"

function RailContent({ session, children }: { session: Session; children?: ReactNode }) {
  const data = useConker(data => data)
  const rail = useConversationWorkspace(state => state.rails[session.id])
  const { closeRail, openRail } = useConversationWorkspace()
  const conversation = data.conversations[session.id]
  const selected = conversation.messages.find(message => message.id === rail?.messageId)
  const sourceRecord = data.threads[session.id]?.sources?.find(source => source.id === rail?.messageId)
  const model = data.modelsConfiguration.models.find(model => model.id === (conversation.modelId || data.modelsConfiguration.defaultModelId))
  const provider = data.modelsConfiguration.providers.find(provider => provider.id === model?.providerId)
  const sessionLink = (id: string) => id === data.companionSessionId ? "/companion" : `/chat/${id}`
  const close = () => closeRail(session.id)

  switch (rail?.view) {
    case "source": {
      const original = selected?.source && conversation.messages.find(message => message.id === selected.source?.id)
      return <>
        <ReferenceSection title={selected?.source?.label || "Message source"} icon={<FileSearch />}>
          {selected?.redacted ? <p className={note}>This message was redacted. Its source is no longer available.</p> : original ? <>
            <p className={note}>{original.role === "user" ? "Your request" : original.agentName || session.agent} · {new Date(original.createdAt).toLocaleString()}</p>
            {original.redacted ? <p className={note}>The original message was redacted.</p> : <blockquote className={excerpt}>{original.text}</blockquote>}
          </> : sourceRecord ? <><p className={note}>{sourceRecord.time} · Recorded source</p><blockquote className={excerpt}>{sourceRecord.text}</blockquote></> : selected?.role === "user" ? <><p className={note}>Written by you in this conversation.</p><blockquote className={excerpt}>{selected.text}</blockquote></> : <p className={note}>No external sources are recorded for this response.</p>}
          {!selected?.redacted && selected?.source?.href?.startsWith("/") && <Link className={referenceLink} to={selected.source.href} onClick={close}>Go to original message<ArrowUpRight className="size-4 shrink-0" /></Link>}
        </ReferenceSection>
        {selected?.role === "assistant" && <p className={note}>This response comes from the local preview. No provider or web source was contacted.</p>}
      </>
    }
    case "explain": {
      const messageModel = data.modelsConfiguration.models.find(model => model.id === selected?.modelId)
      return selected ? <>
        <ReferenceSection title="Message details" icon={<MessageSquare />}>
          <DetailList items={[
            ["Author", selected.role === "user" ? "You" : selected.agentName || session.agent],
            ["Written", new Date(selected.createdAt).toLocaleString()],
            ["State", selected.redacted ? "Redacted" : selected.edited ? "Edited" : selected.status === "stopped" ? "Stopped" : "Complete"],
            ...(selected.role === "assistant" ? [["Model", messageModel?.name || "Not recorded"] as [string, ReactNode]] : []),
          ]} />
        </ReferenceSection>
        <ReferenceSection title="About this message" icon={<Info />}>
          <p className={note}>{selected.role === "user" ? "Written by you. It has not been sent to an AI provider in this preview." : selected.scenario ? "A recorded sample response with example activity. No AI provider was contacted." : "A simulated preview response. No AI provider was contacted."}</p>
          {selected.pinned && <Badge variant="outline">Pinned</Badge>}
          {!selected.redacted && <Button variant="outline" size="sm" onClick={() => openRail(session.id, "source", selected.id)}><FileSearch />View sources</Button>}
        </ReferenceSection>
      </> : <p className={note}>This message is no longer available.</p>
    }
    case "usage":
      return <>
        <ReferenceSection title="Conversation route" icon={<MessageSquare />}>
          <p className="font-medium">{model?.name || "No default model"}</p>
          <p className={note}>{provider?.name || "No provider selected"} · Not connected</p>
          <p className={note}>{conversation.modelId ? "Selected for this conversation." : "Using the workspace default."} The composer can override the next turn.</p>
          <Link className={referenceLink} to="/settings?tab=models" onClick={close}>Models & providers<ArrowUpRight className="size-4 shrink-0" /></Link>
        </ReferenceSection>
        <ReferenceSection title="Conversation usage" icon={<ChartNoAxesColumn />}>
          <DetailList items={[["Input tokens", conversation.usage.inputTokens.toLocaleString()], ["Output tokens", conversation.usage.outputTokens.toLocaleString()], ["Cost", conversation.usage.costUsd === null ? "Not metered" : `$${conversation.usage.costUsd.toFixed(4)}`]]} />
          <p className={note}>Sample totals for this conversation. These are not provider billing records.</p>
        </ReferenceSection>
      </>
    case "privacy":
      return <>
        <ReferenceSection title="Memory" icon={<Brain />}>
          <Badge variant="outline">{conversation.privacy.memoryDisabled ? "Excluded" : "Allowed"}</Badge>
          <p className={note}>{conversation.privacy.memoryDisabled ? "Memory reads and writes are excluded for this conversation in the preview." : `Read scope: ${conversation.memory.scope}. Memory writes are not connected.`}</p>
          {!conversation.privacy.memoryDisabled && conversation.memory.sources.length > 0 && <ul className="divide-y divide-border/60">{conversation.memory.sources.map(source => <li key={source.id} className="py-2 text-xs">{source.label}</li>)}</ul>}
        </ReferenceSection>
        <ReferenceSection title="Harness session" icon={<MessageSquare />}>
          <Badge variant="outline">{conversation.privacy.harnessDisabled ? "Excluded" : "Allowed"}</Badge>
          <p className={note}>{conversation.privacy.harnessDisabled ? "This conversation excludes the Pi harness session." : "This conversation allows a Pi harness session."} Server privacy controls are not connected.</p>
        </ReferenceSection>
        <ReferenceSection title="Permissions & autonomy" icon={<Shield />}>
          <p className="font-medium">{conversation.autonomy.level === "ask" ? "Ask before actions" : "Observe only"}</p>
          <p className={note}>{conversation.autonomy.detail}</p>
          <Badge variant="outline">No live grants</Badge>
          {conversation.grants.map(grant => <p key={grant.id} className="text-xs">{grant.label}<span className={`block ${note}`}>{grant.scope} · {grant.status}</span></p>)}
        </ReferenceSection>
      </>
    case "forks": {
      const forks = data.sessions.filter(item => data.conversations[item.id]?.parentSessionId === session.id)
      const parent = data.sessions.find(item => item.id === conversation.parentSessionId)
      const other = data.sessions.filter(item => item.agentId === session.agentId && item.id !== session.id && !item.archived && !item.isDraft && item.id !== parent?.id && !forks.some(fork => fork.id === item.id))
      return <>
        <ReferenceSection title="Conversation tree" icon={<GitFork />}>
          {conversation.parentSessionId && (parent ? <Link className={referenceLink} to={sessionLink(parent.id)} onClick={close}><span><span className={`block ${note}`}>Parent conversation</span>{parent.title}</span><ArrowUpRight className="size-4 shrink-0" /></Link> : <p className={note}>The parent conversation was deleted.</p>)}
          <div className="rounded-md bg-surface-inset px-3 py-2"><p className="text-xs font-medium text-primary">Current conversation</p><p className="mt-1 font-medium">{session.title}</p></div>
          {forks.length ? <ul className="ml-3 border-l pl-2">{forks.map(fork => <li key={fork.id}><Link className={referenceLink} to={sessionLink(fork.id)} onClick={close}>{fork.title}<ArrowUpRight className="size-4 shrink-0" /></Link></li>)}</ul> : <p className={note}>No forks yet. Use a message’s ⋯ menu to fork from that point.</p>}
        </ReferenceSection>
        <ReferenceSection title={`Other chats with ${session.agent}`} icon={<MessageSquare />}>
          {other.length ? <ul className="divide-y divide-border/60">{other.map(item => <li key={item.id}><Link className={referenceLink} to={sessionLink(item.id)} onClick={close}>{item.title}<ArrowUpRight className="size-4 shrink-0" /></Link></li>)}</ul> : <p className={note}>No other conversations with this agent.</p>}
        </ReferenceSection>
      </>
    }
    case "daily":
      return children || <p className={note}>Daily context is available in Companion.</p>
    default: {
      const pins = conversation.messages.filter(message => message.pinned)
      return <>
        <ReferenceSection title="This conversation" icon={<Info />}>
          <DetailList items={[["Agent", session.agent], ["Messages", conversation.messages.length], ["State", session.archived ? "Archived" : session.isDraft ? "New chat" : "Active"]]} />
          <Button variant="outline" size="sm" onClick={() => openRail(session.id, "privacy")}><Shield />Memory & permissions</Button>
        </ReferenceSection>
        <ReferenceSection title={`Files · ${conversation.files.length}`} icon={<File />}>
          {conversation.files.length ? <ul className="divide-y divide-border/60">{conversation.files.map(file => <li key={file.id}>{file.source?.startsWith("/") ? <Link className={referenceLink} to={file.source} onClick={close}>{file.name}<ArrowUpRight className="size-4 shrink-0" /></Link> : <p className="py-2">{file.name}</p>}</li>)}</ul> : <p className={note}>No files in this conversation.</p>}
          <p className={note}>References only. Uploads are not connected.</p>
        </ReferenceSection>
        <ReferenceSection title={`Pinned messages · ${pins.length}`} icon={<Pin />}>
          {pins.length ? <ul className="divide-y divide-border/60">{pins.map(message => <li key={message.id}><Link className={referenceLink} to={`${sessionLink(session.id)}#${encodeURIComponent(message.id)}`} onClick={close}><span className="line-clamp-3">{message.redacted ? "Redacted message" : message.text}</span><ArrowUpRight className="size-4 shrink-0" /></Link></li>)}</ul> : <p className={note}>Pin a message from its ⋯ menu to keep it here.</p>}
        </ReferenceSection>
      </>
    }
  }
}

export function ConversationRail({ session, children }: { session: Session; children?: ReactNode }) {
  const rail = useConversationWorkspace(state => state.rails[session.id])
  const close = useConversationWorkspace(state => state.closeRail)
  const selected = useConker(data => data.conversations[session.id].messages.find(message => message.id === rail?.messageId))
  const wide = useWideRail()
  const heading = useRef<HTMLHeadingElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const { title, icon: Icon } = views[rail?.view || "overview"]
  const context = selected ? `${selected.role === "user" ? "You" : selected.agentName || session.agent} · ${new Date(selected.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : session.title

  const restoreFocus = useCallback(() => {
    const target = opener.current?.isConnected ? opener.current : document.querySelector<HTMLElement>('[data-home="conversation"] button[aria-haspopup="menu"]')
    target?.focus()
  }, [])

  useEffect(() => {
    if (!rail?.open) return
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }, [rail?.open])

  useEffect(() => {
    if (!rail?.open) return
    const frame = requestAnimationFrame(() => { content.current?.scrollTo(0, 0); if (wide) heading.current?.focus() })
    return () => cancelAnimationFrame(frame)
  }, [rail?.open, rail?.view, rail?.messageId, wide])

  useEffect(() => {
    if (!wide || !rail?.open) return
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) { close(session.id); restoreFocus() }
    }
    document.addEventListener("keydown", escape)
    return () => document.removeEventListener("keydown", escape)
  }, [wide, rail?.open, close, session.id, restoreFocus])

  const body = <div ref={content} className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4"><RailContent session={session}>{children}</RailContent></div>
  if (wide) return rail?.open ? <aside id="conversation-reference" data-home="reference" data-view={rail.view} aria-label={title} className="conversation-contrast flex w-88 shrink-0 flex-col overflow-hidden border-l bg-surface-chrome">
    <div className="flex shrink-0 items-start gap-3 border-b bg-card p-4">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1"><h2 ref={heading} tabIndex={-1} className="text-sm font-semibold outline-none">{title}</h2><p className={`mt-1 truncate ${note}`} title={context}>{context}</p>{selected && <p className={`mt-2 line-clamp-2 ${note}`}>{selected.redacted ? "Redacted message" : selected.text}</p>}</div>
      <Button variant="ghost" size="icon" className="-mt-1 size-8 shrink-0" onClick={() => { close(session.id); restoreFocus() }} aria-label="Close details"><X /></Button>
    </div>
    {body}
  </aside> : null
  return <Sheet open={!!rail?.open} onOpenChange={open => { if (!open) close(session.id) }}><SheetContent id="conversation-reference" data-home="reference" data-view={rail?.view} onCloseAutoFocus={event => { event.preventDefault(); restoreFocus() }} className="conversation-contrast w-full gap-0 overflow-hidden bg-surface-chrome sm:max-w-sm"><SheetHeader className="shrink-0 border-b bg-card pr-12"><SheetTitle className="flex items-center gap-2 text-sm"><Icon className="size-4 text-muted-foreground" />{title}</SheetTitle><SheetDescription className="truncate text-xs" title={context}>{context}</SheetDescription>{selected && <p className={`line-clamp-2 ${note}`}>{selected.redacted ? "Redacted message" : selected.text}</p>}</SheetHeader>{body}</SheetContent></Sheet>
}
