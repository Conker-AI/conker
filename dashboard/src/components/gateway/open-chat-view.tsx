import type { DraftController, DraftEntry } from './draft-controller'
import { DraftSaveStatus } from './draft-status'
import type { DraftValue } from '@/lib/gateway/drafts'
import { ThinkingStatus } from './thinking-status'
import { TurnUsageDisclosure } from './turn-usage-disclosure'
import type { useThinkingCancellation } from './use-thinking-cancellation'
import type { useRuntimeObservation } from './use-runtime-observation'
import { ChatTranscript } from '@/components/chat/transcript'
import { ChatComposer, conversationColumn } from '@/components/chat/composer'
import { BackToChats, ConversationHistory } from '@/components/chat/history'
import { GatewayHeader } from './header'
import type { Action, ChatContract, RecoveryAction } from '@/lib/chat/contract'
import type { GatewayControlClient } from '@/lib/gateway/control'
import { GatewayModelPicker } from './model-picker'
import { GatewaySkillPicker } from './skill-picker'
import { ThinkControl } from './think-control'
import { ModelRoutingEvidence, TurnFailureGuidance } from './model-routing-evidence'
import { memoryRetrievalSummary } from './plain-status'
import { useState, type Dispatch, type RefObject, type SetStateAction, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Brain, Layers, MoreHorizontal, RefreshCw, Sparkles, Wrench } from 'lucide-react'
import { SubmissionRecovery } from './submission-recovery'
import type { TaskDispatchIntent } from './task-dispatch-state'
import { PendingSubmissions } from './pending-submissions'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { GatewayRuntimeClient, RuntimePendingSubmission, RuntimeSession, RuntimeSessionDetail } from '@/lib/gateway/runtime'
import { hasActiveRuntimeTurn, type GatewayRuntimeWorkspaceState, type UncertainTurn } from './runtime-state'
import type { GatewaySourcePrivacyState } from './source-privacy'
import { GatewayCallLauncher } from './call-workspace'
import { GatewaySessionAgentControl } from './session-agent-control'
import { NewChatVoiceControl } from './new-chat-voice-control'
import { ModeControl, TemplateInput, TemplatePicker } from './composer-parts'
import { ChatTitle } from './chat-title'
import { nameChat } from './chat-title-actions'
import { ChatOutputControl } from './chat-output-control'
import { ChatContextControl } from './chat-context-control'
import { ConversationViewMenuItems } from './conversation-views'
import { useConnectedShell } from './workspace-shell-context'
import { useIsMobile } from '@/hooks/use-mobile'
import { AnswerToolsContext } from '@/lib/chat/answer-tools-context'

