import { useState } from "react"
import { ArrowRight, Check } from "lucide-react"
import { AgentIdentityPortrait } from "@/components/design-system"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { useConker, useConkerStore } from "@/lib/api/store"
import { conkerClient } from "@/lib/api"
import { useConversationWorkspace } from "@/lib/conversation-workspace"
import type { Session } from "@/lib/api/models"

export function ConversationAgent({ session }: { session: Session }) {
  const data = useConker(data => data)
  const pending = useConkerStore(state => state.pending)
  const streaming = useConversationWorkspace(state => state.streams[session.id])
  const busy = pending || !!streaming
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(session.agentId || "")
  const [error, setError] = useState("")
  const hasMessages = data.conversations[session.id].messages.length > 0
  const current = data.agents.find(agent => agent.id === session.agentId || agent.name === session.agent)
  const displayName = current?.kind === "companion" ? data.profile.name : session.agent

  return <Dialog open={open} onOpenChange={value => { setOpen(value); if (value) { setSelected(current?.id || ""); setError("") } }}>
    <DialogTrigger asChild><Button variant="ghost" size="icon" className="size-8 shrink-0 p-0" aria-label={`Choose agent: ${displayName}`} title={`Chatting with ${displayName} · Choose agent`}><AgentIdentityPortrait name={session.agent} /></Button></DialogTrigger>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>{hasMessages ? "Hand off this chat" : "Who would you like to talk to?"}</DialogTitle><DialogDescription>{hasMessages ? "The next agent receives this chat’s history. Earlier replies keep their original author, and your Incognito settings stay in place." : "Choose an agent for this topic. You can hand the conversation over later."}</DialogDescription></DialogHeader>
      <RadioGroup value={selected} onValueChange={setSelected} disabled={busy} aria-label="Conversation agent" className="gap-2">
        {data.agents.map(agent => <Label key={agent.id} htmlFor={`agent-${agent.id}`} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-muted">
          <AgentIdentityPortrait name={agent.name} /><span className="min-w-0 flex-1"><span className="block text-sm">{agent.kind === "companion" ? data.profile.name : agent.name}</span><span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">{agent.kind === "companion" ? "Ideas, questions, research, and everyday help" : agent.role}</span></span><RadioGroupItem id={`agent-${agent.id}`} value={agent.id} />
        </Label>)}
      </RadioGroup>
      {hasMessages && <p className="text-xs leading-5 text-muted-foreground">The model choice stays separate. Existing execution grants are cleared; no live tools are connected in this preview.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={busy || !selected} onClick={async () => {
        const saved = await useConkerStore.getState().mutate(() => conkerClient.handoffConversation(session.id, selected))
        if (saved) setOpen(false)
        else setError(useConkerStore.getState().error || "Could not change agent. Try again.")
      }}>{selected === current?.id ? <><Check />Done</> : hasMessages ? <>Hand off<ArrowRight /></> : <>Choose agent<Check /></>}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
