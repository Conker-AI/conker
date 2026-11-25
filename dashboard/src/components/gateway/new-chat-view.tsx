import { draftCanSend, type DraftController, type DraftEntry } from './draft-controller'
import { DraftSaveStatus } from './draft-status'
import type { DraftValue } from '@/lib/gateway/drafts'
import type { PendingDraftStart } from './draft-start-recovery'
import { ThinkControl } from './think-control'
import type { ChatEffort } from '@/lib/gateway/chat-names'
import { ChatComposerFrame } from '@/components/chat/composer'
import { BackToChats } from '@/components/chat/history'
import { GatewayHeader } from './header'
import { PageTitle } from '@/components/design-system'
import type { GatewayControlClient } from '@/lib/gateway/control'
import { GatewayModelPicker } from './model-picker'
import { GatewayAgentPicker } from './agent-picker'
import { GatewaySkillPicker } from './skill-picker'
import { Bot } from 'lucide-react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import { Button } from '@/components/ui/button'
import type { GatewayRuntimeClient } from '@/lib/gateway/runtime'
import { NewChatPrivacyControl, type NewChatPrivacy } from './new-chat-privacy-control'
import { NewChatVoiceControl } from './new-chat-voice-control'
import { PromptEnhanceControl } from './prompt-enhance-control'
import { NewChatStart } from './new-chat-start'
import { AnimatedIconButton } from '@/components/icons/animated/animated-icon'
import { SendIcon } from '@/components/icons/animated/icons'
import { ComposerModeProvider, ConversationStarters, ModePresetControl, NewChatCallButtons, SearchControl, TemplateInput, TemplatePicker } from './composer-parts'

