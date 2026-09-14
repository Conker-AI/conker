type Playback = { key: string; utterance?: SpeechSynthesisUtterance }
let playback: Playback | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(listener => listener())

export const readAloud = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
  getSnapshot: () => playback?.key || null,
  supported: () => typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window,
  stop(key?: string) {
    if (!playback || (key && playback.key !== key)) return
    playback = null
    window.speechSynthesis.cancel()
    emit()
  },
  start(key: string, text: string, onError: (message: string) => void) {
    if (!readAloud.supported()) { onError("Read aloud is unavailable in this browser."); return }
    readAloud.stop()
    // Short utterances avoid browser speech engines stalling on long responses.
    const chunks = text.match(/[\s\S]{1,200}(?:\s|$)|[\s\S]{1,200}/g)?.map(chunk => chunk.trim()).filter(Boolean) || []
    if (!chunks.length) return
    const run: Playback = { key }
    playback = run
    emit()
    const finish = () => { if (playback === run) { playback = null; emit() } }
    const next = () => {
      if (playback !== run) return
      const chunk = chunks.shift()
      if (!chunk) { finish(); return }
      const utterance = new SpeechSynthesisUtterance(chunk)
      run.utterance = utterance
      utterance.onend = next
      utterance.onerror = event => {
        if (playback !== run) return
        finish()
        if (event.error !== "canceled" && event.error !== "interrupted") onError("Your browser couldn’t read this message aloud. Try again or check its speech settings.")
      }
      try { window.speechSynthesis.speak(utterance) }
      catch { finish(); onError("Read aloud couldn’t start. Check your browser’s speech settings.") }
    }
    next()
  },
}
