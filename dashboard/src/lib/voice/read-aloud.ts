export type SpeechProgress = {
  key: string; text: string; status: "playing" | "paused" | "finished" | "stopped"
  wordStart: number; wordEnd: number; spokenUntil: number; timing: "pending" | "word"
}
type Playback = { key: string; utterance?: SpeechSynthesisUtterance; paused: boolean; next?: () => void }
let playback: Playback | null = null
let progress: SpeechProgress | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(listener => listener())
const update = (patch: Partial<SpeechProgress>) => { if (progress) progress = { ...progress, ...patch }; emit() }

export const readAloud = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
  getSnapshot: () => playback?.key || null,
  getProgressSnapshot: () => progress,
  supported: () => typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window,
  prepare() { if (readAloud.supported()) window.speechSynthesis.getVoices() },
  stop(key?: string) {
    if (!playback || (key && playback.key !== key)) return
    playback = null
    window.speechSynthesis.cancel()
    update({ status: "stopped", wordStart: -1, wordEnd: -1 })
  },
  pause(key: string) {
    if (!playback || playback.key !== key || playback.paused) return
    playback.paused = true
    window.speechSynthesis.pause()
    update({ status: "paused" })
  },
  resume(key: string) {
    const run = playback
    if (!run || run.key !== key || !run.paused) return
    run.paused = false
    window.speechSynthesis.resume()
    update({ status: "playing" })
    if (run.next) { const next = run.next; run.next = undefined; next() }
  },
  start(key: string, text: string, onError: (message: string) => void, options?: { language?: string; preferLocalVoice?: boolean }) {
    if (!readAloud.supported()) { onError("Read aloud is unavailable in this browser."); return }
    readAloud.stop()
    // Preserve absolute offsets across short utterances, including intervening whitespace.
    const chunks = [...text.matchAll(/[\s\S]{1,200}(?:\s|$)|[\s\S]{1,200}/g)]
      .filter(match => match[0].trim()).map(match => ({ text: match[0].trim(), offset: match.index + match[0].search(/\S/) }))
    if (!chunks.length) return
    const run: Playback = { key, paused: false }
    playback = run
    progress = { key, text, status: "playing", wordStart: -1, wordEnd: -1, spokenUntil: 0, timing: "pending" }
    emit()
    const finish = (status: "finished" | "stopped") => {
      if (playback !== run) return
      playback = null
      update({ status, wordStart: -1, wordEnd: -1, ...(status === "finished" ? { spokenUntil: text.length } : {}) })
    }
    const next = () => {
      if (playback !== run) return
      if (run.paused) { run.next = next; return }
      const chunk = chunks.shift()
      if (!chunk) { finish("finished"); return }
      const utterance = new SpeechSynthesisUtterance(chunk.text)
      if (options?.language) utterance.lang = options.language
      if (options?.preferLocalVoice) {
        const voices = window.speechSynthesis.getVoices()
        const local = voices.filter(voice => voice.localService && voice.lang.toLowerCase().startsWith((options.language || "en").slice(0, 2)))
        utterance.voice = local.find(voice => voice.default) || local[0] || null
      }
      run.utterance = utterance
      utterance.onboundary = event => {
        if (playback !== run || run.paused || event.name !== "word") return
        const start = chunk.offset + event.charIndex
        const word = text.slice(start).match(/^\S+/)?.[0]
        if (!word) return
        update({ wordStart: start, wordEnd: start + word.length, spokenUntil: start, timing: "word" })
      }
      utterance.onend = () => {
        if (playback !== run) return
        update({ spokenUntil: chunk.offset + chunk.text.length, wordStart: -1, wordEnd: -1 })
        next()
      }
      utterance.onerror = event => {
        if (playback !== run) return
        finish("stopped")
        if (event.error !== "canceled" && event.error !== "interrupted") onError("Your browser couldn’t read this message aloud. Try again or check its speech settings.")
      }
      try {
        if (window.speechSynthesis.paused) window.speechSynthesis.resume()
        window.speechSynthesis.speak(utterance)
      }
      catch { finish("stopped"); onError("Read aloud couldn’t start. Check your browser’s speech settings.") }
    }
    next()
  },
}