/** New-chat composer with the agent identity, draft, privacy, recovery and start controls shown before a conversation exists. */
export function NewChatView({ visible, firstAgent, activeAgentName, firstMessage, setFirstMessage, newChatComposer, createPending, sendPending, createUnknown, dictating,
  startChat, templateActive, firstValue, firstPrivacy, client, draftController, control, setFirstAgent, firstModel, setFirstModel, firstSkills, setSkillChoices,
  setThinkChoice, firstEffort, setFirstEffort, setFirstPrivacy, setDictating, draftEntries, createError, pendingStart, recoverChatStart, startMissing }: {
  visible: boolean; firstAgent: string; activeAgentName: string; firstMessage: string; setFirstMessage: (text: string) => void; newChatComposer: RefObject<HTMLTextAreaElement | null>
  createPending: boolean; sendPending: boolean; createUnknown: 'unchecked' | 'checked' | null; dictating: boolean; startChat: () => Promise<void>; templateActive: boolean
  firstValue: DraftValue; firstPrivacy: NewChatPrivacy; client: GatewayRuntimeClient; draftController: DraftController; control?: GatewayControlClient
  setFirstAgent: (agentId: string) => void; firstModel: string; setFirstModel: (modelId: string) => void; firstSkills: string[]; setSkillChoices: (id: string, skillIds: string[]) => void; setThinkChoice: (id: string, think: boolean) => void; firstEffort: ChatEffort; setFirstEffort: (effort: ChatEffort) => void
  setFirstPrivacy: (privacy: NewChatPrivacy, reviewed?: string) => void; setDictating: Dispatch<SetStateAction<boolean>>; draftEntries: Record<string, DraftEntry>; createError: string | null
  pendingStart: PendingDraftStart | null; recoverChatStart: (replay?: boolean) => Promise<void>; startMissing: boolean
}) {
  // A starter or suggestion fills the message box and puts the cursor at its end; nothing is sent.
  const pickText = (text: string) => { setFirstMessage(text); requestAnimationFrame(() => { const field = document.getElementById('new-chat-composer') as HTMLTextAreaElement | null; field?.focus(); field?.setSelectionRange(text.length, text.length) }) }
  return <>
    {visible && <GatewayHeader context={<><BackToChats /><PageTitle className="truncate text-sm font-medium">New chat</PageTitle></>} />}
    <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 pb-[10vh] pt-8">
      <div className="my-auto w-full max-w-[768px]">
        <div className="mb-7 flex flex-col items-center gap-3 sm:mb-8">
          <span className="flex size-20 items-center justify-center overflow-hidden rounded-full border bg-card shadow-sm">{firstAgent === 'companion' ? <img src="/conker.png" alt="" width="60" height="60" className="size-[75%] object-contain" /> : <Bot className="size-8 text-muted-foreground" />}</span>
          <h2 className="text-center text-3xl font-semibold">{activeAgentName}</h2>
        </div>
        <NewChatStart typed={!!firstMessage} disabled={createPending || sendPending || Boolean(createUnknown)} onPick={pickText} />
        <ComposerModeProvider key="mode:new" text={firstMessage} think={firstValue.think} research={firstValue.researchMode} thinkAvailable={firstAgent === 'companion' && !firstPrivacy.harnessDisabled} harnessDisabled={firstPrivacy.harnessDisabled} sessionId={null} disabled={createPending || sendPending || Boolean(createUnknown)} modelId={firstModel} setModel={setFirstModel} propose={client.proposeSettings} apply={values => draftController.edit('new', values)}>
        <ChatComposerFrame id="new-chat-composer" label={`Message ${activeAgentName}`} placeholder={`Ask ${activeAgentName} anything, or give it a task...`} value={firstMessage} onChange={setFirstMessage} inputRef={newChatComposer} disabled={createPending || sendPending || Boolean(createUnknown)} onSend={() => { if (!dictating) void startChat() }} input={templateActive ? <TemplateInput draftKey="new" disabled={createPending || sendPending || Boolean(createUnknown)} onText={setFirstMessage} onSubmit={() => { if (!dictating) void startChat() }} /> : undefined} controls={<>
            <ModePresetControl />{control && <GatewayAgentPicker compact client={control} value={firstAgent} disabled={createPending || sendPending || Boolean(createUnknown)} onChange={setFirstAgent} />}</>} actions={<>
              <TemplatePicker draftKey="new" client={control?.promptTemplates} disabled={createPending || sendPending || Boolean(createUnknown)} />
              {control && <GatewayModelPicker client={control} value={firstModel} disabled={createPending || sendPending || Boolean(createUnknown)} manualRequired={firstPrivacy.harnessDisabled} onChange={setFirstModel} effort={{ sessionId: null, pending: { value: firstEffort, set: setFirstEffort } }} />}
              <GatewaySkillPicker client={client} value={firstSkills} disabled={createPending || sendPending || Boolean(createUnknown)} harnessDisabled={firstPrivacy.harnessDisabled} onChange={ids => setSkillChoices('__new__', ids)} />
              <ThinkControl companion={firstAgent === 'companion'} checked={firstValue.think} disabled={createPending || sendPending || Boolean(createUnknown)} harnessDisabled={firstPrivacy.harnessDisabled} onChange={think => setThinkChoice('__new__', think)} />
              <SearchControl />
              <NewChatPrivacyControl revisionKey={JSON.stringify(firstValue.privacy)} value={firstPrivacy} disabled={createPending || sendPending || Boolean(createUnknown)} onChange={setFirstPrivacy} />
              <NewChatCallButtons />
              {control && <PromptEnhanceControl client={control.promptEnhance} templates={control.promptTemplates} value={firstMessage} onChange={setFirstMessage} options={{ privacy: firstPrivacy }} disabled={createPending || sendPending || Boolean(createUnknown) || dictating} />}
              <NewChatVoiceControl value={firstMessage} onChange={setFirstMessage} input={newChatComposer} onRecordingChange={setDictating} disabled={!visible || createPending || sendPending || Boolean(createUnknown)} />
              <AnimatedIconButton icon={SendIcon} type="submit" size="icon" className="size-9 shrink-0 rounded-full" aria-label="Send message" disabled={dictating || createPending || sendPending || !firstMessage.trim() || !draftCanSend(draftEntries.new) || firstPrivacy.harnessDisabled && !firstModel || Boolean(createUnknown)} />
        </>} />
        </ComposerModeProvider>
        {createError && <p role="alert" className="mt-4 text-center text-sm text-destructive-foreground">{createError}</p>}
        <div className="mt-3"><DraftSaveStatus entry={draftEntries.new} controller={draftController} draftKey="new" disabled={createPending || sendPending || !!pendingStart} /></div>
        {pendingStart && <div className="mt-3 space-y-2 rounded-lg border p-3"><p className="text-sm">A saved chat start needs checking.</p><p className="text-xs text-muted-foreground">Recovering it opens the same chat. Your message will wait for you to send it.</p><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={createPending} onClick={() => void recoverChatStart()}>Check saved chat start</Button>{startMissing && <Button size="sm" variant="outline" disabled={createPending} onClick={() => void recoverChatStart(true)}>Retry same chat start</Button>}</div></div>}
        {!firstMessage && <ConversationStarters disabled={createPending || sendPending || Boolean(createUnknown)} onPick={pickText} />}
      </div>
    </div>
  </>
}