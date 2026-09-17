import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { Link } from "react-router-dom"
import { Captions, CaptionsOff, Check, Copy, Expand, Image, Keyboard, Maximize2, MessageSquare, Mic, MicOff, Minus, MoreHorizontal, Phone, PhoneOff, Play, Settings2, Square, Video, VideoOff, Volume2, VolumeX, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TooltipProvider } from "@/components/ui/tooltip"
import { TaskDialogContent } from "@/components/design-system"
import { CompanionPortrait } from "@/components/companion-portrait"
import { ConversationIncognito } from "@/components/conversation-incognito"
import { CharacterMedia } from "@/components/character-studio/media"
import { characterDraft } from "@/lib/api/character"
import { useConker } from "@/lib/api/store"
import { getAvailableModels } from "@/lib/api/model-catalogue"
import { useCallWorkspace } from "@/lib/call-workspace"
import { useCallMedia } from "@/hooks/use-call-media"
import { useCallCaptions } from "@/hooks/use-call-captions"
import { readAloud } from "@/lib/voice/read-aloud"
import type { CallSession } from "@/lib/api/call-types"
import { cn } from "@/lib/utils"
import { CallControl } from "./call-controls"
import { CallAudio } from "./call-audio"
import { callDuration } from "@/lib/call-time"
import { CallComposer, CallTranscript } from "./call-transcript"
import { CallDetails } from "./call-details"
import "./call.css"

function CameraPreview({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    element.srcObject = stream
    void element.play().catch(() => {})
    return () => { element.srcObject = null }
  }, [stream])
  return <video ref={ref} muted playsInline autoPlay aria-label="Your full camera frame" className="absolute inset-0 size-full object-contain" />
}

