import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { BaseLayout } from "@/components/layouts/base-layout"
import { FormActions } from "@/components/design-system"
import { ReferenceSection } from "@/components/reference-section"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { conkerClient } from "@/lib/api"
import { useConker, useConkerStore } from "@/lib/api/store"
import { agentInput } from "@/lib/api/agent-config"
import type { Agent, AgentInput } from "@/lib/api/models"
import { AgentFields } from "./agent-fields"

// Like the Tools editor, retain local drafts across route/back navigation.
const drafts = new Map<string, AgentInput>()

function AgentEditor({ agent }: { agent: Agent }) {
  const [value, setValue] = useState(() => drafts.get(agent.id) || agentInput(agent))
  const [feedback, setFeedback] = useState("")
  const [error, setError] = useState("")
  const { mutate, pending } = useConkerStore()
  const tools = useConker(data => data.tools)
  const memories = useConker(data => data.memories)
  const dirty = JSON.stringify(value) !== JSON.stringify(agentInput(agent))
  useEffect(() => {
    if (dirty) drafts.set(agent.id, value)
    else drafts.delete(agent.id)
  }, [agent.id, dirty, value])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])
  const select = (ids: string[], id: string, checked: boolean) => checked ? [...ids, id] : ids.filter(value => value !== id)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setFeedback(""); setError("")
    if (!dirty || pending || agent.archivedAt) return
    const saved = await mutate(() => conkerClient.saveAgent(agent.id, value))
    if (saved) {
      const updated = useConkerStore.getState().data?.agents.find(item => item.id === agent.id)
      if (updated) setValue(agentInput(updated))
      drafts.delete(agent.id)
      setFeedback("Saved in preview. Changes reset on reload.")
    }
    else setError(useConkerStore.getState().error || "Could not save this agent.")
  }
  return <form onSubmit={event => void submit(event)} className="space-y-6">
    <fieldset disabled={pending || !!agent.archivedAt} className="grid min-w-0 items-start gap-6 lg:grid-cols-12">
      <div className="min-w-0 lg:col-span-7"><ReferenceSection title="Identity and instructions"><AgentFields value={value} onChange={setValue} /></ReferenceSection></div>
      <div className="min-w-0 space-y-6 lg:col-span-5">
      <ReferenceSection title="Tool allowlist"><p className="text-sm text-muted-foreground">Published, agent-visible tools this agent may request. Publish tools in Tools first. Selections name tools and do not pin versions. This configuration grants no execution authority; approvals and limits remain separate.</p><div className="space-y-3">{tools.map(tool => <div key={tool.id} className="flex items-start gap-3"><Checkbox id={`agent-tool-${tool.id}`} checked={value.toolIds.includes(tool.id)} onCheckedChange={checked => setValue({ ...value, toolIds: select(value.toolIds, tool.id, checked === true) })} /><Label htmlFor={`agent-tool-${tool.id}`} className="block"><span>{tool.name} · v{tool.publishedVersion}</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{tool.purpose}</span></Label></div>)}</div>{value.toolIds.filter(id => !tools.some(tool => tool.id === id)).map(id => <div key={id} className="flex items-start gap-3"><Checkbox id={`missing-tool-${id}`} checked onCheckedChange={() => setValue({ ...value, toolIds: value.toolIds.filter(toolId => toolId !== id) })} /><Label htmlFor={`missing-tool-${id}`}>Unavailable published tool · {id}. Remove this selection to save.</Label></div>)}{!tools.length && <p>No published, agent-visible tools available.</p>}</ReferenceSection>
      <ReferenceSection title="Memory context"><div className="space-y-2"><Label htmlFor="agent-memory">Memory scope</Label><Select value={value.memory.scope} onValueChange={scope => setValue({ ...value, memory: { scope: scope as AgentInput["memory"]["scope"], memoryIds: scope === "selected" ? value.memory.memoryIds : [] } })}><SelectTrigger id="agent-memory"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No memory</SelectItem><SelectItem value="conversation">Conversation context</SelectItem><SelectItem value="selected">Selected memories</SelectItem></SelectContent></Select></div>{value.memory.scope === "selected" && <div className="space-y-3">{memories.map(memory => <div key={memory.id} className="flex items-start gap-3"><Checkbox id={`agent-memory-${memory.id}`} checked={value.memory.memoryIds.includes(memory.id)} onCheckedChange={checked => setValue({ ...value, memory: { ...value.memory, memoryIds: select(value.memory.memoryIds, memory.id, checked === true) } })} /><Label htmlFor={`agent-memory-${memory.id}`} className="block leading-5">{memory.title || memory.text}</Label></div>)}{value.memory.memoryIds.filter(id => !memories.some(memory => memory.id === id)).map(id => <div key={id} className="flex items-start gap-3"><Checkbox id={`missing-memory-${id}`} checked onCheckedChange={() => setValue({ ...value, memory: { ...value.memory, memoryIds: value.memory.memoryIds.filter(memoryId => memoryId !== id) } })} /><Label htmlFor={`missing-memory-${id}`} className="block leading-5">Unavailable memory record · {id}. Remove this selection to save.</Label></div>)}{!memories.length && <p>No memory records available. Choose another scope.</p>}</div>}<p className="text-xs text-muted-foreground">References for new conversations only. Memory retrieval and writes are not connected.</p></ReferenceSection>
      </div>
    </fieldset>
    <div className="sticky bottom-0 z-10 space-y-3 bg-background py-3">
    {agent.archivedAt && <p role="status" className="text-sm text-muted-foreground">Restore this agent from Agents before editing it.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{feedback && <p role="status" className="text-sm">{feedback}</p>}
    <FormActions description={<span role="status">{dirty ? "Unsaved changes · draft kept when navigating away" : "Preview configuration · no live grants"}</span>}><Button asChild variant="outline"><Link to="/agents">Back to agents</Link></Button><Button type="button" variant="outline" disabled={!dirty || pending || !!agent.archivedAt} onClick={() => { drafts.delete(agent.id); setValue(agentInput(agent)); setError(""); setFeedback("") }}>Reset changes</Button><Button type="submit" disabled={!dirty || pending || !!agent.archivedAt}>{pending ? "Saving…" : "Save preview"}</Button></FormActions>
    </div>
  </form>
}

export default function EditAgentPage() {
  const { id } = useParams()
  const agent = useConker(data => data.agents.find(agent => agent.id === id))
  return <BaseLayout title={agent ? `Edit ${agent.name}` : "Agent not found"} description="Specialist configuration. Changes stay in this preview and reset on reload.">
    {!agent ? <p>This agent is unavailable. <Link className="underline" to="/agents">Back to agents</Link></p> : agent.kind === "companion" ? <p>Your Companion is configured in <Link className="underline" to="/settings/companion">Character Studio</Link>.</p> : <AgentEditor key={agent.id} agent={agent} />}
  </BaseLayout>
}
