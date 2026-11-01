import { useCallback, useEffect, useId, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { AlertDialog, AlertDialogClose, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SegmentedControl, SegmentedControlItem } from '@/components/ui/segmented-control'
import { Textarea } from '@/components/ui/textarea'
import { chatFeatureMessage } from '@/lib/gateway/chat-feature-errors'
import type { ChatContextClient, ChatContextSettings, ContextItem, ContextItems, ContextPolicy } from '@/lib/gateway/chat-context'
import { gatewayError } from '@/lib/gateway/transport'

const defaults = { window: '128000', reserve: '4096', other: '0' }
type Section = 'settings' | 'rules' | 'decisions' | 'questions' | 'add'
const ruleWords: [string, string][] = [['keep-exact', 'kept word for word'], ['exclude', 'left out'], ['allow-summary', 'may be summarised'], ['retrieve', 'brought back when relevant']]
const stateWords: Record<string, string> = { withdrawn: 'Withdrawn', superseded: 'Replaced', resolved: 'Resolved', active: 'Active', open: 'Open' }

const toNumber = (text: string) => text.trim() === '' ? Number.NaN : Number(text)

function Group({ title, description, error, children }: { title: string; description: string; error?: string; children: ReactNode }) {
  return <section className="space-y-2">
    <div>
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
    {children}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </section>
}

function ItemRow({ item, children }: { item: ContextItem; children?: ReactNode }) {
  return <li className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-md bg-muted/50 px-3 py-2">
    <div className="min-w-0 flex-1 basis-40">
      <p className="break-words text-sm">{item.text}</p>
      {item.author === 'ai' && <p className="text-xs text-muted-foreground">Conker</p>}
    </div>
    {children && <div className="flex shrink-0 gap-1">{children}</div>}
  </li>
}

/** Instructions, token budget, message rules and the decisions and open questions Conker keeps for this chat. */
export function ContextSettingsPanel({ client, sessionId, disabled, onChanged }: { client: ChatContextClient; sessionId: string; disabled: boolean; onChanged: () => void }) {
  const ids = useId()
  const [settings, setSettings] = useState<ChatContextSettings | null>(null)
  const [items, setItems] = useState<ContextItems | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Partial<Record<Section, string>>>({})
  const [busy, setBusy] = useState(false)
  const [instructions, setInstructions] = useState('')
  const [windowText, setWindowText] = useState(defaults.window)
  const [reserveText, setReserveText] = useState(defaults.reserve)
  const [otherText, setOtherText] = useState(defaults.other)
  const [kind, setKind] = useState<'decision' | 'thread'>('decision')
  const [text, setText] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)

  const fillForm = useCallback((policy: ContextPolicy | null) => {
    setInstructions(policy?.sessionInstructions ?? '')
    setWindowText(policy ? String(policy.budget.contextWindowTokens) : defaults.window)
    setReserveText(policy ? String(policy.budget.outputReserveTokens) : defaults.reserve)
    setOtherText(policy ? String(policy.budget.otherInputTokens) : defaults.other)
  }, [])

  const fetchBoth = useCallback((signal?: AbortSignal) => Promise.all([client.get(sessionId, signal), client.items(sessionId, signal)]), [client, sessionId])
  const apply = useCallback(([nextSettings, nextItems]: [ChatContextSettings, ContextItems]) => {
    setSettings(nextSettings)
    setItems(nextItems)
    fillForm(nextSettings.policy)
    setLoadError(null)
  }, [fillForm])

  /** Reads both lists again and resets the form to what the server holds. */
  const reload = useCallback(async () => {
    try { apply(await fetchBoth()) } catch (error) { setLoadError(chatFeatureMessage(error)) }
  }, [apply, fetchBoth])

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    fetchBoth(signal)
      .then(result => { if (!signal.aborted) apply(result) })
      .catch(error => { if (!signal.aborted) setLoadError(chatFeatureMessage(error)) })
    return () => controller.abort()
  }, [apply, fetchBoth])

  /** Runs one write. A failure shows beside `section`; a conflict also reloads. */
  const write = async (section: Section, action: () => Promise<void>) => {
    setBusy(true)
    setErrors({})
    try {
      await action()
      onChanged()
    } catch (error) {
      setErrors({ [section]: chatFeatureMessage(error) })
      if (gatewayError(error).code === 'revision_conflict') await reload()
    } finally {
      setBusy(false)
    }
  }
  const refreshItems = async () => setItems(await client.items(sessionId))

  if (!settings || !items) {
    return loadError
      ? <div className="space-y-2">
        <p role="alert" className="text-xs text-destructive">{loadError}</p>
        <Button variant="outline" size="sm" onClick={() => { setLoadError(null); void reload() }}>Try again</Button>
      </div>
      : <p className="text-sm text-muted-foreground">Loading context settings…</p>
  }

  const policy = settings.policy
  const windowTokens = toNumber(windowText), reserveTokens = toNumber(reserveText), otherTokens = toNumber(otherText)
  const reserveTooBig = Number.isInteger(windowTokens) && Number.isInteger(reserveTokens) && reserveTokens >= windowTokens
  const valid = Number.isInteger(windowTokens) && windowTokens >= 2 && windowTokens <= 10_000_000 && Number.isInteger(reserveTokens) && reserveTokens >= 1 && !reserveTooBig && Number.isInteger(otherTokens) && otherTokens >= 0
  const changed = instructions !== (policy?.sessionInstructions ?? '')
    || windowText !== (policy ? String(policy.budget.contextWindowTokens) : defaults.window)
    || reserveText !== (policy ? String(policy.budget.outputReserveTokens) : defaults.reserve)
    || otherText !== (policy ? String(policy.budget.otherInputTokens) : defaults.other)
  const locked = disabled || busy

  const save = () => write('settings', async () => {
    const saved = await client.save(sessionId, {
      sessionInstructions: instructions,
      messagePolicies: policy?.messagePolicies ?? {},
      budget: { contextWindowTokens: windowTokens, outputReserveTokens: reserveTokens, otherInputTokens: otherTokens },
    }, settings.revision)
    setSettings(saved)
    fillForm(saved.policy)
  })
  const clearRules = () => write('rules', async () => {
    if (!policy) return
    setSettings(await client.save(sessionId, { ...policy, messagePolicies: {} }, settings.revision))
  })
  const setState = (item: ContextItem, state: 'resolved' | 'withdrawn', section: Section) => write(section, async () => {
    await client.setItemState(sessionId, item.id, state, items.revision)
    await refreshItems()
  })
  const add = () => write('add', async () => {
    await client.addItem(sessionId, { kind, text }, items.revision)
    setText('')
    await refreshItems()
  })

  const counts = new Map<string, number>()
  for (const rule of Object.values(policy?.messagePolicies ?? {})) counts.set(rule, (counts.get(rule) ?? 0) + 1)
  const ruleSummary = ruleWords.filter(([rule]) => counts.has(rule)).map(([rule, words]) => `${counts.get(rule)} ${words}`).join(' · ')
  const decisions = items.items.filter(item => item.kind === 'decision' && item.state === 'active')
  const questions = items.items.filter(item => item.kind === 'thread' && item.state === 'open')
  const earlier = items.items.filter(item => !decisions.includes(item) && !questions.includes(item))

  return <div className="space-y-6">
    <Group title="Instructions for this chat" description="Conker follows these in this chat only.">
      <Textarea value={instructions} onChange={event => setInstructions(event.target.value)} rows={4} maxLength={16000} disabled={locked} aria-label="Instructions for this chat" placeholder="For example: answer in short bullet points." />
    </Group>

    <Group title="Budget" description="How much Conker may read at once, in tokens." error={errors.settings}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {([['window', 'Context window', windowText, setWindowText], ['reserve', 'Kept for the answer', reserveText, setReserveText], ['other', 'Other input', otherText, setOtherText]] as const).map(([key, label, value, set]) => <div key={key} className="space-y-1">
          <Label htmlFor={`${ids}-${key}`} className="text-xs">{label}</Label>
          <Input id={`${ids}-${key}`} type="number" inputMode="numeric" value={value} onChange={event => set(event.target.value)} disabled={locked} aria-invalid={key === 'reserve' && reserveTooBig ? true : undefined} />
        </div>)}
      </div>
      {reserveTooBig && <p role="alert" className="text-xs text-destructive">The room kept for the answer must be smaller than the context window.</p>}
      <Button size="sm" onClick={save} disabled={locked || !changed || !valid}>Save</Button>
    </Group>

    <Group title="Message rules" description="How single messages are treated when Conker builds its context." error={errors.rules}>
      <p className="text-sm text-muted-foreground">{ruleSummary || 'No message rules.'}</p>
      {ruleSummary && <Button variant="outline" size="sm" onClick={() => setConfirmClear(true)} disabled={locked}>Clear rules</Button>}
    </Group>

    <Group title="Decisions" description="What Conker treats as settled in this chat." error={errors.decisions}>
      {decisions.length ? <ul className="space-y-1.5">{decisions.map(item => <ItemRow key={item.id} item={item}>
        <Button variant="ghost" size="xs" onClick={() => setState(item, 'withdrawn', 'decisions')} disabled={locked}>Withdraw</Button>
      </ItemRow>)}</ul> : <p className="text-sm text-muted-foreground">No decisions yet.</p>}
    </Group>

    <Group title="Open questions" description="What is still unsettled in this chat." error={errors.questions}>
      {questions.length ? <ul className="space-y-1.5">{questions.map(item => <ItemRow key={item.id} item={item}>
        <Button variant="ghost" size="xs" onClick={() => setState(item, 'resolved', 'questions')} disabled={locked}>Resolve</Button>
        <Button variant="ghost" size="xs" onClick={() => setState(item, 'withdrawn', 'questions')} disabled={locked}>Withdraw</Button>
      </ItemRow>)}</ul> : <p className="text-sm text-muted-foreground">No open questions.</p>}
    </Group>

    {earlier.length > 0 && <Collapsible className="space-y-1.5">
      <CollapsibleTrigger className="group/earlier flex items-center gap-1 rounded-md text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronRight className="size-3.5 transition-transform group-data-panel-open/earlier:rotate-90" aria-hidden="true" />Earlier ({earlier.length})
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="space-y-1.5 pt-1">{earlier.map(item => <li key={item.id} className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <p className="break-words">{item.text}</p>
          <p>{item.author === 'ai' ? `Conker · ${stateWords[item.state]}` : stateWords[item.state]}</p>
        </li>)}</ul>
      </CollapsibleContent>
    </Collapsible>}

    <Group title="Add" description="Write down a decision or a question for this chat." error={errors.add}>
      <SegmentedControl size="sm" role="radiogroup" aria-label="What to add">
        {([['decision', 'Decision'], ['thread', 'Question']] as const).map(([value, label]) =>
          <SegmentedControlItem key={value} role="radio" aria-checked={kind === value} data-pressed={kind === value ? '' : undefined} onClick={() => setKind(value)}>{label}</SegmentedControlItem>)}
      </SegmentedControl>
      <form className="flex gap-2" onSubmit={event => { event.preventDefault(); if (text.trim() && !locked) void add() }}>
        <Input value={text} onChange={event => setText(event.target.value)} maxLength={500} disabled={locked} aria-label={kind === 'decision' ? 'New decision' : 'New question'} placeholder={kind === 'decision' ? 'We will use metric units.' : 'Which city should the weather use?'} />
        <Button type="submit" size="sm" disabled={locked || !text.trim()}>Add</Button>
      </form>
    </Group>

    <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear every message rule?</AlertDialogTitle>
          <AlertDialogDescription>Messages go back to the default.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
          <Button onClick={() => { setConfirmClear(false); void clearRules() }}>Clear rules</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
}
