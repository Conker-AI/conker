import { useEffect, useMemo, useRef, useState } from 'react'
import type { GatewayControlClient, OwnerModelsConfiguration } from '@/lib/gateway/control'
import { GatewayError } from '@/lib/gateway/transport'
import { addClaudeModels, hasClaudePlan, missingClaudeModels, modelMenuLayout } from '@/lib/gateway/claude-models'
import { chatFeatureMessage } from '@/lib/gateway/chat-feature-errors'
import { useServerSetting } from '@/settings/server-setting'
import { PlanUsageRing } from './plan-usage-ring'
import { composerItem, useComposerValue } from '@/components/chat/composer-items'
import { AUTO_KEY, ModelMenu } from './model-menu'
import { useChatEffort, type PendingEffort } from './use-chat-effort'
import { useComposerMode } from './mode-control'

/**
 * The composer's model button. One button holds the answer model and the chat's effort: its menu lists
 * the models with number keys, an Effort submenu and the older and other models under More models.
 * `effort` names where the chat's effort lives (a saved chat, or a pending one for a new chat); a
 * chat that cannot take an effort leaves it out.
 */
export function GatewayModelPicker({
  client,
  value,
  onChange,
  disabled,
  manualRequired,
  effort,
}: {
  client: GatewayControlClient
  value: string
  onChange: (value: string) => void
  disabled: boolean
  manualRequired: boolean
  effort?: { sessionId: string | null; pending?: PendingEffort }
}) {
  const [catalogue, setCatalogue] = useState<OwnerModelsConfiguration | null>(null)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const chatEffort = useChatEffort(client, effort?.sessionId ?? null, effort?.pending)
  // A mode (Fast, Balanced, Deep, Auto) sets the model and the effort through here.
  const mode = useComposerMode()
  const connect = mode?.connect
  const chooseEffort = useRef(chatEffort.choose)
  useEffect(() => {
    chooseEffort.current = chatEffort.choose
  })
  const hasEffort = Boolean(effort)
  const effortValue = chatEffort.effort,
    effortReady = chatEffort.ready && !chatEffort.saving
  // Settings > Home > Plan usage ring: in the message box, on Home, both or off.
  const ring = useServerSetting<'home' | 'composer' | 'both' | 'off'>('home.plan_ring', 'both')
  // The list is read again when the tab comes back (a provider connected in another tab) and when it
  // changes here. While that runs, the last list stays, so an open menu keeps its rows and focus; the
  // new list replaces them in place. A failed read again keeps the last list; only a failed first read says so.
  useEffect(() => {
    let controller: AbortController
    let loaded = false
    const load = (first: boolean) => {
      if (first) {
        setCatalogue(null)
        setError('')
      }
      controller?.abort()
      const request = new AbortController()
      controller = request
      client
        .models(request.signal)
        .then(result => {
          if (request.signal.aborted) return
          loaded = true
          setCatalogue(result.configuration)
          setRevision(result.revision)
          setError('')
        })
        .catch(error => {
          if (!request.signal.aborted && !loaded) setError(error.message)
        })
    }
    const refresh = () => load(false)
    load(true)
    const unsubscribe = client.subscribeModels?.(refresh)
    window.addEventListener('focus', refresh)
    return () => {
      controller.abort()
      unsubscribe?.()
      window.removeEventListener('focus', refresh)
    }
  }, [client])
  const models = useMemo(
    () =>
      catalogue?.models.filter(
        model => model.providerId !== 'decisions' && model.enabled && catalogue.providers.some(provider => provider.id === model.providerId && provider.enabled) && catalogue.roleSettings.roles.answer.eligibleModelIds.includes(model.id),
      ) ?? [],
    [catalogue],
  )
  const layout = useMemo(() => (catalogue ? modelMenuLayout(catalogue, models) : { top: [], more: [] }), [catalogue, models])

  useEffect(() => {
    if (!connect || !catalogue) return
    connect({ layout, effort: effortValue, ready: hasEffort && effortReady, setEffort: next => void chooseEffort.current(next) })
    return () => connect(null)
  }, [connect, catalogue, layout, effortValue, hasEffort, effortReady])

  // Determine plan provider for selected model
  const selectedModelId = value || catalogue?.roleSettings.roles.answer.modelId || ''
  const selectedModel = models.find(model => model.id === selectedModelId)
  let planProvider: 'claude' | 'chatgpt' | null = null
  if (selectedModel?.providerId === 'claude-code') planProvider = 'claude'
  else if (selectedModel?.providerId === 'chatgpt') planProvider = 'chatgpt'

  // The button says which model will answer: the router, or the model's own name (a chosen one, else the configured one).
  const router = catalogue?.roleSettings.answerMode === 'router'
  const rowName = (id: string) => [...layout.top, ...layout.more].find(row => row.id === id)?.name
  const chosenName = value ? (rowName(value) ?? (catalogue ? 'Model unavailable' : value)) : null
  const name = chosenName ?? (manualRequired ? 'Choose a model' : router ? 'Auto' : (rowName(selectedModelId) ?? (catalogue ? 'Default model' : 'Loading models…')))
  // In the composer, the bar names a chosen model, or that one must be chosen; the configured default needs no mention.
  useComposerValue('model', chosenName ?? (manualRequired ? 'Choose a model' : null))

  const missing = catalogue && hasClaudePlan(catalogue) ? missingClaudeModels(catalogue).length : 0
  const addClaude = async () => {
    if (!catalogue || adding) return
    setAdding(true)
    setAddError('')
    try {
      const saved = await client.saveModels(addClaudeModels(catalogue), revision)
      if (saved.configuration) setCatalogue(saved.configuration)
      setRevision(saved.revision)
    } catch (failure) {
      setAddError(failure instanceof GatewayError && failure.code === 'revision_conflict' ? 'Your model list changed in another window. Try again.' : chatFeatureMessage(failure))
    } finally {
      setAdding(false)
    }
  }
  const lostModel = Boolean(value && catalogue && !models.some(model => model.id === value))
  return (
    <div className="flex min-w-0 items-center gap-1">
      <ModelMenu
        name={name}
        disabled={disabled || !catalogue}
        layout={layout}
        manualRequired={manualRequired}
        auto={Boolean(router)}
        lostModel={lostModel}
        selected={value || (router ? AUTO_KEY : selectedModelId)}
        onSelect={key => onChange(key === AUTO_KEY ? '' : key)}
        effort={
          effort
            ? { value: chatEffort.effort, onChange: next => void chatEffort.choose(next), disabled: disabled || chatEffort.saving || !chatEffort.ready, note: chatEffort.note, error: chatEffort.error, newChat: chatEffort.newChat }
            : undefined
        }
        add={missing ? { count: missing, pending: adding, error: addError, onAdd: () => void addClaude() } : undefined}
      />
      {planProvider && (ring === 'composer' || ring === 'both') && <PlanUsageRing client={client} provider={planProvider} />}
      {error && (
        <p role="alert" className="sr-only">
          Model list unavailable. {error}
        </p>
      )}
    </div>
  )
}
composerItem(GatewayModelPicker, 'model')
