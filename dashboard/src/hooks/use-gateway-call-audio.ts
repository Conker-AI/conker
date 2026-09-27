import { useCallback, useEffect, useRef, useState } from 'react'

const MAX_WAV_BYTES = 10 * 1024 * 1024

type Capture = {
  stream: MediaStream
  context: AudioContext
  source: MediaStreamAudioSourceNode
  processor: ScriptProcessorNode
  sink: GainNode
  chunks: Int16Array[]
  frames: number
  sampleRate: number
}

function release(value: Capture) {
  value.processor.onaudioprocess = null
  value.source.disconnect()
  value.processor.disconnect()
  value.sink.disconnect()
  value.stream.getTracks().forEach(track => track.stop())
  void value.context.close().catch(() => undefined)
}

function wav(value: Capture) {
  const bytes = new Uint8Array(44 + value.frames * 2)
  const view = new DataView(bytes.buffer)
  const text = (offset: number, data: string) => { for (let index = 0; index < data.length; index++) view.setUint8(offset + index, data.charCodeAt(index)) }
  text(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, value.sampleRate, true); view.setUint32(28, value.sampleRate * 2, true)
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, value.frames * 2, true)
  let offset = 44
  for (const chunk of value.chunks) {
    for (const sample of chunk) { view.setInt16(offset, sample, true); offset += 2 }
  }
  return bytes
}

function decodeBase64(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

/** Owns ephemeral microphone capture and playback. Nothing is retained on cleanup. */
export function useGatewayCallAudio(disabled = false) {
  const capture = useRef<Capture | null>(null)
  const generation = useRef(0)
  const disabledRef = useRef(disabled)
  const audio = useRef<HTMLAudioElement | null>(null)
  const objectUrl = useRef<string | null>(null)
  const startedAt = useRef(0)
  const [recording, setRecording] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [level, setLevel] = useState(0)
  const [limitReached, setLimitReached] = useState(false)
  const [error, setError] = useState('')

  const disposePlayback = useCallback(() => {
    audio.current?.pause()
    if (audio.current) audio.current.src = ''
    audio.current = null
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    objectUrl.current = null
  }, [])

  const stopPlayback = useCallback(() => {
    disposePlayback()
    setPlaying(false)
  }, [disposePlayback])

  const disposeCapture = useCallback(() => {
    generation.current++
    const current = capture.current
    capture.current = null
    if (current) release(current)
  }, [])

  const cancel = useCallback(() => {
    disposeCapture()
    setRecording(false); setDuration(0); setLevel(0); setLimitReached(false)
  }, [disposeCapture])

  const start = useCallback(async () => {
    if (disabled || capture.current) return false
    const selectedGeneration = ++generation.current
    stopPlayback(); setError(''); setLimitReached(false)
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError('Microphone capture needs Conker’s HTTPS address in a supported browser.')
      return false
    }
    let stream: MediaStream | null = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 }, video: false })
      if (disabledRef.current || selectedGeneration !== generation.current || capture.current) { stream.getTracks().forEach(track => track.stop()); return false }
      const context = new AudioContext()
      const source = context.createMediaStreamSource(stream)
      const processor = context.createScriptProcessor(4096, Math.max(1, Math.min(2, source.channelCount)), 1)
      const sink = context.createGain(); sink.gain.value = 0
      const value: Capture = { stream, context, source, processor, sink, chunks: [], frames: 0, sampleRate: context.sampleRate }
      const maxFrames = Math.min(Math.floor((MAX_WAV_BYTES - 44) / 2), context.sampleRate * 120)
      processor.onaudioprocess = event => {
        if (capture.current !== value) return
        const channels = event.inputBuffer.numberOfChannels
        const available = Math.min(event.inputBuffer.length, maxFrames - value.frames)
        if (available <= 0) { setLimitReached(true); return }
        const output = new Int16Array(available)
        let energy = 0
        for (let frame = 0; frame < available; frame++) {
          let sample = 0
          for (let channel = 0; channel < channels; channel++) sample += event.inputBuffer.getChannelData(channel)[frame] / channels
          sample = Math.max(-1, Math.min(1, sample)); energy += sample * sample
          output[frame] = sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767)
        }
        value.chunks.push(output); value.frames += available
        setLevel(Math.min(1, Math.sqrt(energy / available) * 4))
        if (value.frames >= maxFrames) setLimitReached(true)
      }
      source.connect(processor); processor.connect(sink); sink.connect(context.destination)
      try { await context.resume() } catch (cause) { release(value); throw cause }
      if (disabledRef.current || selectedGeneration !== generation.current) { release(value); return false }
      capture.current = value; startedAt.current = performance.now(); setDuration(0); setRecording(true)
      return true
    } catch (cause) {
      stream?.getTracks().forEach(track => track.stop())
      const denied = cause instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(cause.name)
      setError(denied ? 'Microphone access was blocked. Allow it in browser site settings, then try again.' : 'The microphone could not be opened. Check that it is connected and not in use elsewhere.')
      return false
    }
  }, [disabled, stopPlayback])

  const finish = useCallback(() => {
    const current = capture.current
    capture.current = null
    generation.current++
    if (!current) return null
    release(current); setRecording(false); setLevel(0); setLimitReached(false)
    if (!current.frames) { setError('No microphone audio was captured. Try again when you are ready to speak.'); return null }
    return wav(current)
  }, [])

  const play = useCallback((base64: string, mime: 'audio/wav') => {
    stopPlayback()
    try {
      const url = URL.createObjectURL(new Blob([decodeBase64(base64)], { type: mime }))
      const element = new Audio(url); objectUrl.current = url; audio.current = element
      element.onended = stopPlayback; element.onerror = () => { stopPlayback(); setError('The generated reply could not be played. Its text is still saved in the call.') }
      setPlaying(true)
      void element.play().catch(() => { stopPlayback(); setError('Playback was blocked. Use the speaker control after interacting with the page.') })
    } catch { setError('The generated reply was invalid. Its text is still saved in the call.') }
  }, [stopPlayback])

  useEffect(() => {
    if (!recording) return
    const timer = window.setInterval(() => setDuration((performance.now() - startedAt.current) / 1000), 100)
    return () => window.clearInterval(timer)
  }, [recording])
  useEffect(() => {
    disabledRef.current = disabled
    if (!disabled) return
    disposeCapture(); disposePlayback()
    const frame = requestAnimationFrame(() => { setRecording(false); setPlaying(false); setDuration(0); setLevel(0); setLimitReached(false) })
    return () => cancelAnimationFrame(frame)
  }, [disabled, disposeCapture, disposePlayback])
  useEffect(() => () => { disposeCapture(); disposePlayback() }, [disposeCapture, disposePlayback])

  return { recording, playing, duration, level, limitReached, error, clearError: () => setError(''), start, finish, cancel, play, stopPlayback }
}
