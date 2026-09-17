import { useCallback, useEffect, useRef, useState } from "react"
import { useCallWorkspace } from "@/lib/call-workspace"
import { readAloud } from "@/lib/voice/read-aloud"

type Kind = "microphone" | "camera"
export function useCallMedia(callId?: string, ended = false) {
  const streams = useRef<Partial<Record<Kind, MediaStream>>>({})
  const generations = useRef({ microphone: 0, camera: 0 })
  const [camera, setCamera] = useState<MediaStream | null>(null)
  const [microphone, setMicrophone] = useState<MediaStream | null>(null)
  const [requesting, setRequesting] = useState<Kind | null>(null)
  const [error, setError] = useState("")
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selected, setSelected] = useState({ microphone: "default", camera: "default" })
  const [level, setLevel] = useState(0)
  const release = useCallback((kind: Kind) => {
    generations.current[kind]++
    streams.current[kind]?.getTracks().forEach(track => { track.onended = null; track.stop() })
    delete streams.current[kind]
  }, [])
  useEffect(() => {
    if (!callId || ended) return
    const clearChannels = () => {
      const workspace = useCallWorkspace.getState()
      if (workspace.call?.id === callId && !workspace.call.endedAt && (workspace.call.channels.microphone || workspace.call.channels.camera)) {
        void workspace.configure({ channels: { microphone: false, camera: false } })
      }
    }
    // A remount/refresh must not leave the session claiming devices are still open.
    clearChannels()
    const unload = () => { release("microphone"); release("camera"); clearChannels() }
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    window.addEventListener("pagehide", unload)
    window.addEventListener("beforeunload", warn)
    return () => { unload(); window.removeEventListener("pagehide", unload); window.removeEventListener("beforeunload", warn) }
  }, [callId, ended, release])
  useEffect(() => {
    if (!microphone || ended) return
    let audio: AudioContext | undefined, timer: ReturnType<typeof setInterval> | undefined
    try {
      audio = new AudioContext()
      const analyser = audio.createAnalyser(); analyser.fftSize = 256
      audio.createMediaStreamSource(microphone).connect(analyser)
      const samples = new Uint8Array(analyser.fftSize)
      void audio.resume().catch(() => {})
      timer = setInterval(() => {
        analyser.getByteTimeDomainData(samples)
        const energy = samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0)
        setLevel(Math.min(1, Math.sqrt(energy / samples.length) * 5))
      }, 100)
    } catch { /* Capture still works if the optional local meter is unsupported. */ }
    return () => { clearInterval(timer); void audio?.close().catch(() => {}) }
  }, [microphone, ended])
  const toggle = async (kind: Kind, device?: string) => {
    if (!callId || ended || requesting) return
    const wasOn = !!streams.current[kind]
    release(kind)
    if (kind === "camera") setCamera(null); else setMicrophone(null)
    await useCallWorkspace.getState().configure({ channels: { [kind]: false } })
    if (wasOn && device === undefined) return
    if (useCallWorkspace.getState().call?.id !== callId || useCallWorkspace.getState().call?.endedAt) return
    if (!navigator.mediaDevices?.getUserMedia) { setError("Device preview needs a supported browser on HTTPS or localhost. You can still type."); return }
    const generation = generations.current[kind]
    const deviceId = device ?? selected[kind]
    setRequesting(kind); setError(""); readAloud.stop()
    try {
      const constraints = deviceId === "default" ? {} : { deviceId: { exact: deviceId } }
      const stream = await navigator.mediaDevices.getUserMedia(kind === "camera"
        ? { video: { ...constraints, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 24 } }, audio: false }
        : { audio: { ...constraints, echoCancellation: true, noiseSuppression: true }, video: false })
      const current = useCallWorkspace.getState().call
      if (generations.current[kind] !== generation || current?.id !== callId || current.endedAt) { stream.getTracks().forEach(track => track.stop()); return }
      streams.current[kind] = stream
      if (kind === "camera") setCamera(stream); else setMicrophone(stream)
      stream.getTracks().forEach(track => { track.onended = () => {
        release(kind)
        if (kind === "camera") setCamera(null); else setMicrophone(null)
        void useCallWorkspace.getState().configure({ channels: { [kind]: false } })
        setError(`${kind === "camera" ? "Camera" : "Microphone"} disconnected. Reconnect it and try again, or keep typing.`)
      } })
      await useCallWorkspace.getState().configure({ channels: { [kind]: true } })
      setDevices(await navigator.mediaDevices.enumerateDevices().catch(() => []))
    } catch (cause) {
      if (generations.current[kind] !== generation) return
      const denied = cause instanceof DOMException && (cause.name === "NotAllowedError" || cause.name === "SecurityError")
      setError(denied ? `${kind === "camera" ? "Camera" : "Microphone"} access was blocked. Allow it in browser site settings, then try again. You can still type.` : `Couldn't open your ${kind}. Check that it is connected and available, then try again.`)
    } finally { setRequesting(null) }
  }
  const choose = (kind: Kind, id: string) => {
    setSelected(value => ({ ...value, [kind]: id }))
    if (streams.current[kind]) void toggle(kind, id)
  }
  return { camera: camera?.active ? camera : null, microphone: microphone?.active ? microphone : null, level: microphone?.active ? level : 0, requesting, error, devices, selected, choose, toggle, clearError: () => setError("") }
}
export type CallMedia = ReturnType<typeof useCallMedia>
