import { Layers } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { WorkspaceAction } from '@/components/design-system/workspace-chrome'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { GatewayRuntimeClient, RuntimeSessionDetail, RuntimeThinking, RuntimeTurn } from '@/lib/gateway/runtime'
import type { ContextSettings } from '@/lib/gateway/context-read'
import type { GatewaySourcePrivacyState } from './source-privacy'
import { gatewayError } from '@/lib/gateway/transport'
import { TurnUsageDisclosure } from './turn-usage-disclosure'
import { conversationViews, type ConversationView } from './conversation-view-list'

export function ConversationViewStrip({ open, onToggle, compact }: { open: ConversationView | null; onToggle: (view: ConversationView) => void; compact: boolean }) {
  // Phones fold the strip into one button so the conversation title keeps its room.
  if (compact) return <DropdownMenu><DropdownMenuTrigger asChild><WorkspaceAction iconOnly aria-label="Conversation views" title="Conversation views"><Layers /></WorkspaceAction></DropdownMenuTrigger>
    <DropdownMenuContent align="end" aria-label="Conversation views">{conversationViews.map(({ id, label, icon: Icon }) => <DropdownMenuItem key={id} data-conversation-view={id} onSelect={() => onToggle(id)}><Icon aria-hidden="true" />{label}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
  return <div className="conker-view-strip" role="group" aria-label="Conversation views">
    {conversationViews.map(({ id, label, icon: Icon }) => <button key={id} type="button" data-conversation-view={id} aria-label={label} title={label}
      aria-pressed={open === id} aria-controls={open === id ? 'conker-conversation-view' : undefined} onClick={() => onToggle(id)}><Icon aria-hidden="true" /></button>)}
  </div>
}

type Props = { view: ConversationView; detail: RuntimeSessionDetail | null; error: string | null; loading: boolean; onRetry: () => void; runtime: GatewayRuntimeClient; sourcePrivacy: GatewaySourcePrivacyState; active: boolean }

export function ConversationViewContent({ view, detail, error, loading, onRetry, runtime, ...rest }: Props) {
  return <div className="conker-reference-content" id="conker-conversation-view">
    {loading ? <p role="status">Loading saved records…</p>
      : error ? <div role="alert"><p>{error}</p><Button variant="outline" size="sm" onClick={onRetry}>Try again</Button></div>
        : !detail ? <p>Start a conversation to see its context, thinking and logs here.</p>
          : view === 'context' ? <ContextView detail={detail} runtime={runtime} />
            : view === 'thinking' ? <ThinkingView detail={detail} />
              : <LogsView detail={detail} runtime={runtime} {...rest} />}
  </div>
}

const time = (value: string) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const seconds = (turn: RuntimeTurn) => turn.endedAt ? Math.max(0, Math.round((Date.parse(turn.endedAt) - Date.parse(turn.startedAt)) / 1000)) : null
const label = (status: string) => status.replaceAll('_', ' ')

function ContextView({ detail, runtime }: { detail: RuntimeSessionDetail; runtime: GatewayRuntimeClient }) {
  const { memory } = detail
  const [contextSettings, setContextSettings] = useState<ContextSettings | null>(null)
  const [contextError, setContextError] = useState<string | null>(null)
  const [contextLoading, setContextLoading] = useState(true)

  useEffect(() => {
    let aborted = false
    const controller = new AbortController()

    setContextLoading(true)
    setContextError(null)

    runtime.readContext(detail.id, { signal: controller.signal })
      .then(settings => {
        if (!aborted) {
          setContextSettings(settings)
          setContextLoading(false)
        }
      })
      .catch(error => {
        if (!aborted) {
          setContextError(gatewayError(error).message)
          setContextLoading(false)
        }
      })

    return () => {
      aborted = true
      controller.abort()
    }
  }, [detail.id, runtime])

  const messageRuleCounts = contextSettings?.policy ? {
    'keep-exact': Object.values(contextSettings.policy.messagePolicies).filter(p => p === 'keep-exact').length,
    'exclude': Object.values(contextSettings.policy.messagePolicies).filter(p => p === 'exclude').length,
    'retrieve': Object.values(contextSettings.policy.messagePolicies).filter(p => p === 'retrieve').length,
    'allow-summary': Object.values(contextSettings.policy.messagePolicies).filter(p => p === 'allow-summary').length,
  } : null

  const messageRulesText = messageRuleCounts ? [
    messageRuleCounts['keep-exact'] && `${messageRuleCounts['keep-exact']} pinned`,
    messageRuleCounts['exclude'] && `${messageRuleCounts['exclude']} excluded`,
    messageRuleCounts['retrieve'] && `${messageRuleCounts['retrieve']} retrieved`,
    messageRuleCounts['allow-summary'] && `${messageRuleCounts['allow-summary']} summarisable`,
  ].filter(Boolean).join(' · ') : null

  const summaryText = contextSettings?.summary.text ?? detail.summary

  return <>
    <h2>{detail.title || 'Untitled conversation'}</h2>
    <p>{detail.messages.length} {detail.messages.length === 1 ? 'message' : 'messages'} · {detail.turns.length} {detail.turns.length === 1 ? 'turn' : 'turns'}</p>

    {contextLoading && <p role="status">Loading context settings…</p>}
    {contextError && <p>Context settings are unavailable: {contextError}</p>}

    {contextSettings?.policy ? (
      <>
        <h3>Instructions</h3>
        <p className="whitespace-pre-wrap">{contextSettings.policy.sessionInstructions || 'No session instructions.'}</p>

        <h3>Message rules</h3>
        <p>{messageRulesText || 'All messages are used as usual.'}</p>

        <h3>Budget</h3>
        <p>{contextSettings.policy.budget.contextWindowTokens.toLocaleString()}-token window · {contextSettings.policy.budget.outputReserveTokens.toLocaleString()} reserved for the answer</p>
      </>
    ) : contextSettings ? (
      <>
        <h3>Instructions</h3>
        <p>No session instructions.</p>

        <h3>Message rules</h3>
        <p>All messages are used as usual.</p>

        <h3>Budget</h3>
        <p>Default budget.</p>
      </>
    ) : null}

    {summaryText && (
      <>
        <h3>Summary</h3>
        <p>{summaryText}</p>
        {contextSettings?.summary.versions && contextSettings.summary.versions > 1 && (
          <p>{contextSettings.summary.versions} saved versions</p>
        )}
      </>
    )}

    <h3>Memory</h3>
    <p>{memory.configured ? 'Memory is configured' : 'Memory is not configured'}</p>
    <p>{memory.retrieval ? `${memory.retrieval.records} records · ${memory.retrieval.status}` : 'No retrieval evidence for this conversation yet.'}</p>
    {memory.notices.map((notice, index) => <p key={index}>{notice}</p>)}
    <Link to="/memory">Explore memory and sources</Link>
  </>
}

const thought = (row: RuntimeThinking | undefined) => !row ? null
  : row.status === 'completed' ? row.result
    : row.status === 'queued' || row.status === 'running' ? 'Thinking…'
      : `Thinking ${label(row.status)}${row.detail ? `: ${row.detail}` : ''}`

function ThinkingView({ detail }: { detail: RuntimeSessionDetail }) {
  if (!detail.turns.length) return <p>No recorded steps yet. Each answer's steps appear here, with what Conker concluded after them when Think is on.</p>
  return <ol className="conker-steps" aria-label="Recorded steps">
    {detail.turns.map(turn => {
      const note = thought(detail.thinking?.find(row => row.turnId === turn.id))
      const took = seconds(turn)
      return <li key={turn.id}>
        <div className="conker-step"><strong>{turn.model || 'Model not recorded'}</strong><span>{label(turn.status)}{took !== null ? ` · ${took} s` : ''}</span></div>
        {turn.acted && <p>Action recorded{turn.action ? ` · ${label(turn.action.state)}` : ''}</p>}
        {turn.detail && <p>{turn.detail}</p>}
        {note && <p className="conker-step-thought">{note}</p>}
      </li>
    })}
  </ol>
}

function LogsView({ detail, runtime, sourcePrivacy, active }: { detail: RuntimeSessionDetail } & Pick<Props, 'runtime' | 'sourcePrivacy' | 'active'>) {
  if (!detail.turns.length) return <p>No completed work yet.</p>
  return <>{detail.turns.slice(-8).reverse().map(turn => <section key={turn.id} className="conker-receipt">
    <strong>{time(turn.startedAt)} · {turn.model || 'Model not recorded'}</strong>
    <p>{label(turn.status)}{turn.acted ? ' · action recorded' : ''}</p>
    <p>{turn.provider ?? 'Provider unknown'}</p>
    {detail.status !== 'forgotten' && <TurnUsageDisclosure client={runtime} turnId={turn.id} sessionId={detail.id} sourcePrivacy={sourcePrivacy} active={active} refreshKey={`${turn.status}:${turn.endedAt}:${detail.thinking?.find(row => row.turnId === turn.id)?.status ?? ''}`} />}
    {turn.detail && <p>{turn.detail}</p>}
  </section>)}</>
}
