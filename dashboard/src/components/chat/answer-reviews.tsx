'use client'

import { useCallback, useEffect, useState } from 'react'
import { Scale, ShieldCheck, ThumbsDown, ThumbsUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { AnswerTools } from '@/lib/chat/answer-tools-context'
import type { ChatMessage } from '@/lib/chat/contract'
import { chatFeatureMessage } from '@/lib/gateway/chat-feature-errors'
import type { FactCheck, Judgement, Votes } from '@/lib/gateway/chat-reviews'

type Props = { message: ChatMessage; tools: AnswerTools }
type Family = NonNullable<ChatMessage['family']>
const popup = 'w-[min(20rem,calc(100vw-2rem))]'
const markWords = { supported: 'Supported', contradicted: 'Contradicted', 'no-source': 'No source' } as const
const markVariant = { supported: 'success', contradicted: 'error', 'no-source': 'secondary' } as const

/** Loads a list when a popover opens; `null` until it has arrived. */
function useOpenedList<T>(load: (signal: AbortSignal) => Promise<T[]>) {
  const [items, setItems] = useState<T[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    load(controller.signal).then(setItems, failure => { if (!controller.signal.aborted) setError(chatFeatureMessage(failure)) })
    return () => controller.abort()
  }, [open, load])
  const add = (item: T) => { setItems(current => [item, ...(current ?? [])]); setError(null) }
  return { items, error, setError, setOpen, add }
}

/** Thumbs up and down for this version; a winner shows as up. Pi only takes votes on retried answers. */
function VoteButtons({ message, family, tools }: Props & { family: Family }) {
  const [votes, setVotes] = useState<Votes>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { reviews } = tools, { sessionId } = message, rootId = family.rootId
  useEffect(() => {
    const controller = new AbortController()
    reviews.votes(sessionId, rootId, controller.signal).then(setVotes, failure => { if (!controller.signal.aborted) setError(chatFeatureMessage(failure)) })
    return () => controller.abort()
  }, [reviews, sessionId, rootId])
  const current = votes[message.id]
  const pressed = { up: current === 'up' || current === 'winner', down: current === 'down' }
  const send = async (vote: 'up' | 'down') => {
    setBusy(true); setError(null)
    try { setVotes(await reviews.vote(sessionId, rootId, message.id, pressed[vote] ? 'clear' : vote)) } catch (failure) { setError(chatFeatureMessage(failure)) } finally { setBusy(false) }
  }
  return <>
    <Button type="button" variant={pressed.up ? 'secondary' : 'ghost'} size="icon-sm" aria-label="Good answer" title="Good answer" aria-pressed={pressed.up} disabled={busy || tools.disabled} onClick={() => void send('up')}><ThumbsUp /></Button>
    <Button type="button" variant={pressed.down ? 'secondary' : 'ghost'} size="icon-sm" aria-label="Bad answer" title="Bad answer" aria-pressed={pressed.down} disabled={busy || tools.disabled} onClick={() => void send('down')}><ThumbsDown /></Button>
    {error && <p role="alert" className="w-full text-xs text-destructive">{error}</p>}
  </>
}

/** The newest judgement of the versions, and a button to ask for another. */
function JudgePopover({ message, family, tools }: Props & { family: Family }) {
  const { reviews } = tools, { sessionId } = message, rootId = family.rootId
  const load = useCallback((signal: AbortSignal) => reviews.judgements(sessionId, rootId, signal), [reviews, sessionId, rootId])
  const { items, error, setError, setOpen, add } = useOpenedList<Judgement>(load)
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true); setError(null)
    try { add(await reviews.judge(sessionId, rootId)) } catch (failure) { setError(chatFeatureMessage(failure)) } finally { setBusy(false) }
  }
  const latest = items?.[0]
  return <Popover onOpenChange={setOpen}>
    <PopoverTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Judge versions" title="Judge versions" />}><Scale /></PopoverTrigger>
    <PopoverContent align="start" className={popup}>
      <div className="space-y-3">
        {items === null && !error && <p className="text-xs text-muted-foreground">Loading…</p>}
        {items !== null && !latest && <p className="text-sm text-muted-foreground">Nobody has judged these versions yet. The judge does not see which model wrote which.</p>}
        {latest && <ul className="space-y-2">
          {latest.scores.map(score => <li key={score.messageId} className="space-y-0.5">
            <p className="flex flex-wrap items-center gap-2 text-sm">Version {family.versions.indexOf(score.messageId) + 1} · {score.score}/10{score.messageId === latest.winner && <Badge variant="success">Best</Badge>}</p>
            <p className="text-xs text-muted-foreground">{score.reason}</p>
          </li>)}
          {latest.excluded.length > 0 && <li className="text-xs text-muted-foreground">{latest.excluded.length} not scored: written by the judge's own model.</li>}
        </ul>}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        <Button type="button" size="sm" className="w-full" disabled={busy || tools.disabled || items === null} onClick={() => void run()}>{busy ? 'Judging…' : latest ? 'Judge again' : 'Judge'}</Button>
      </div>
    </PopoverContent>
  </Popover>
}

