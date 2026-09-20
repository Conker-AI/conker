import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Brain, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConfirmationDialog, FormActions, OverlayBody, TaskDialogContent } from "@/components/design-system"
import { ReferenceSection } from "@/components/reference-section"
import { conkerClient } from "@/lib/api"
import { useConker, useConkerStore } from "@/lib/api/store"
import { activeConversationMessages } from "@/lib/conversation-continuity"
import { useConversationWorkspace } from "@/lib/conversation-workspace"
import { contextPolicyForMessages, createContextPolicy, MESSAGE_CONTEXT_POLICIES, normalizeContextPolicy, planContext, type ContextPolicy, type MessageContextPolicy } from "@/lib/api/context-policy"
import type { Session } from "@/lib/api/models"

const labels: Record<MessageContextPolicy, string> = { "keep-exact": "Keep exact", "allow-summary": "Allow summary", retrieve: "Retrieve when needed", exclude: "Exclude" }
const note = "text-xs leading-5 text-muted-foreground"

function ContextSettings({ sessionId, initial, onClose }: { sessionId: string; initial: ContextPolicy; onClose: () => void }) {
  const [value, setValue] = useState(initial)
  const [error, setError] = useState("")
  const [discarding, setDiscarding] = useState(false)
  const { pending, mutate } = useConkerStore()
  const dirty = JSON.stringify(value) !== JSON.stringify(initial)
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])
  const close = () => { if (!pending) { if (dirty) setDiscarding(true); else onClose() } }
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const current = useConkerStore.getState().data?.conversations[sessionId]?.contextPolicy
    let contextPolicy: ContextPolicy
    try { contextPolicy = normalizeContextPolicy({ ...value, messagePolicies: current?.messagePolicies || value.messagePolicies }) }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Check the context settings."); return }
    setError("")
    const saved = await mutate(() => conkerClient.updateConversation(sessionId, { contextPolicy }), "Context saved in preview. Queued messages may need review.")
    if (saved) onClose()
    else setError(useConkerStore.getState().error || "Could not save context.")
  }
  return <><Dialog open onOpenChange={open => { if (!open) close() }}><TaskDialogContent title="Conversation context" description="Owner-set preview estimates. The model catalogue has no verified context limits. Changes reset on reload." size="wide" showCloseButton={!pending} onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => { event.preventDefault(); close() }}>
    <form onSubmit={event => void submit(event)} className="flex min-h-0 flex-col"><OverlayBody><fieldset disabled={pending} className="space-y-5">
      <div className="space-y-2"><Label htmlFor="context-instructions">Session instructions</Label><Textarea id="context-instructions" rows={5} maxLength={16000} value={value.sessionInstructions} onChange={event => setValue({ ...value, sessionInstructions: event.target.value })} /><p className={note}>Kept separate from compressible history. Applies to future replies; earlier response snapshots remain unchanged.</p></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="context-window">Preview context window</Label><Input id="context-window" type="number" min={2} step={1} required value={Number.isNaN(value.budget.contextWindowTokens) ? "" : value.budget.contextWindowTokens} onChange={event => setValue({ ...value, budget: { ...value.budget, contextWindowTokens: event.target.valueAsNumber } })} /><p className={note}>Tokens, including reserved output.</p></div><div className="space-y-2"><Label htmlFor="context-reserve">Output reserve</Label><Input id="context-reserve" type="number" min={1} step={1} required value={Number.isNaN(value.budget.outputReserveTokens) ? "" : value.budget.outputReserveTokens} onChange={event => setValue({ ...value, budget: { ...value.budget, outputReserveTokens: event.target.valueAsNumber } })} /><p className={note}>Required space for the response.</p></div></div>
      <div className="space-y-2"><Label htmlFor="context-other">Other input estimate</Label><Input id="context-other" type="number" min={0} step={1} required value={Number.isNaN(value.budget.otherInputTokens) ? "" : value.budget.otherInputTokens} onChange={event => setValue({ ...value, budget: { ...value.budget, otherInputTokens: event.target.valueAsNumber } })} /><p className={note}>Tokens for system prompts, tool schemas and input not listed in this inspector. These are not metered automatically.</p></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </fieldset></OverlayBody><FormActions inset><Button type="button" variant="outline" disabled={pending} onClick={close}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save preview context"}</Button></FormActions></form>
  </TaskDialogContent></Dialog><ConfirmationDialog open={discarding} onOpenChange={setDiscarding} title="Discard context changes?" description="Your unsaved instructions and budget edits will be discarded." actionLabel="Discard changes" pending={false} onConfirm={onClose} /></>
}

