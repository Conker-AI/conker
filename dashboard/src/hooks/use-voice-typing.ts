import { useEffect, useRef, useState, type RefObject } from "react"
import { conkerClient } from "@/lib/api"
import { useConkerStore } from "@/lib/api/store"
import { insertTranscript, MESSAGE_LIMIT, type DraftAnchor } from "@/lib/voice/draft"
import type { VoiceInputSession, VoiceTranscript } from "@/lib/voice/types"

type Phase = "idle" | "requesting" | "listening" | "finishing"
type Recording = {
  controller: AbortController
  session?: VoiceInputSession
  anchor: DraftAnchor
  transcript: VoiceTranscript
  finishing: boolean
  focus: boolean
}
const emptyTranscript: VoiceTranscript = { final: "", interim: "" }

export function useVoiceTyping(sessionId: string, input: RefObject<HTMLTextAreaElement | null>) {
  const [phase, setPhase] = useState<Phase>("idle")
  const [transcript, setTranscript] = useState(emptyTranscript)
  const [levels, setLevels] = useState<number[]>(Array(64).fill(0))
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState("")
  const recording = useRef<Recording | null>(null)
  const finishRef = useRef<() => void>(() => {})

  const commit = (run: Recording) => {
    const store = useConkerStore.getState()
    const words = [run.transcript.final, run.transcript.interim].filter(Boolean).join(" ")
    const result = insertTranscript(store.drafts[sessionId] || "", words, run.anchor)
    if (words) store.setDraft(sessionId, result.text)
    return result
  }

  const finish = (run: Recording) => {
    if (recording.current !== run) return
    recording.current = null
    const result = commit(run)
    setPhase("idle")
    if (result.text.length > MESSAGE_LIMIT) setError("Your words are kept. Shorten the draft to 4,000 characters before sending.")
    if (run.focus) requestAnimationFrame(() => {
      input.current?.focus()
      input.current?.setSelectionRange(result.caret, result.caret)
    })
  }

  const stop = () => {
    const run = recording.current
    if (!run || run.finishing) return
    run.finishing = true
    setPhase("finishing")
    if (run.session) run.session.stop()
    else { finish(run); run.controller.abort() }
  }

  const cancel = () => {
    const run = recording.current
    recording.current = null
    run?.controller.abort()
    run?.session?.cancel()
    setPhase("idle")
    setError("")
    requestAnimationFrame(() => input.current?.focus())
  }

  const start = async (language: string) => {
    if (recording.current) return
    setError("")
    const available = conkerClient.voiceInput.availability()
    if (!available.supported) { setError(available.reason || "Voice typing is unavailable."); return }
    const text = useConkerStore.getState().drafts[sessionId] || ""
    if (text.length >= MESSAGE_LIMIT) { setError("Your draft is full. Shorten it before adding more speech."); return }
    const run: Recording = {
      controller: new AbortController(),
      anchor: { text, start: input.current?.selectionStart ?? text.length, end: input.current?.selectionEnd ?? text.length },
      transcript: emptyTranscript,
      finishing: false,
      focus: true,
    }
    recording.current = run
    setTranscript(emptyTranscript)
    setLevels(Array(64).fill(0))
    setSeconds(0)
    setPhase("requesting")
    try {
      const session = await conkerClient.voiceInput.start({
        language,
        signal: run.controller.signal,
        onStart: () => { if (recording.current === run && !run.finishing) setPhase("listening") },
        onTranscript: value => {
          if (recording.current !== run) return
          run.transcript = value
          setTranscript(value)
          const words = [value.final, value.interim].filter(Boolean).join(" ")
          if (insertTranscript(run.anchor.text, words, run.anchor).text.length >= MESSAGE_LIMIT) stop()
        },
        onLevel: level => { if (recording.current === run && !run.finishing) setLevels(values => [...values.slice(1), level]) },
        onError: message => { if (recording.current === run) setError(message) },
        onEnd: () => finish(run),
      })
      if (recording.current !== run) session.cancel()
      else { run.session = session; if (run.finishing) session.stop() }
    } catch (cause) {
      if (run.controller.signal.aborted) return
      setError(cause instanceof Error ? cause.message : "Voice typing couldn’t start. Try again.")
      finish(run)
    }
  }

  useEffect(() => {
    if (phase !== "listening") return
    const timer = setInterval(() => setSeconds(value => value + 1), 1000)
    return () => clearInterval(timer)
  }, [phase])

  // Route changes and backgrounding always release the microphone. Retain the words already heard.
  useEffect(() => {
    finishRef.current = () => {
      const run = recording.current
      if (!run) return
      run.focus = false
      recording.current = null
      commit(run)
      run.controller.abort()
      run.session?.cancel()
    }
  })
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && recording.current) { finishRef.current(); setPhase("idle") }
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => { document.removeEventListener("visibilitychange", onVisibility); finishRef.current() }
  }, [])

  return { phase, active: phase !== "idle", transcript, levels, seconds, error, start, stop, cancel, clearError: () => setError("") }
}
