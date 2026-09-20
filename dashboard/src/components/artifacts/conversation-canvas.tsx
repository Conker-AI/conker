import { lazy, Suspense, useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { ExternalLink, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { conkerClient } from "@/lib/api"
import { useConker } from "@/lib/api/store"
import { useArtifactWorkspace } from "@/lib/artifact-workspace"

const ArtifactCanvas = lazy(() => import("./artifact-canvas").then(module => ({ default: module.ArtifactCanvas })))

export function ConversationCanvas({ sessionId }: { sessionId: string }) {
  const selection = useArtifactWorkspace(state => state.selections[sessionId])
  const selectedId = selection?.artifactId
  const close = useArtifactWorkspace(state => state.close)
  const open = useArtifactWorkspace(state => state.open)
  const artifact = useConker(data => data.artifacts.find(item => item.id === selection?.artifactId))
  const [wide, setWide] = useState(() => window.matchMedia("(min-width: 1280px)").matches)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { const query = window.matchMedia("(min-width: 1280px)"); const change = () => setWide(query.matches); query.addEventListener("change", change); return () => query.removeEventListener("change", change) }, [])
  useEffect(() => {
    if (!selectedId || !wide) return
    const frame = requestAnimationFrame(() => heading.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [selectedId, wide])
  useEffect(() => {
    if (!selection || !wide) return
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented && !document.querySelector('[role="dialog"][data-state="open"]')) { close(sessionId); document.getElementById("message-composer")?.focus() } }
    document.addEventListener("keydown", escape)
    return () => document.removeEventListener("keydown", escape)
  }, [selection, wide, close, sessionId])
  if (!selection) return null
  const title = artifact?.title ?? "Artifact unavailable"
  const fullPage = <Button asChild size="icon" variant="ghost"><Link to={`/artifacts/${encodeURIComponent(selection.artifactId)}${selection.version ? `?version=${selection.version}` : ""}`} aria-label="Open artifact full page"><ExternalLink /></Link></Button>
  const controls = <>{fullPage}{wide && <Button variant="ghost" size="icon" aria-label="Close canvas" onClick={() => { close(sessionId); document.getElementById("message-composer")?.focus() }}><X /></Button>}</>
  const body = artifact ? <Suspense fallback={<p role="status" className="p-4 text-sm text-muted-foreground">Opening canvas…</p>}><ArtifactCanvas artifact={artifact} client={conkerClient.artifacts} initialVersion={selection.version} onVersionChange={version => open(sessionId, artifact.id, version)} headingRef={heading} headerActions={controls} className={wide ? undefined : "[&>header]:pr-12"} /></Suspense> : <div className="p-4"><div className="flex items-center justify-between"><h2 ref={heading} tabIndex={-1} className="text-sm font-semibold">{title}</h2>{controls}</div><p className="mt-3 text-sm text-muted-foreground">This artifact is no longer available. Its original conversation has not been changed.</p></div>
  if (wide) return <aside aria-label="Artifact workspace" className="flex min-h-0 min-w-0 w-1/2 flex-col overflow-hidden border-l bg-background">{body}</aside>
  return <Sheet open onOpenChange={open => { if (!open) close(sessionId) }}><SheetContent className="w-full gap-0 overflow-hidden sm:max-w-2xl" onCloseAutoFocus={event => { event.preventDefault(); document.getElementById("message-composer")?.focus() }}><SheetTitle className="sr-only">{title}</SheetTitle><SheetDescription className="sr-only">Artifact canvas · changes stay in this preview.</SheetDescription>{body}</SheetContent></Sheet>
}