export function ConversationContext({ session }: { session: Session }) {
  const data = useConker(data => data)
  const conversation = data.conversations[session.id]
  const { pending, mutate } = useConkerStore()
  const streaming = useConversationWorkspace(state => state.streams[session.id])
  const [editing, setEditing] = useState<ContextPolicy | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const agent = data.agents.find(agent => agent.id === (session.agentId || conversation.initialAgentId))
  const branch = activeConversationMessages(conversation.messages)
  const configured = !!conversation.contextPolicy
  // Illustrative defaults until explicitly saved; never claim these are model capabilities.
  const policy = conversation.contextPolicy || createContextPolicy(8192, 1024)
  const plan = planContext({ policy: contextPolicyForMessages(policy, branch), messages: branch, privacy: conversation.privacy, inheritedInstructions: agent?.configuration?.instructions ? [{ scope: "agent", sourceId: agent.id, text: agent.configuration.instructions }] : [] })
  const busy = pending || !!streaming || !!session.archived
  const setPolicy = async (id: string, next: MessageContextPolicy) => {
    setError(""); setNotice("")
    const success = await mutate(() => conkerClient.updateConversation(session.id, { contextPolicy: { ...policy, messagePolicies: { ...policy.messagePolicies, [id]: next } } }))
    if (!success) setError(useConkerStore.getState().error || "Could not update the policy.")
    else setNotice("Policy saved in preview. Queued messages may need review.")
  }
  return <>
    <ReferenceSection title="Context" icon={<Brain />}>
      <div className="flex flex-wrap items-center justify-between gap-2"><Badge variant="outline">{configured ? "Preview policy" : "Not configured"}</Badge><Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(structuredClone(policy))}><Settings />{configured ? "Edit context" : "Configure context"}</Button></div>
      <p className={note}>{configured ? "Controls apply to future simulated replies. No model is connected." : "Illustrative 8,192-token window and 1,024-token output reserve. Configure your preview limits to enable policy controls."}</p>
      <dl className="space-y-2 text-xs"><div className="flex justify-between gap-3"><dt>Estimated input</dt><dd className="tabular-nums">{plan.budget.estimatedInputTokens.toLocaleString()}</dd></div><div className="flex justify-between gap-3"><dt>Output reserve</dt><dd className="tabular-nums">{plan.budget.outputReserveTokens.toLocaleString()}</dd></div><div className="flex justify-between gap-3"><dt>Exact pins</dt><dd className="tabular-nums">{plan.budget.exactPinTokens.toLocaleString()}</dd></div><div className="flex justify-between gap-3"><dt>Input + reserve / window</dt><dd className="tabular-nums">{plan.budget.estimatedTotalTokens.toLocaleString()} / {plan.budget.contextWindowTokens.toLocaleString()}</dd></div></dl>
      <p className={note}>{plan.estimateLabel} Unsent composer text is not included.</p>
      {plan.conflicts.length > 0 && <div role="status" className="space-y-2 rounded-md border bg-muted p-3"><p className="text-xs font-medium">{plan.budget.overflowTokens ? `${plan.budget.overflowTokens.toLocaleString()} estimated tokens over budget` : "Context needs review"}</p>{plan.conflicts.map((conflict, index) => <p key={`${conflict.code}-${conflict.messageId || index}`} className={note}>{conflict.detail}</p>)}<p className={note}>Change the policy or budget, or explicitly fork from a message. No history is compressed automatically.</p></div>}
      <details><summary className="cursor-pointer text-xs font-medium">Effective instruction scopes</summary><div className="mt-3 space-y-3"><p className={note}>Order: global → agent → project → session. Global and project instruction sources are not configured here.</p>{plan.instructions.length ? plan.instructions.map(layer => <div key={layer.scope}><p className="text-xs font-medium">{layer.scope === "agent" ? `${agent?.name || "Agent"} instructions` : "Session instructions"}</p><p className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-xs leading-5">{layer.text}</p></div>) : <p className={note}>No authored agent or session instructions.</p>}</div></details>
      <p className={note}>Memory reads/writes: {plan.helpers.memoryReadsAllowed ? "allowed by privacy setting" : "excluded"}. Harness helpers: {plan.helpers.harnessAllowed ? "allowed by privacy setting" : "excluded"}. Helper providers are not connected or authorized by these settings.</p>
      <details><summary className="cursor-pointer text-xs font-medium">Message policies · {branch.length}</summary><div className="mt-3 space-y-3">{branch.map(message => {
        const row = plan.messages.find(row => row.messageId === message.id)!
        return <div key={message.id} className="space-y-2 border-t pt-3"><Link className="block rounded-sm text-xs hover:underline focus-visible:outline-2 focus-visible:outline-ring" to={`${session.id === data.companionSessionId ? "/companion" : `/chat/${session.id}`}#${encodeURIComponent(message.id)}`}>{message.role === "user" ? "You" : message.agentName || session.agent}{message.pinned ? " · Pinned exact" : ""}<span className="mt-1 line-clamp-2 text-muted-foreground">{message.redacted ? "Redacted message" : message.text || "Empty message"}</span></Link><Select value={row.effectivePolicy} onValueChange={next => void setPolicy(message.id, next as MessageContextPolicy)} disabled={busy || !configured || message.redacted}><SelectTrigger aria-label={`Context policy for ${message.role === "user" ? "your" : "assistant"} message ${branch.indexOf(message) + 1}`} className="w-full"><SelectValue /></SelectTrigger><SelectContent>{MESSAGE_CONTEXT_POLICIES.map(option => <SelectItem key={option} value={option} disabled={!!message.pinned && option !== "keep-exact"}>{labels[option]}</SelectItem>)}</SelectContent></Select>{message.pinned && <p className={note}>Unpin from the message menu before relaxing this policy.</p>}</div>
      })}{!branch.length && <p className={note}>Send a message to configure its policy.</p>}</div></details>
      <p className={note}>Allow summary currently keeps the full text. Retrieve remains unresolved until a real selection is available. Exclude preserves the transcript while omitting it from future context.</p>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}{notice && <p role="status" className={note}>{notice}</p>}
    </ReferenceSection>
    {editing && <ContextSettings sessionId={session.id} initial={editing} onClose={() => setEditing(null)} />}
  </>
}