/** Open conversation: history transcript, turn details, pending submissions, recovery and the reply composer. */
export function OpenChatView({ visible, knownForgotten, current, safeSessions, selected, control, pending, historyLoading, attempt, chat, observation, focusedMessageId,
  thinkingCancellation, draftController, replyComposer, turnDetailsOpen, setTurnDetailsOpen, operation, detailPending, sendPending, resumeTurn, client, privacy,
  harnessBySession, active, draftEntries, forgottenIds, draft, recover, recoveryActions, reviewed, setReviewed, safeTaskIntent, workspace, selectedValue, activeAgentId,
  activeAgentName, setSessionAgents, modeHints, headerExtra, setDictating, dictating, templateActive, inspectSubmission, setSkillChoices, setThinkChoice }: {
  visible: boolean; knownForgotten: boolean; current: RuntimeSessionDetail | null; safeSessions: RuntimeSession[]; selected: string; control?: GatewayControlClient
  pending: boolean; historyLoading: boolean; attempt: UncertainTurn | undefined; chat: ChatContract; observation: ReturnType<typeof useRuntimeObservation>; focusedMessageId: string | null
  thinkingCancellation: ReturnType<typeof useThinkingCancellation>; draftController: DraftController; replyComposer: RefObject<HTMLTextAreaElement | null>
  turnDetailsOpen: boolean; setTurnDetailsOpen: (open: boolean) => void; operation: 'create' | 'send' | 'resume' | null; detailPending: boolean; sendPending: boolean; resumeTurn: (turnId: string) => Promise<void>
  client: GatewayRuntimeClient; privacy: GatewaySourcePrivacyState; harnessBySession?: Record<string, boolean>; active: boolean; draftEntries: Record<string, DraftEntry>
  forgottenIds: string[]; draft: string; recover: (name: RecoveryAction) => void; recoveryActions: Record<RecoveryAction, Action> | null; reviewed: boolean; setReviewed: Dispatch<SetStateAction<boolean>>
  safeTaskIntent: TaskDispatchIntent | null; workspace: GatewayRuntimeWorkspaceState; selectedValue: DraftValue; activeAgentId: string; activeAgentName: string
  setSessionAgents: Dispatch<SetStateAction<Record<string, string>>>; modeHints: RefObject<Record<string, { isAnalysis?: true }>>; headerExtra?: ReactNode; setDictating: Dispatch<SetStateAction<boolean>>
  dictating: boolean; templateActive: boolean; inspectSubmission: (saved: RuntimePendingSubmission) => Promise<void>; setSkillChoices: (id: string, skillIds: string[]) => void; setThinkChoice: (id: string, think: boolean) => void
}) {
  const phone = useIsMobile()
  const shell = useConnectedShell()
  const [contextOpen, setContextOpen] = useState(false)
  const refreshChat = () => { if (chat.checkHistory.availability === 'enabled') void chat.checkHistory.run() }
  return <>
    {visible && <GatewayHeader context={<><BackToChats /><ChatTitle control={knownForgotten ? undefined : control} sessionId={current && !knownForgotten ? current.id : null} disabled={pending || historyLoading || Boolean(attempt)} onChanged={refreshChat} title={knownForgotten ? 'Forgotten chat' : current?.title || safeSessions.find(item => item.id === selected)?.title || (selected ? 'Chat' : 'New chat')} /></>}>
      {control && !knownForgotten && <GatewayCallLauncher compact client={control.calls} conversationId={selected} disabled={pending || historyLoading || Boolean(attempt)} />}
      {control && current && !knownForgotten && <ChatContextControl key={`context:${current.id}`} {...(phone ? { open: contextOpen, onOpenChange: setContextOpen } : {})} control={control} sessionId={current.id} lastMessageId={current.messages.at(-1)?.id ?? null} disabled={pending || historyLoading || Boolean(attempt)} onChanged={refreshChat} />}
      <DropdownMenu><DropdownMenuTrigger render={<Button size="icon" variant="ghost" aria-label="Chat options" />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end">
        <DropdownMenuItem disabled={chat.checkHistory.availability !== 'enabled'} onClick={() => { if (chat.checkHistory.availability === 'enabled') void chat.checkHistory.run() }}><RefreshCw />Refresh this chat</DropdownMenuItem>
        <DropdownMenuItem render={<Link to="/memory" />}><Brain />Open memory</DropdownMenuItem>
        <DropdownMenuItem render={<Link to="/tools" />}><Wrench />Open tools</DropdownMenuItem>
        {phone && control && current && !knownForgotten && <DropdownMenuItem disabled={pending || historyLoading || Boolean(attempt)} onClick={() => void nameChat(control, current.id, refreshChat)}><Sparkles />Name this chat</DropdownMenuItem>}
        {phone && control && current && !knownForgotten && <DropdownMenuItem onClick={() => setContextOpen(true)}><Layers />Edit context</DropdownMenuItem>}
        {phone && shell?.showViews && <ConversationViewMenuItems onToggle={shell.toggleView} />}
      </DropdownMenuContent></DropdownMenu>
    </GatewayHeader>}
    {observation.error && current && <div className={`${conversationColumn} shrink-0 py-2`}><p role="status" className="text-sm text-muted-foreground">{'Chat updates are delayed. Showing the last saved history while checking again.'} <Button variant="link" size="sm" className="h-auto p-0" onClick={observation.refresh}>Check now</Button></p></div>}
    <ConversationHistory key={selected} sessionId={selected} focusedMessageId={focusedMessageId}>
      {knownForgotten && <p className="text-sm text-muted-foreground">This conversation was forgotten. Sending is disabled.</p>}{current && hasActiveRuntimeTurn(current) && !chat.outcomes?.length && <p role="status" className="text-sm text-muted-foreground">The server has an unfinished turn. Check history for its status before sending again.</p>}<AnswerToolsContext.Provider value={control && current && !knownForgotten && current.status === 'open' ? { answers: control.chatAnswers, reviews: control.chatReviews, context: control.chatContext, disabled: pending || historyLoading || Boolean(attempt), refresh: refreshChat } : null}><ChatTranscript chat={chat} /></AnswerToolsContext.Provider>
      {current && <ThinkingStatus messages={current.messages} rows={current.thinking ?? []} disabled={!active} cancellation={thinkingCancellation.state} onCancel={thinkingCancellation.cancel} onRefresh={thinkingCancellation.refresh} onDiscuss={result => { draftController.edit(current.id, { text: [draftController.current(current.id)?.value.text.trimEnd(), `Discuss these background findings and check their conclusions:\n\n${result}`].filter(Boolean).join('\n\n') }); replyComposer.current?.focus() }} />}
      {current && current.turns.length > 0 && <details className="text-xs text-muted-foreground" onToggle={event => { if (event.target === event.currentTarget) setTurnDetailsOpen(event.currentTarget.open) }}><summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ring">Details</summary><ul className="mt-3 space-y-3">{current.turns.map(turn => <li key={turn.id} className="space-y-1 text-xs text-muted-foreground"><p className="break-all"><span className="font-medium text-foreground">{turn.status.replaceAll('_', ' ')}</span> · {turn.id}</p>{(turn.provider || turn.model) && <p className="break-words">{[turn.provider, turn.model].filter(Boolean).join(' / ')}</p>}{turn.approvalRequestId && turn.status === 'awaiting_approval' && <Button variant="outline" size="sm" render={<Link to={`/inbox?request=${encodeURIComponent(turn.approvalRequestId)}`} />}>Review action</Button>}{['awaiting_approval', 'acted_no_reply'].includes(turn.status) && <Button variant="outline" size="sm" disabled={Boolean(operation) || detailPending} onClick={() => void resumeTurn(turn.id)}>{turn.status === 'acted_no_reply' ? 'Ask only for the reply' : 'Continue after approval'}</Button>}{!chat.outcomes?.some(outcome => outcome.id === turn.id) && <TurnFailureGuidance status={turn.status} detail={turn.detail} hasAction={Boolean(turn.action)} />}<ModelRoutingEvidence detail={turn.detail} /><TurnUsageDisclosure client={client} turnId={turn.id} sessionId={current.id} sourcePrivacy={privacy} active={visible && turnDetailsOpen} refreshKey={`${turn.status}:${turn.endedAt}:${current.thinking?.find(row => row.turnId === turn.id)?.status ?? ""}`} />{turn.memory.retrieval && <details><summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ring">{memoryRetrievalSummary(turn.memory.retrieval)}</summary><div className="space-y-1 py-2"><p>{turn.memory.retrieval.records} records supplied{turn.memory.retrieval.mode ? ` · ${turn.memory.retrieval.mode}` : ''}</p>{turn.memory.retrieval.reranking && <p>Relevance ranking: {turn.memory.retrieval.reranking.status.replaceAll('_', ' ')}{turn.memory.retrieval.reranking.model ? ` · ${turn.memory.retrieval.reranking.model}` : ''}</p>}{turn.memory.notices.map((notice, index) => <p key={index}>{notice}</p>)}</div></details>}{turn.action && <p>Action: {turn.action.state.replaceAll('_', ' ')}</p>}</li>)}</ul></details>}
    </ConversationHistory>
    <div className={`${conversationColumn} max-h-[calc(var(--app-height)*0.75)] shrink-0 space-y-3 overflow-y-auto pb-[max(1rem,var(--safe-bottom))] pt-2`}>
      {current && current.status !== 'forgotten' && <PendingSubmissions key={`${current.id}:${current.pendingSubmissions.map(item => item.updatedAt).join(',')}`} client={client} sessionId={current.id} initial={current.pendingSubmissions} truncated={current.pendingSubmissionsTruncated} disabled={sendPending || detailPending || !!attempt} onInspect={saved => void inspectSubmission(saved)} />}
      {attempt && (attempt.requestId ? <SubmissionRecovery attempt={attempt} pending={detailPending || sendPending} forgotten={forgottenIds.includes(selected) || !!attempt.requestedSessionId && forgottenIds.includes(attempt.requestedSessionId)} draftEmpty={!draft.length && !attempt.taskBinding} onRestore={() => recover('restoreDraft')} onCheck={() => recover('check')} onRetry={() => recover('retrySameRequest')} onRelease={() => recover('releaseUnstarted')} /> : <div className="space-y-3 rounded-lg border p-3"><p className="text-sm font-medium">{attempt.accepted ? 'Conker got your message; the reply isn’t saved yet' : 'Not sure your last message went through'}</p><p className="text-xs leading-5 text-muted-foreground">{attempt.accepted ? 'Sending is paused until the reply shows up, so nothing is done twice.' : 'Your text is kept. Sending is paused because the last message may still be running.'} Check the chat, and your chat list in case it continued in a new chat.</p><Button size="sm" variant="outline" disabled={chat.checkHistory.availability !== 'enabled'} onClick={() => { if (chat.checkHistory.availability === 'enabled') void chat.checkHistory.run() }}>Check the chat</Button>{attempt.checked && <><Label className="flex items-center gap-2 text-xs"><Checkbox checked={reviewed} onCheckedChange={value => setReviewed(value === true)} />I checked. Sending again might do the same work twice.</Label><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" className="h-auto min-h-(--control-height-sm) whitespace-normal text-left" disabled={recoveryActions?.acknowledgeFound.availability !== 'enabled'} onClick={() => recover('acknowledgeFound')}>It’s in the chat</Button><Button size="sm" variant="outline" className="h-auto min-h-(--control-height-sm) whitespace-normal text-left" disabled={recoveryActions?.acknowledgeUnknown.availability !== 'enabled'} onClick={() => recover('acknowledgeUnknown')}>Let me send again</Button></div></>}</div>)}
      {safeTaskIntent && !safeTaskIntent.open && <div className="flex flex-wrap items-center gap-2 text-xs"><span className="text-muted-foreground">Task request saved separately from your draft.</span><Button size="sm" variant="outline" disabled={!!operation} onClick={() => workspace.setState({ taskIntent: { ...safeTaskIntent, open: true } })}>Review task request</Button><Button size="sm" variant="ghost" disabled={!!operation} onClick={() => workspace.setState({ taskIntent: null })}>Discard task request</Button></div>}
      <ChatComposer key={selected} chat={chat} inputRef={replyComposer} dictating={dictating} input={templateActive ? <TemplateInput draftKey={selected} disabled={chat.setDraft.availability !== 'enabled'} onText={value => { if (chat.setDraft.availability === 'enabled') void chat.setDraft.run(value) }} onSubmit={() => { if (chat.send.availability === 'enabled') void chat.send.run() }} /> : undefined} controls={<>
        <ModeControl key={`mode:${selected}`} text={chat.draft} think={selectedValue.think} research={selectedValue.researchMode} thinkAvailable={activeAgentId === 'companion' && !harnessBySession?.[selected]} harnessDisabled={Boolean(harnessBySession?.[selected])} sessionId={selected} disabled={sendPending || detailPending || !active || Boolean(attempt) || current?.status !== 'open'} propose={client.proposeSettings} apply={values => draftController.edit(selected, values)} onHints={hints => {
          // eslint-disable-next-line react-hooks/immutability -- modeHints is a mutable ref owned by GatewayRuntimeWorkspace
          modeHints.current[selected] = hints
        }} />{control && current?.status === 'open' && <GatewaySessionAgentControl compact key={`agent:${selected}`} client={control} sessionId={selected} activeAgentId={activeAgentId} activeAgentName={activeAgentName} disabled={pending || Boolean(attempt)} onSaved={agentId => setSessionAgents(current => ({ ...current, [selected]: agentId }))} />}</>} settings={<><TemplatePicker draftKey={selected} disabled={sendPending || detailPending || !active || Boolean(attempt) || current?.status !== 'open'} />
        {control && <GatewayModelPicker compact key={`model:${selected}`} client={control} value={selectedValue.modelId ?? ''} disabled={sendPending || detailPending || !active || Boolean(attempt)} manualRequired={Boolean(harnessBySession?.[selected])} onChange={value => draftController.edit(selected, { modelId: value || null })} />}
        <GatewaySkillPicker key={`skills:${selected}`} client={client} value={selectedValue.skillIds} disabled={sendPending || detailPending || !active || !!attempt || current?.status !== 'open'} harnessDisabled={Boolean(harnessBySession?.[selected])} onChange={ids => setSkillChoices(selected, ids)} />
        {control && current && current.status === 'open' && <ChatOutputControl key={`output:${current.id}`} control={control} sessionId={current.id} disabled={sendPending || detailPending || !active || Boolean(attempt)} onChanged={refreshChat} />}
        <ThinkControl companion={activeAgentId === 'companion'} checked={selectedValue.think} disabled={sendPending || detailPending || !active || !!attempt || current?.status !== 'open'} harnessDisabled={Boolean(harnessBySession?.[selected])} onChange={think => setThinkChoice(selected, think)} />
      </>} actions={<>
        {headerExtra}
        <NewChatVoiceControl value={chat.draft} input={replyComposer} onRecordingChange={setDictating} disabled={!visible || chat.setDraft.availability !== 'enabled' || Boolean(chat.generation)} onChange={value => { if (chat.setDraft.availability === 'enabled') void chat.setDraft.run(value) }} />
      </>} />
      <DraftSaveStatus key={`draft-status:${selected}`} entry={draftEntries[selected]} controller={draftController} draftKey={selected} disabled={sendPending || current?.status === 'forgotten'} />
    </div>
  </>
}