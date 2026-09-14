import type { VoiceInputClient, VoiceInputOptions, VoiceInputSession } from "./types"

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } }
type Recognition = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
  onresult: ((event: { results: ArrayLike<RecognitionResult> }) => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition
  webkitSpeechRecognition?: new () => Recognition
}

const errorMessages: Record<string, string> = {
  "not-allowed": "Microphone access was blocked. Allow it in your browser’s site settings, then try again.",
  "service-not-allowed": "Your browser’s speech service is unavailable. Try voice typing in Chrome or Safari.",
  "audio-capture": "No microphone is available. Connect one and try again.",
  "network": "Transcription lost its connection. Your captured words are kept; check your connection and try again.",
  "no-speech": "No speech was detected. Try again when you’re ready.",
  "language-not-supported": "This speech service does not support that language. Choose another language in Tools.",
}

function recognitionConstructor() {
  if (typeof window === "undefined") return undefined
  const browser = window as SpeechWindow
  return browser.SpeechRecognition || browser.webkitSpeechRecognition
}

function availability() {
  if (typeof window === "undefined" || !window.isSecureContext) return { supported: false, reason: "Voice typing needs HTTPS or localhost. Open a secure connection and try again." }
  if (!recognitionConstructor() || !navigator.mediaDevices?.getUserMedia) return { supported: false, reason: "Voice typing isn’t available in this browser. Try Chrome or Safari, or continue typing." }
  return { supported: true }
}

function microphoneError(error: unknown) {
  if (error instanceof Error) {
    if (["NotAllowedError", "SecurityError"].includes(error.name)) return errorMessages["not-allowed"]
    if (["NotFoundError", "NotReadableError"].includes(error.name)) return "Your microphone couldn’t be opened. Check that it is connected and available, then try again."
  }
  return "Voice typing couldn’t start. Check your microphone and try again."
}

/** Real browser transcription. No recorded audio or recognition history is stored by Conker. */
export const browserVoiceInput: VoiceInputClient = {
  availability,
  async start(options: VoiceInputOptions): Promise<VoiceInputSession> {
    const support = availability()
    const SpeechRecognition = recognitionConstructor()
    if (!support.supported || !SpeechRecognition) throw new Error(support.reason)
    const { signal } = options
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError")

    let media: MediaStream | undefined
    let audio: AudioContext | undefined
    let source: MediaStreamAudioSourceNode | undefined
    let sampleTimer: ReturnType<typeof setInterval> | undefined
    let finishTimer: ReturnType<typeof setTimeout> | undefined
    let startTimer: ReturnType<typeof setTimeout> | undefined
    let ended = false
    let started = false
    let stopping = false
    const recognition = new SpeechRecognition()

    const releaseAudio = () => {
      clearInterval(sampleTimer)
      source?.disconnect()
      media?.getTracks().forEach(track => track.stop())
      if (audio && audio.state !== "closed") void audio.close().catch(() => {})
    }
    const end = (abort = false) => {
      if (ended) return
      ended = true
      clearTimeout(startTimer)
      clearTimeout(finishTimer)
      signal.removeEventListener("abort", cancel)
      recognition.onstart = recognition.onresult = recognition.onerror = recognition.onend = null
      if (abort) { try { recognition.abort() } catch { /* Already stopped. */ } }
      releaseAudio()
      options.onEnd()
    }
    const cancel = () => end(true)
    signal.addEventListener("abort", cancel, { once: true })

    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false })
      if (ended || signal.aborted) {
        releaseAudio()
        throw new DOMException("Cancelled", "AbortError")
      }

      // The meter samples the microphone; it never manufactures listening activity.
      // Meter failure should not prevent an otherwise working speech recognizer.
      try {
        audio = new AudioContext()
        if (audio.state === "suspended") void audio.resume().catch(() => {})
        const analyser = audio.createAnalyser()
        analyser.fftSize = 512
        source = audio.createMediaStreamSource(media)
        source.connect(analyser)
        const samples = new Uint8Array(analyser.fftSize)
        sampleTimer = setInterval(() => {
          if (ended || stopping) return
          analyser.getByteTimeDomainData(samples)
          const power = samples.reduce((sum, sample) => sum + ((sample - 128) / 128) ** 2, 0) / samples.length
          options.onLevel(Math.min(1, Math.sqrt(power) * 5))
        }, 60)
      } catch { options.onLevel(0) }

      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = options.language
      recognition.onstart = () => { started = true; clearTimeout(startTimer); if (!ended && !stopping) options.onStart() }
      recognition.onresult = event => {
        if (ended) return
        const results = Array.from(event.results)
        options.onTranscript({
          final: results.filter(result => result.isFinal).map(result => result[0].transcript.trim()).filter(Boolean).join(" "),
          interim: results.filter(result => !result.isFinal).map(result => result[0].transcript.trim()).filter(Boolean).join(" "),
        })
      }
      recognition.onerror = event => {
        if (ended) return
        if (event.error !== "aborted") options.onError(errorMessages[event.error] || "Voice typing stopped unexpectedly. Your captured words are kept. Try again.")
        end(true)
      }
      recognition.onend = () => end()
      recognition.start()
      startTimer = setTimeout(() => {
        if (ended || stopping || started) return
        options.onError("The speech service didn’t respond. Check your connection and try again.")
        end(true)
      }, 12000)

      return {
        cancel,
        stop: () => {
          if (ended || stopping) return
          stopping = true
          clearTimeout(startTimer)
          releaseAudio()
          // Some engines deliver their last transcript after stop(). Give it a bounded window.
          finishTimer = setTimeout(() => end(true), 2500)
          try { recognition.stop() } catch { end(true) }
        },
      }
    } catch (error) {
      const aborted = signal.aborted || (error instanceof Error && error.name === "AbortError")
      end(true)
      if (aborted) throw new DOMException("Cancelled", "AbortError")
      throw new Error(microphoneError(error))
    }
  },
}