/** The newest fact check of this answer, and a button to run another. */
function FactCheckPopover({ message, tools }: Props) {
  const { reviews } = tools, { sessionId, id } = message
  const load = useCallback((signal: AbortSignal) => reviews.factChecks(sessionId, id, signal), [reviews, sessionId, id])
  const { items, error, setError, setOpen, add } = useOpenedList<FactCheck>(load)
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true); setError(null)
    try { add(await reviews.factCheck(sessionId, id)) } catch (failure) { setError(chatFeatureMessage(failure)) } finally { setBusy(false) }
  }
  const latest = items?.[0]
  return <Popover onOpenChange={setOpen}>
    <PopoverTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Check facts" title="Check facts" />}><ShieldCheck /></PopoverTrigger>
    <PopoverContent align="start" className={popup}>
      <div className="space-y-3">
        {items === null && !error && <p className="text-xs text-muted-foreground">Loading…</p>}
        {items !== null && !latest && <p className="text-sm text-muted-foreground">This answer has not been checked yet.</p>}
        {latest && <>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="success">Supported {latest.counts.supported}</Badge>
            <Badge variant="error">Contradicted {latest.counts.contradicted}</Badge>
            <Badge variant="secondary">No source {latest.counts.noSource}</Badge>
          </div>
          <ul className="space-y-3">
            {latest.claims.map((claim, index) => <li key={index} className="space-y-1">
              <Badge variant={markVariant[claim.mark]}>{markWords[claim.mark]}</Badge>
              <p className="break-words text-sm">{claim.claim}</p>
              {claim.note && <p className="text-xs text-muted-foreground">{claim.note}</p>}
              {claim.sources.length > 0 && <p className="flex flex-wrap gap-x-2 text-xs">
                {claim.sources.map(sourceId => {
                  const source = latest.sources.find(item => item.id === sourceId)
                  if (!source) return null
                  return source.url
                    ? <a key={sourceId} href={source.url} target="_blank" rel="noreferrer" className="break-all underline underline-offset-2">{source.title}</a>
                    : <span key={sourceId} className="text-muted-foreground">{source.title}</span>
                })}
              </p>}
            </li>)}
          </ul>
          {latest.sourcesTruncated && <p className="text-xs text-muted-foreground">Some sources were too long to read in full.</p>}
        </>}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        <Button type="button" size="sm" className="w-full" disabled={busy || tools.disabled || items === null} onClick={() => void run()}>{busy ? 'Checking…' : latest ? 'Check again' : 'Check'}</Button>
      </div>
    </PopoverContent>
  </Popover>
}

/** Reviews of one answer: the owner's vote, a blind judge of its versions and a fact check. */
export function AnswerReviews({ message, tools }: Props) {
  const { family } = message
  // Keyed by version, so switching versions never shows another version's votes or checks.
  return <div key={message.id} className="flex max-w-full flex-wrap items-center gap-1">
    {family && <VoteButtons message={message} family={family} tools={tools} />}
    {family && family.versions.length >= 2 && <JudgePopover message={message} family={family} tools={tools} />}
    <FactCheckPopover message={message} tools={tools} />
  </div>
}
