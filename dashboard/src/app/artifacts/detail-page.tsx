import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { BaseLayout } from "@/components/layouts/base-layout"
import { ArtifactCanvas } from "@/components/artifacts/artifact-canvas"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/design-system"
import type { ArtifactScreenProps } from "./format"
import { useArtifactWorkspace } from "@/lib/artifact-workspace"
import { useConversationWorkspace } from "@/lib/conversation-workspace"

export default function ArtifactDetailPage({ artifacts, client }: ArtifactScreenProps) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const artifact = artifacts.find(item => item.id === id)
  const rawVersion = params.get("version")
  const version = rawVersion && /^[1-9]\d*$/.test(rawVersion) && Number.isSafeInteger(Number(rawVersion)) ? Number(rawVersion) : undefined
  return <BaseLayout variant="canvas"><div className="sr-only"><PageHeader title={artifact?.title ?? "Artifact unavailable"} /></div>
    <div className="flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-2"><Button asChild variant="ghost" size="sm"><Link to="/artifacts">Back to artifacts</Link></Button>{artifact?.source && <Button variant="outline" size="sm" onClick={() => { const sessionId = artifact.source!.sessionId; useConversationWorkspace.getState().closeRail(sessionId); useArtifactWorkspace.getState().open(sessionId, artifact.id, version); navigate(`/chat/${encodeURIComponent(sessionId)}`) }}>Open alongside source chat</Button>}{rawVersion && version === undefined && <p role="status" className="text-xs text-muted-foreground">Invalid version link. Showing the current version.</p>}</div>
    {artifact ? <ArtifactCanvas artifact={artifact} client={client} initialVersion={version} onVersionChange={version => { const next = new URLSearchParams(params); if (version === undefined) next.delete("version"); else next.set("version", String(version)); setParams(next, { replace: true }) }} /> : <div className="p-5"><p role="status">This artifact is unavailable in the current preview.</p></div>}
  </BaseLayout>
}