function CallExperience({ call }: { call: CallSession }) {
  const { view, minimize, expand, dismiss, configure, end, interrupt, error, start } = useCallWorkspace()
  const data = useConker(value => value)
  const profile = useMemo(() => characterDraft(data.profile), [data.profile])
  const models = getAvailableModels(data.modelsConfiguration)
  const isCompanion = call.conversationId === data.companionSessionId || data.agents.find(agent => agent.id === call.agentId)?.kind === "companion"
  const media = useCallMedia(call.id, !!call.endedAt)
  const playbackKey = `call:${call.id}`
  const currentPlayback = useSyncExternalStore(readAloud.subscribe, readAloud.getSnapshot)
  const speaking = currentPlayback === playbackKey
  const captions = useCallCaptions(media.microphone, media.selected.microphone, !!call.endedAt, !!currentPlayback)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [now, setNow] = useState(Date.now)
  const [copied, setCopied] = useState(false)
  const [corner, setCorner] = useState("top-right")
  const [invoker] = useState(() => document.activeElement instanceof HTMLElement ? document.activeElement : null)
  const miniRef = useRef<HTMLButtonElement>(null)
  const expandRef = useRef<HTMLButtonElement>(null)
  const [fullScreen, setFullScreen] = useState(false)
  const [screenError, setScreenError] = useState("")
  const duration = callDuration(call.startedAt, call.endedAt || now)
  const busy = call.phase === "thinking" || call.phase === "responding"
  const activity = speaking ? "speaking" : busy ? "thinking" : media.microphone ? "listening" : "idle"
  const latest = call.events.filter(event => event.kind === "assistant").at(-1)
  const sentCount = call.events.filter(event => event.kind === "user").length
  const close = () => {
    setSettingsOpen(false)
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    if (call.endedAt) dismiss(); else minimize()
  }
  const hangUp = () => {
    readAloud.stop(playbackKey)
    setSettingsOpen(false)
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    void end()
  }
  useEffect(() => {
    if (call.endedAt) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [call.endedAt])
  useEffect(() => {
    const change = () => setFullScreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", change)
    return () => document.removeEventListener("fullscreenchange", change)
  }, [])
  useEffect(() => {
    if (!call.channels.voice || call.endedAt) readAloud.stop(playbackKey)
    return () => readAloud.stop(playbackKey)
  }, [playbackKey, call.channels.voice, call.endedAt])
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch { setScreenError("Browser fullscreen is unavailable. The expanded call still works.") }
  }
  const copyTranscript = async () => {
    try {
      await navigator.clipboard.writeText(call.events.map(event => `[${callDuration(call.startedAt, event.at)}] ${event.kind === "user" ? "You" : event.kind === "assistant" ? `${call.name} (sample)` : "Session"}: ${event.text}`).join("\n\n"))
      setCopied(true)
    } catch { setScreenError("Clipboard unavailable. Copy the messages from the conversation before ending your next call.") }
  }
  const playReply = () => {
    if (speaking) readAloud.stop(playbackKey)
    else if (latest) readAloud.start(playbackKey, latest.text, setScreenError)
  }
  const restoreAfterCall = () => {
    const current = useCallWorkspace.getState().call
    if (current && !current.endedAt) return
    if (invoker && invoker !== document.body && invoker.isConnected && invoker.getClientRects().length) invoker.focus()
    if (!invoker || document.activeElement !== invoker || invoker === document.body) {
      const candidates = document.querySelectorAll<HTMLElement>('[aria-label="Start call"], [aria-label="Return to call"], [aria-label="Search pages"]')
      for (const candidate of candidates) {
        if (!candidate.getClientRects().length || candidate.matches(':disabled, [aria-disabled="true"]')) continue
        candidate.focus()
        if (document.activeElement === candidate) break
      }
    }
  }
  const participant = (small = false) => !call.channels.avatar
    ? <div role="img" aria-label={`${call.name}, conversation view`} className={cn("flex shrink-0 items-center justify-center rounded-xl border border-border bg-muted", small ? "size-12" : "call-portrait")}><MessageSquare className="size-5 text-muted-foreground" /></div>
    : isCompanion
      ? <CharacterMedia profile={profile} activity={activity} motion={call.mode === "character" && profile.studio.modes.character.motion} className={small ? "size-12" : "call-portrait"} />
      : <CompanionPortrait name={call.name} tone="graphite" className={small ? "size-12" : "call-portrait"} />

  return <TooltipProvider>
    {view === "mini" && !call.endedAt && createPortal(<section aria-label={`Minimized call with ${call.name}`} className={cn("call-mini fixed z-40 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-lg", corner === "top-right" ? "right-4 top-20" : corner === "bottom-left" ? "left-4 bottom-4" : "right-4 bottom-4")}>
      <div className="flex items-center gap-2 p-3">{participant(true)}<div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{call.name}</p><p className="text-xs text-muted-foreground">Preview · <span className="tabular-nums">{duration}</span></p></div><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Move mini call"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem onSelect={() => setCorner("top-right")}>Top right</DropdownMenuItem><DropdownMenuItem onSelect={() => setCorner("bottom-right")}>Bottom right</DropdownMenuItem><DropdownMenuItem onSelect={() => setCorner("bottom-left")}>Bottom left</DropdownMenuItem></DropdownMenuContent></DropdownMenu><Button ref={miniRef} size="icon" variant="ghost" aria-label="Expand call" onClick={expand}><Maximize2 /></Button></div>
      <div className="flex items-center justify-between gap-2 border-t border-border bg-muted p-3">
        <CallControl label={call.channels.microphone ? "Mute microphone" : "Unmute microphone"} icon={call.channels.microphone ? Mic : MicOff} active={call.channels.microphone} disabled={!!media.requesting} onClick={() => void media.toggle("microphone")} />
        <CallControl label={call.channels.camera ? "Turn camera off" : "Turn camera on"} icon={call.channels.camera ? Video : VideoOff} active={call.channels.camera} disabled={!!media.requesting} onClick={() => void media.toggle("camera")} />
        <CallAudio active={call.channels.microphone} level={media.level} speaking={speaking} label={speaking ? "Companion speaking with browser voice" : "Your microphone activity"} />
        <Button variant="destructive" size="icon" aria-label="End call" onClick={hangUp}><PhoneOff /></Button>
      </div>
      {captions.enabled && captions.text && <p className="line-clamp-2 border-t border-border px-3 py-2 text-xs leading-5">{captions.text}</p>}
      {media.error && <p role="alert" className="border-t border-border p-3 text-xs leading-5">{media.error}</p>}
      {(call.channels.microphone || call.channels.camera) && <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">{call.channels.microphone ? "Mic on" : "Mic off"} · {call.channels.camera ? "Camera on" : "Camera off"}{captions.enabled ? " · Browser captions" : " · Local preview"}</p>}
    </section>, document.body)}

    <Dialog open={view === "expanded"} onOpenChange={open => { if (!open) close() }}>
      <DialogContent showCloseButton={false} className={cn("call-window flex flex-col gap-0 overflow-hidden p-0", call.endedAt && "call-ended")}
        onInteractOutside={event => event.preventDefault()}
        onOpenAutoFocus={event => { event.preventDefault(); expandRef.current?.focus() }}
        onCloseAutoFocus={event => { event.preventDefault(); requestAnimationFrame(() => { if (!call.endedAt) miniRef.current?.focus(); else restoreAfterCall() }) }}>
        <header className="call-header flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
          <Phone className="hidden size-4 shrink-0 text-muted-foreground sm:block" />
          <div className="min-w-0 flex-1"><DialogTitle className="text-sm leading-5">{call.endedAt ? "Call ended" : "Call"}</DialogTitle><DialogDescription className="text-xs">{call.endedAt ? "Preview session" : "Preview"} · <span className="tabular-nums">{duration}</span></DialogDescription></div>
          {!call.endedAt && <>
            <Select value={call.modelId || ""} onValueChange={modelId => void configure({ modelId })} disabled={busy}><SelectTrigger aria-label="Call model" size="sm" className="call-model w-44"><SelectValue placeholder="Model">{models.find(model => model.id === call.modelId)?.name}</SelectValue></SelectTrigger><SelectContent>{models.map(model => <SelectItem key={model.id} value={model.id}>{model.name} · {data.modelsConfiguration.providers.find(provider => provider.id === model.providerId)?.name}</SelectItem>)}</SelectContent></Select>
            <ConversationIncognito scope="call" privacy={{ memoryDisabled: call.privacy.memory, harnessDisabled: call.privacy.harness }} busy={false} onChange={patch => void configure({ privacy: { ...(patch.memoryDisabled === undefined ? {} : { memory: patch.memoryDisabled }), ...(patch.harnessDisabled === undefined ? {} : { harness: patch.harnessDisabled }) } })} onInspect={() => setSettingsOpen(true)} />
            <CallControl label="Call settings" icon={Settings2} onClick={() => setSettingsOpen(true)} />
            <span className="hidden sm:contents"><CallControl label={fullScreen ? "Exit fullscreen" : "Fullscreen call"} icon={Expand} onClick={() => void fullscreen()} /></span>
            <Button ref={expandRef} variant="ghost" size="icon" aria-label="Minimize call" onClick={close}><Minus /></Button>
          </>}
          {call.endedAt && <Button ref={expandRef} variant="ghost" size="icon" aria-label="Close call summary" onClick={close}><X /></Button>}
        </header>

        {call.endedAt ? <div className="space-y-6 p-6">
          <div className="flex items-center gap-4">{participant(true)}<div><p className="font-medium">Until next time, {data.auth.ownerName || "you"}.</p><p className="mt-1 text-sm text-muted-foreground">{duration} with {call.name} · {sentCount} {sentCount === 1 ? "message" : "messages"} sent</p></div></div>
          <p className="text-sm leading-6 text-muted-foreground">Your microphone and camera are off. This sample transcript is available until you dismiss the preview.</p>
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void copyTranscript()}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy transcript"}</Button><Button onClick={() => void start(call.conversationId)}><Phone />Call again</Button></div>
          <Button variant="ghost" asChild><Link to={call.conversationId === data.companionSessionId ? "/companion" : `/chat/${call.conversationId}`} onClick={close}>Return to conversation</Link></Button>
          {screenError && <p role="alert" className="text-xs text-muted-foreground">{screenError}</p>}
        </div> : <>
          <div className="call-participants grid min-h-0 flex-1 gap-3 p-3">
            <section aria-label={`${call.name}'s side`} className="call-tile flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
              {call.channels.avatar ? <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-y-auto p-6">{participant()}<p className="text-sm text-muted-foreground">{busy ? "Thinking…" : speaking ? "Speaking · browser voice" : "Here with you"}</p>{call.channels.captions && latest && <p className="max-w-xl text-center text-sm leading-6">{latest.text}</p>}</div> : <CallTranscript call={call} />}
              <div className="call-participant-footer flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-3 py-2">
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{call.name}</p><p className="text-xs text-muted-foreground">{speaking ? "Speaking · browser voice" : busy ? "Thinking" : "Ready"}</p></div>
                <CallAudio speaking={speaking} label={speaking ? "Companion speaking with browser voice" : "Companion audio idle"} />
                <CallControl label={speaking ? "Stop reading reply" : "Read latest reply with browser voice"} icon={speaking ? Square : Play} disabled={!latest || !call.channels.voice || !readAloud.supported()} onClick={playReply} />
                <CallControl label={call.channels.voice ? "Mute companion voice" : "Unmute companion voice"} icon={call.channels.voice ? Volume2 : VolumeX} active={call.channels.voice} onClick={() => void configure({ channels: { voice: !call.channels.voice } })} />
                <CallControl label={call.channels.avatar ? "Show conversation" : "Show companion appearance"} icon={call.channels.avatar ? MessageSquare : Image} active={call.channels.avatar} onClick={() => void configure({ channels: { avatar: !call.channels.avatar } })} />
                <CallControl label={call.channels.captions ? "Hide companion text" : "Show companion text"} icon={call.channels.captions ? Captions : CaptionsOff} active={call.channels.captions} onClick={() => void configure({ channels: { captions: !call.channels.captions } })} />
              </div>
            </section>

            <section aria-label="Your side" className="call-tile flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
              <div className="call-camera relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-muted">
                {media.camera && call.channels.camera ? <CameraPreview stream={media.camera} /> : <div className="flex flex-col items-center gap-3 p-4 text-center"><div className="flex size-16 items-center justify-center rounded-full bg-background text-lg font-medium">{(data.auth.ownerName || "You").slice(0, 2).toUpperCase()}</div><p className="text-sm text-muted-foreground">Camera off</p></div>}
                {captions.enabled && <div aria-label="Your live captions" className="call-captions absolute inset-x-3 bottom-3 rounded-lg bg-background px-4 py-3 text-center shadow-sm">
                  {captions.text ? <div className="call-caption-lines"><p aria-live="off" dir="auto" className="shrink-0 break-words text-base font-medium leading-7">{captions.text.split(/\s+/).slice(-40).join(" ")}</p></div> : <p className="text-sm leading-6">{call.channels.microphone ? "Listening for your words…" : "Turn on your microphone for live captions"}</p>}
                  {captions.text && (!call.channels.microphone || currentPlayback) && <p className="mt-1 text-xs text-muted-foreground">{currentPlayback ? "Captions paused during playback" : "Microphone muted"}</p>}
                  {captions.error && call.channels.microphone && !speaking && <div role="alert" className="mt-2 flex items-start gap-2 text-xs"><p className="flex-1">{captions.error}</p><Button variant="outline" size="sm" onClick={captions.retry}>Retry</Button></div>}
                  {!captions.text && <p className="mt-1 text-xs leading-4 text-muted-foreground">Browser speech service · may process audio online</p>}
                </div>}
              </div>
              <div className="call-participant-footer flex shrink-0 items-center gap-3 border-t border-border px-3 py-2">
                <div className="min-w-0 flex-1"><p className="text-sm font-medium">You</p><p className="text-xs text-muted-foreground">{media.requesting ? `Opening ${media.requesting}…` : call.channels.microphone ? "Microphone on" : "Microphone off"}</p></div>
                <CallAudio level={media.level} active={call.channels.microphone} label={call.channels.microphone ? "Your microphone activity" : "Microphone muted"} />
                <CallControl label={captions.enabled ? "Turn live captions off" : "Turn live captions on"} icon={captions.enabled ? Captions : CaptionsOff} active={captions.enabled} onClick={() => captions.setEnabled(!captions.enabled)} />
              </div>
              <CallComposer call={call} />
            </section>
          </div>
          {(media.error || error || screenError) && <div role="alert" className="mx-3 mb-3 flex shrink-0 items-start gap-2 rounded-lg border border-border bg-muted p-3 text-xs leading-5"><p className="flex-1">{media.error || error || screenError}</p><Button variant="ghost" size="icon" aria-label="Dismiss call notice" onClick={() => { media.clearError(); setScreenError("") }}><X /></Button></div>}
          <footer className="call-dock flex shrink-0 flex-wrap items-center justify-center gap-3 border-t border-border px-4 py-3">
            <CallControl label={call.channels.microphone ? "Mute microphone" : "Unmute microphone"} icon={call.channels.microphone ? Mic : MicOff} active={call.channels.microphone} disabled={!!media.requesting} onClick={() => void media.toggle("microphone")} />
            <CallControl label={call.channels.camera ? "Turn camera off" : "Turn camera on"} icon={call.channels.camera ? Video : VideoOff} active={call.channels.camera} disabled={!!media.requesting} onClick={() => void media.toggle("camera")} />
            <CallControl label={call.channels.keyboard ? "Hide keyboard" : "Show keyboard"} icon={Keyboard} active={call.channels.keyboard} onClick={() => void configure({ channels: { keyboard: !call.channels.keyboard } })} />
            {busy && <CallControl label="Interrupt response" icon={Square} onClick={interrupt} />}
            <span className="mx-1 h-6 w-px bg-border" />
            <Button variant="destructive" onClick={hangUp}><PhoneOff /><span>End call</span></Button>
          </footer>
          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><TaskDialogContent title="Call settings" description="Devices, delivery and session details." onCloseAutoFocus={event => { event.preventDefault(); requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-label="Call settings"]')?.focus()) }}><CallDetails call={call} media={media} onNavigate={() => setSettingsOpen(false)} /></TaskDialogContent></Dialog>
        </>}
      </DialogContent>
    </Dialog>
  </TooltipProvider>
}

export default function CallHost() {
  const call = useCallWorkspace(state => state.call)
  return call ? <CallExperience key={call.id} call={call} /> : null
}
