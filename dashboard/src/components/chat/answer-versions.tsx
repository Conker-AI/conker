import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, GitBranch, RefreshCw, Scale } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuSub, MenuSubPopup, MenuSubTrigger, MenuTrigger } from '@/components/ui/menu'
import { Popover, PopoverContent } from '@/components/ui/popover'
import type { AnswerTools } from '@/lib/chat/answer-tools-context'
import type { ChatMessage } from '@/lib/chat/contract'
import type { AnswerModel } from '@/lib/gateway/chat-answers'
import { chatFeatureMessage } from '@/lib/gateway/chat-feature-errors'

const MOST_COMPARED = 3

/** Versions of one answer: switch between versions, answer again with another model, compare models, branch a new chat from here. */
export function AnswerVersions({ message, tools }: { message: ChatMessage; tools: AnswerTools }) {
  const navigate = useNavigate()
  const anchor = useRef<HTMLSpanElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [models, setModels] = useState<AnswerModel[] | null>(null)
  const [comparing, setComparing] = useState(false)
  const [picked, setPicked] = useState<string[]>([])

  const family = message.family
  const versions = family?.versions ?? []
  const position = family ? versions.indexOf(family.selectedId) : -1
  const locked = tools.disabled || busy

  /** Runs one action with the busy flag and one inline error line; the action returns false when it showed its own error. */
  const run = async (action: () => Promise<boolean | void>) => {
    setBusy(true)
    setError(null)
    try {
      if ((await action()) !== false) tools.refresh()
    } catch (failure) {
      setError(chatFeatureMessage(failure))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const loadModels = async () => {
    if (models) return
    try {
      setModels(await tools.answers.models())
    } catch (failure) {
      setError(chatFeatureMessage(failure))
    }
  }

  const step = (offset: -1 | 1) => {
    if (!family || position < 0) return
    const target = versions[position + offset]
    if (target) void run(() => tools.answers.select(message.sessionId, family.rootId, target, family.revision).then(() => undefined))
  }

  const answerAgain = (modelId: string) => run(async () => {
    const receipt = await tools.answers.retry(message.sessionId, message.id, modelId)
    if (receipt.messageId !== null) return true
    setError('That model did not answer.')
    return false
  })

  const compare = () => run(async () => {
    for (const [index, modelId] of picked.entries()) {
      setProgress(`Answering ${index + 1} of ${picked.length}…`)
      const receipt = await tools.answers.retry(message.sessionId, message.id, modelId)
      if (receipt.messageId === null) {
        setError(`${models?.find(model => model.id === modelId)?.name ?? 'A model'} did not answer.`)
        tools.refresh()
        return false
      }
    }
    setComparing(false)
    setPicked([])
    return true
  })

  const branch = () => run(async () => {
    const basis = await tools.answers.forkBasis(message.sessionId)
    const { sessionId } = await tools.answers.fork(message.sessionId, message.id, basis)
    navigate(`/chat/${sessionId}`)
    return false
  })

  const toggle = (modelId: string, checked: boolean) =>
    setPicked(current => checked ? (current.length < MOST_COMPARED ? [...current, modelId] : current) : current.filter(id => id !== modelId))

  return <>
    {family && position >= 0 && versions.length >= 2 && <span className="flex items-center gap-0.5">
      <Button variant="ghost" size="icon-xs" aria-label="Previous version" title="Previous version" disabled={locked || position <= 0} onClick={() => step(-1)}>
        <ChevronLeft aria-hidden />
      </Button>
      <span className="min-w-8 text-center tabular-nums" aria-live="polite">{position + 1}/{versions.length}</span>
      <Button variant="ghost" size="icon-xs" aria-label="Next version" title="Next version" disabled={locked || position >= versions.length - 1} onClick={() => step(1)}>
        <ChevronRight aria-hidden />
      </Button>
    </span>}

    <span ref={anchor} className="inline-flex">
      <Menu onOpenChange={open => { if (open) void loadModels() }}>
        <MenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Answer again" title="Answer again" disabled={locked} />}>
          <RefreshCw aria-hidden />
        </MenuTrigger>
        <MenuPopup align="start">
          <MenuSub>
            <MenuSubTrigger>Answer again with…</MenuSubTrigger>
            <MenuSubPopup>
              {models?.length ? models.map(model => <MenuItem key={model.id} onClick={() => void answerAgain(model.id)}>{model.name}</MenuItem>)
                : <MenuItem disabled>{models ? 'No models are turned on.' : 'Loading models…'}</MenuItem>}
            </MenuSubPopup>
          </MenuSub>
          <MenuItem onClick={() => setComparing(true)}><Scale aria-hidden />Compare models…</MenuItem>
          <MenuSeparator />
          <MenuItem onClick={() => void branch()}><GitBranch aria-hidden />Branch from here</MenuItem>
        </MenuPopup>
      </Menu>
    </span>

    <Popover open={comparing} onOpenChange={setComparing}>
      <PopoverContent anchor={anchor} align="start" className="w-64">
        <div className="flex flex-col gap-3 p-3">
          <p className="text-sm font-medium">Compare models</p>
          <p className="text-xs text-muted-foreground">Pick 2 or 3. Each answers again; switch between them with ‹ ›.</p>
          <div className="flex flex-col gap-2">
            {models?.length ? models.map(model => {
              const checked = picked.includes(model.id)
              return <label key={model.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={checked} disabled={busy || (!checked && picked.length >= MOST_COMPARED)} onCheckedChange={value => toggle(model.id, value)} />
                {model.name}
              </label>
            }) : <p className="text-xs text-muted-foreground">{models ? 'No models are turned on.' : 'Loading models…'}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={locked || picked.length < 2} onClick={() => void compare()}>Compare</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setComparing(false)}>Cancel</Button>
          </div>
          {progress && <p role="status" className="text-xs text-muted-foreground">{progress}</p>}
        </div>
      </PopoverContent>
    </Popover>

    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </>
}
