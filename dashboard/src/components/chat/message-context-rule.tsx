import { useContext, type ReactNode } from 'react'
import { Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Menu, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from '@/components/ui/menu'
import { AnswerToolsContext, MessageRulesContext, useMessageRules } from '@/lib/chat/answer-tools-context'
import type { ChatMessage } from '@/lib/chat/contract'
import { canRuleMessage, messageRuleOf, messageRules, ruleLabel, type MessageRule } from '@/lib/chat/message-context-rules'

/** Loads the open chat's message rules once for every message below it. Renders only its children when the chat has no gateway tools. */
export function MessageRulesProvider({ sessionId, reloadKey, children }: { sessionId: string; reloadKey: string; children: ReactNode }) {
  const tools = useContext(AnswerToolsContext)
  const rules = useMessageRules(tools, sessionId, reloadKey)
  return <MessageRulesContext.Provider value={rules}>{children}</MessageRulesContext.Provider>
}

/** A message's context rule: a menu button in the action bar, and the rule's words beside it while one is set. */
export function MessageContextRule({ message }: { message: ChatMessage }) {
  const tools = useContext(AnswerToolsContext)
  const rules = useContext(MessageRulesContext)
  if (!tools || !rules || message.content.kind !== 'text' || !canRuleMessage(message.id)) return null
  const current = messageRuleOf(rules.settings.policy, message.id)
  const choose = (value: string) => void rules.set(message.id, value === 'default' ? null : value as MessageRule)
  return <>
    <Menu>
      <MenuTrigger render={<Button variant="ghost" size="icon" className="size-(--control-height-sm) shrink-0 text-muted-foreground hover:text-foreground" aria-label="Context rule" title="Context rule" disabled={tools.disabled || rules.saving} />}>
        <Layers aria-hidden />
      </MenuTrigger>
      <MenuPopup align="start">
        <MenuRadioGroup value={current ?? 'default'} onValueChange={choose}>
          <MenuRadioItem value="default" closeOnClick>Default</MenuRadioItem>
          {messageRules.map(rule => <MenuRadioItem key={rule} value={rule} closeOnClick>{ruleLabel(rule)}</MenuRadioItem>)}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
    {current && <span className="text-muted-foreground">{ruleLabel(current)}</span>}
  </>
}

/** The plain message under the action bar when saving this message's rule failed. */
export function MessageContextRuleError({ message }: { message: ChatMessage }) {
  const rules = useContext(MessageRulesContext)
  if (!rules?.error || rules.error.messageId !== message.id) return null
  return <p role="alert" className="mt-1 text-xs text-destructive">{rules.error.text}</p>
}
