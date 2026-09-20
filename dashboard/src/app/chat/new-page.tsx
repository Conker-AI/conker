import { useEffect, useState } from "react"
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom"
import { BaseLayout } from "@/components/layouts/base-layout"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { conkerClient } from "@/lib/api"
import { useConker, useConkerStore } from "@/lib/api/store"

export default function NewChatPage() {
  const [params] = useSearchParams()
  const agents = useConker(data => data.agents)
  const agentId = params.get("agent") || agents.find(agent => !agent.archivedAt && agent.kind === "companion")?.id || agents.find(agent => !agent.archivedAt)?.id
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    if (!agentId) return
    void (async () => {
      try {
        const session = await conkerClient.createConversation(agentId)
        await useConkerStore.getState().load()
        if (cancelled) return
        const prompt = (location.state as { prompt?: unknown } | null)?.prompt
        const store = useConkerStore.getState()
        if (typeof prompt === "string" && prompt.trim()) {
          const current = store.drafts[session.id] || ""
          const next = current ? `${current}\n\n${prompt.trim()}` : prompt.trim()
          if (next.length <= 4000) store.setDraft(session.id, next)
        }
        navigate(`/chat/${session.id}`, { replace: true })
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not start a chat.") }
    })()
    return () => { cancelled = true }
  }, [agentId, location.state, navigate])

  return <BaseLayout variant="conversation"><div className="flex flex-1 flex-col justify-end gap-4 px-4 pb-4 sm:px-6 lg:px-8">
    {error || !agentId ? <div role="alert" className="space-y-3 py-6"><p>{error || "No agents are available yet."}</p><Button asChild variant="outline"><Link to="/agents">Choose an agent</Link></Button></div> : <><p role="status" className="text-sm text-muted-foreground">Opening your chat…</p><Skeleton className="h-28 w-full rounded-xl" /></>}
  </div></BaseLayout>
}
