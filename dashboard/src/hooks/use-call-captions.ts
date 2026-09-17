import { useEffect, useState } from "react"
import { conkerClient } from "@/lib/api"
import type { VoiceInputSession } from "@/lib/voice/types"

/** Optional browser captions. Never sends a turn or changes the conversation draft. */
export function useCallCaptions(stream: MediaStream | null, device: string, ended: boolean, speaking: boolean) {
  const [enabled, setEnabled] = useState(false)
  const [text, setText] = useState("")
  const [error, setError] = useState("")
  const [listening, setListening] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!enabled || !stream || ended || speaking) return
    const support = conkerClient.voiceInput.availability()
    const controller = new AbortController()
    let session: VoiceInputSession | undefined
    let restart: ReturnType<typeof setTimeout> | undefined
    let failed = false, history = "", current = ""
    const start = async () => {
      if (controller.signal.aborted) return
      setError("")
      if (!support.supported || device !== "default") {
        setError(device !== "default" ? "Live captions use the system default microphone. Select System default in call settings." : support.reason || "Live captions are unavailable in this browser.")
        return
      }
      try {
        const next = await conkerClient.voiceInput.start({
          inputStream: stream, language: "en-US", signal: controller.signal,
          onStart: () => { if (!controller.signal.aborted) setListening(true) },
          onLevel: () => {}, // The call already owns its microphone meter.
          onTranscript: value => {
            if (controller.signal.aborted) return
            current = [value.final, value.interim].filter(Boolean).join(" ")
            setText([history, current].filter(Boolean).join(" ").slice(-4000))
          },
          onError: (message, code) => {
            // Silence ends browser recognition sessions; a call keeps listening.
            if (code === "no-speech") return
            if (!controller.signal.aborted) { failed = true; setError(message) }
          },
          onEnd: () => {
            if (controller.signal.aborted) return
            setListening(false)
            if (!failed) {
              history = [history, current].filter(Boolean).join(" ").slice(-4000)
              current = ""
              restart = setTimeout(() => void start(), 500)
            }
          },
        })
        if (controller.signal.aborted) next.cancel(); else session = next
      } catch (cause) {
        if (!controller.signal.aborted) { failed = true; clearTimeout(restart); setListening(false); setError(cause instanceof Error ? cause.message : "Captions could not start. Try again.") }
      }
    }
    void start()
    return () => { controller.abort(); clearTimeout(restart); session?.cancel(); setListening(false) }
  }, [enabled, stream, device, ended, speaking, attempt])
  return { enabled, setEnabled, text, listening: listening && !!stream && enabled && !ended && !speaking, error, retry: () => setAttempt(value => value + 1) }
}
