import { useEffect, useRef, useState, type RefObject } from 'react'
import { Mic, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { browserVoiceInput } from '@/lib/voice/browser-voice-input'
import { insertTranscript, type DraftAnchor } from '@/lib/voice/draft'
import type { VoiceInputSession, VoiceTranscript } from '@/lib/voice/types'

type Recording = { controller: AbortController; session?: VoiceInputSession; anchor: DraftAnchor; transcript: VoiceTranscript }

export function NewChatVoiceControl({ value, onChange, input, disabled }: { value: string; onChange: (value: string) => void; input: RefObject<HTMLTextAreaElement | null>; disabled: boolean }) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState('')
  const recording = useRef<Recording | null>(null)

  const finish = (run: Recording) => {
    if (recording.current !== run) return
    recording.current = null
    const words = [run.transcript.final, run.transcript.interim].filter(Boolean).join(' ')
    if (words) onChange(insertTranscript(run.anchor.text, words, run.anchor).text)
    setListening(false)
    requestAnimationFrame(() => input.current?.focus())
  }
  const stop = () => recording.current?.session?.stop()
  const start = async () => {
    if (recording.current) return stop()
    setError('')
    const support = browserVoiceInput.availability()
    if (!support.supported) { setError(support.reason ?? 'Voice typing is unavailable.'); return }
    const run: Recording = { controller: new AbortController(), anchor: { text: value, start: input.current?.selectionStart ?? value.length, end: input.current?.selectionEnd ?? value.length }, transcript: { final: '', interim: '' } }
    recording.current = run
    try {
      const session = await browserVoiceInput.start({
        language: 'en-US', signal: run.controller.signal,
        onStart: () => { if (recording.current === run) setListening(true) },
        onTranscript: transcript => {
          if (recording.current !== run) return
          run.transcript = transcript
          const words = [transcript.final, transcript.interim].filter(Boolean).join(' ')
          onChange(insertTranscript(run.anchor.text, words, run.anchor).text.slice(0, 16_000))
        },
        onLevel: () => {},
        onError: message => { if (recording.current === run) setError(message) },
        onEnd: () => finish(run),
      })
      if (recording.current === run) run.session = session
      else session.cancel()
    } catch (cause) {
      if (recording.current === run) { setError(cause instanceof Error ? cause.message : 'Voice typing could not start.'); finish(run) }
    }
  }
  useEffect(() => () => { const run = recording.current; recording.current = null; run?.controller.abort(); run?.session?.cancel() }, [])

  return <Tooltip>
    <TooltipTrigger asChild><Button type="button" variant={listening ? 'secondary' : 'ghost'} size="icon" className="size-9 shrink-0 rounded-full" aria-label={listening ? 'Stop voice typing' : 'Start voice typing'} aria-pressed={listening} disabled={disabled} onClick={() => void start()}>{listening ? <Square className="size-3.5" /> : <Mic />}</Button></TooltipTrigger>
    <TooltipContent side="top" className="max-w-72">{error || (listening ? 'Stop voice typing' : 'Voice typing')}</TooltipContent>
  </Tooltip>
}
