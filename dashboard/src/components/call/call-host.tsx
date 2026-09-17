import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Link } from "react-router-dom"
import { AudioLines, Captions, CaptionsOff, Check, ChevronDown, Copy, Expand, Focus, Image, ImageOff, Keyboard, Maximize2, MessageSquare, Mic, MicOff, Minus, MoreHorizontal, Phone, PhoneOff, Settings2, Sparkles, Square, Video, VideoOff, Volume2, VolumeX, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { TooltipProvider } from "@/components/ui/tooltip"
import { CompanionPortrait } from "@/components/companion-portrait"
import { ConversationIncognito } from "@/components/conversation-incognito"
import { CharacterMedia } from "@/components/character-studio/media"
import { characterDraft } from "@/lib/api/character"
import { useConker } from "@/lib/api/store"
import { useCallWorkspace } from "@/lib/call-workspace"
import { useCallMedia } from "@/hooks/use-call-media"
import type { CallSession } from "@/lib/api/call-types"
import { cn } from "@/lib/utils"
import { CallControl } from "./call-controls"
import { callDuration } from "@/lib/call-time"
import { CallTranscript } from "./call-transcript"
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
  return <video ref={ref} muted playsInline autoPlay aria-label="Your local camera preview" className="absolute inset-0 size-full object-cover" />
}

function CallExperience({ call }: { call: CallSession }) {
  const { view, panel, setPanel, minimize, expand, dismiss, configure, end, interrupt, error, start } = useCallWorkspace()
  const data = useConker(value => value)
  const profile = useMemo(() => characterDraft(data.profile), [data.profile])
  const isCompanion = call.conversationId === data.companionSessionId || data.agents.find(agent => agent.id === call.agentId)?.kind === "companion"
  const media = useCallMedia(call.id, !!call.endedAt)
  const [now, setNow] = useState(Date.now)
  const [copied, setCopied] = useState(false)
  const [corner, setCorner] = useState("top-right")
  const [invoker] = useState(() => document.activeElement instanceof HTMLElement ? document.activeElement : null)
  const miniRef = useRef<HTMLButtonElement>(null)
  const expandRef = useRef<HTMLButtonElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [fullScreen, setFullScreen] = useState(false)
  const [screenError, setScreenError] = useState("")
  const duration = callDuration(call.startedAt, call.endedAt || now)
  const busy = call.phase === "thinking" || call.phase === "responding"
  const activity = busy ? "thinking" : media.microphone ? "listening" : "idle"
  const latest = call.channels.captions ? call.events.filter(event => event.kind === "assistant").at(-1) : undefined
  const close = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    if (call.endedAt) dismiss(); else minimize()
  }
  const hangUp = () => {
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
    } catch { setScreenError("Clipboard unavailable. The transcript remains in the call details.") }
  }
  const togglePanel = (next: "transcript" | "details") => setPanel(panel === next ? null : next)
  const toggleKeyboard = () => {
    if (panel !== "transcript") {
      void configure({ channels: { keyboard: true } })
      setPanel("transcript")
    } else {
      void configure({ channels: { keyboard: !call.channels.keyboard } })
    }
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
    ? <div role="img" aria-label={`${call.name}, avatar hidden`} className={cn("flex shrink-0 items-center justify-center rounded-xl border border-border bg-muted", small ? "size-12" : "call-portrait")}><AudioLines className="size-5 text-muted-foreground" /></div>
    : isCompanion
    ? <CharacterMedia profile={profile} activity={activity} motion={call.mode === "character" && profile.studio.modes.character.motion} className={small ? "size-12" : "call-portrait"} />
    : <CompanionPortrait name={call.name} tone="graphite" className={small ? "size-12" : "call-portrait"} />

  return <TooltipProvider>
    {view === "mini" && !call.endedAt && createPortal(<section aria-label={`Minimized call with ${call.name}`} className={cn("call-mini fixed z-40 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-lg", corner === "top-right" ? "right-4 top-20" : corner === "bottom-left" ? "left-4 bottom-4" : "right-4 bottom-4")}>
      <div className="flex items-center gap-2 p-3">{participant(true)}<div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{call.name}</p><p className="text-xs text-muted-foreground">Preview · <span className="tabular-nums">{duration}</span></p></div><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Move mini call"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem onSelect={() => setCorner("top-right")}>Top right</DropdownMenuItem><DropdownMenuItem onSelect={() => setCorner("bottom-right")}>Bottom right</DropdownMenuItem><DropdownMenuItem onSelect={() => setCorner("bottom-left")}>Bottom left</DropdownMenuItem></DropdownMenuContent></DropdownMenu><Button ref={miniRef} size="icon" variant="ghost" aria-label="Expand call" onClick={expand}><Maximize2 /></Button></div>
      {busy && <p role="status" className="px-3 pb-3 text-xs text-muted-foreground">Preparing a sample response…</p>}
      <div className="flex items-center gap-2 border-t border-border bg-muted p-3">
        <CallControl label={call.channels.microphone ? "Mute microphone" : "Enable microphone preview"} icon={call.channels.microphone ? Mic : MicOff} active={call.channels.microphone} disabled={!!media.requesting} onClick={() => void media.toggle("microphone")} />
        <CallControl label={call.channels.camera ? "Turn camera off" : "Enable camera preview"} icon={call.channels.camera ? Video : VideoOff} active={call.channels.camera} disabled={!!media.requesting} onClick={() => void media.toggle("camera")} />
        <CallControl label={call.channels.voice ? "Turn companion voice off" : "Turn companion voice on"} icon={call.channels.voice ? Volume2 : VolumeX} active={call.channels.voice} onClick={() => void configure({ channels: { voice: !call.channels.voice } })} />
        <Button variant="destructive" size="icon" className="ml-auto" aria-label="End call" onClick={hangUp}><PhoneOff /></Button>
      </div>
      {media.error && <p role="alert" className="border-t border-border p-3 text-xs leading-5">{media.error}</p>}
      {(call.channels.microphone || call.channels.camera) && <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">{call.channels.microphone ? "Mic on" : "Mic off"} · {call.channels.camera ? "Camera on" : "Camera off"} · Local preview</p>}
    </section>, document.body)}

    <Dialog open={view === "expanded"} onOpenChange={open => { if (!open) close() }}>
      <DialogContent ref={stageRef} showCloseButton={false} className={cn("call-window flex flex-col gap-0 overflow-hidden p-0", call.endedAt && "call-ended")}
        onInteractOutside={event => event.preventDefault()}
        onOpenAutoFocus={event => { event.preventDefault(); expandRef.current?.focus() }}
        onCloseAutoFocus={event => { event.preventDefault(); requestAnimationFrame(() => { if (!call.endedAt) miniRef.current?.focus(); else restoreAfterCall() }) }}>
        <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
          <Phone className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1"><DialogTitle className="truncate text-base leading-6">{call.endedAt ? "Call ended" : `Call with ${call.name}`}</DialogTitle><DialogDescription className="text-xs">{call.endedAt ? "Preview session" : "Call preview"} · <span className="tabular-nums">{duration}</span><span className="hidden sm:inline"> · English</span></DialogDescription></div>
          {!call.endedAt && <ConversationIncognito scope="call" privacy={{ memoryDisabled: call.privacy.memory, harnessDisabled: call.privacy.harness }} busy={false} onChange={patch => void configure({ privacy: { ...(patch.memoryDisabled === undefined ? {} : { memory: patch.memoryDisabled }), ...(patch.harnessDisabled === undefined ? {} : { harness: patch.harnessDisabled }) } })} onInspect={() => setPanel("details")} />}
          {!call.endedAt && <><CallControl label={fullScreen ? "Exit fullscreen" : "Fullscreen call"} icon={Expand} onClick={() => void fullscreen()} /><Button ref={expandRef} variant="ghost" size="icon" aria-label="Minimize call" title="Minimize call · keeps the session open" onClick={close}><Minus /></Button></>}
          {call.endedAt && <Button ref={expandRef} variant="ghost" size="icon" aria-label="Close call summary" onClick={close}><X /></Button>}
        </header>

        {call.endedAt ? <div className="space-y-6 p-6">
          <div className="flex items-center gap-4">{participant(true)}<div><p className="font-medium">Until next time, {data.auth.ownerName || "you"}.</p><p className="mt-1 text-sm text-muted-foreground">{duration} with {call.name} · {call.events.filter(event => event.kind === "user").length} messages sent</p></div></div>
          <p className="text-sm leading-6 text-muted-foreground">Your microphone and camera are off. This sample transcript is available until you dismiss the preview.</p>
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void copyTranscript()}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy transcript"}</Button><Button onClick={() => void start(call.conversationId)}><Phone />Call again</Button></div>
          <Button variant="ghost" asChild><Link to={call.conversationId === data.companionSessionId ? "/companion" : `/chat/${call.conversationId}`} onClick={close}>Return to conversation</Link></Button>
          {screenError && <p role="alert" className="text-xs text-muted-foreground">{screenError}</p>}
        </div> : <>
          <div className="call-body flex min-h-0 flex-1">
            <div className="call-main flex min-w-0 flex-1 flex-col gap-3 p-3 sm:p-5">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" aria-label={`Call mode: ${call.mode === "focus" ? "Focus" : "Character"}`}>{call.mode === "focus" ? <Focus /> : <Sparkles />}{call.mode === "focus" ? "Focus" : "Character"}<ChevronDown /></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuItem onSelect={() => void configure({ mode: "focus" })}><Focus /><div><p>Focus</p><p className="text-xs text-muted-foreground">Direct answers, natural delivery</p></div>{call.mode === "focus" && <Check className="ml-auto" />}</DropdownMenuItem><DropdownMenuItem onSelect={() => void configure({ mode: "character" })}><Sparkles /><div><p>Character</p><p className="text-xs text-muted-foreground">Personality and contextual expression</p></div>{call.mode === "character" && <Check className="ml-auto" />}</DropdownMenuItem><DropdownMenuSeparator /><p className="max-w-64 px-2 py-1.5 text-xs leading-5 text-muted-foreground">Same mind. Same voice. Different delivery.</p></DropdownMenuContent></DropdownMenu>
                <div className="flex items-center gap-1"><CallControl label="Show call transcript" icon={MessageSquare} active={panel === "transcript"} onClick={() => togglePanel("transcript")} /><CallControl label="Show call details" icon={Settings2} active={panel === "details"} onClick={() => togglePanel("details")} /></div>
              </div>

              <div className="call-participants grid min-h-0 flex-1 gap-3">
                <section aria-label={`${call.name}'s channels`} className="call-agent flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground">
                  <div className="flex items-center justify-between gap-2 px-4 pt-4"><span className="truncate text-sm font-medium">{call.name}</span><span className="text-xs text-muted-foreground">{call.mode === "focus" ? "Focused" : "Character"}</span></div>
                  <div className="call-presence flex min-h-0 flex-1 flex-col items-center justify-center gap-5 p-4 text-center">
                    {call.channels.avatar ? participant() : <div className="flex size-24 items-center justify-center rounded-full bg-muted"><AudioLines className="size-8 text-muted-foreground" /></div>}
                    <div className="space-y-2"><p role="status" className="text-lg font-medium">{busy ? "Thinking through a sample…" : "Here with you"}</p><p className="text-sm text-muted-foreground">{busy ? "You can interrupt at any time" : "Type a thought, or try your local devices"}</p></div>
                    {latest && <p dir="auto" className="call-caption max-w-lg text-sm leading-6 text-muted-foreground">{latest.text}</p>}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-3">
                    <div className="flex gap-2"><CallControl label={call.channels.voice ? "Turn companion voice off" : "Turn companion voice on"} icon={call.channels.voice ? Volume2 : VolumeX} active={call.channels.voice} onClick={() => void configure({ channels: { voice: !call.channels.voice } })} /><CallControl label={call.channels.avatar ? "Hide companion avatar" : "Show companion avatar"} icon={call.channels.avatar ? Image : ImageOff} active={call.channels.avatar} onClick={() => void configure({ channels: { avatar: !call.channels.avatar } })} /><CallControl label={call.channels.captions ? "Turn companion text off" : "Turn companion text on"} icon={call.channels.captions ? Captions : CaptionsOff} active={call.channels.captions} onClick={() => void configure({ channels: { captions: !call.channels.captions } })} /></div>
                    <span className="text-xs text-muted-foreground">{call.channels.voice ? "Voice not connected" : "Voice off"}</span>
                  </div>
                </section>

                <section aria-label="Your channels" className="call-self flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-muted">
                  <div className="flex items-center justify-between px-4 pt-4"><span className="text-sm font-medium">You</span><span className="text-xs text-muted-foreground">Local preview</span></div>
                  <div className="call-self-image relative m-3 flex min-h-24 flex-1 items-center justify-center overflow-hidden rounded-lg bg-background">
                    {media.camera && call.channels.camera ? <CameraPreview stream={media.camera} /> : <div className="flex flex-col items-center gap-3 p-4"><div className="flex size-16 items-center justify-center rounded-full bg-secondary text-lg font-medium text-secondary-foreground">{(data.auth.ownerName || "You").slice(0, 2).toUpperCase()}</div><p className="text-xs text-muted-foreground">Camera off</p></div>}
                  </div>
                  <div className="space-y-3 px-4 pb-4"><div className="flex items-center gap-2"><Mic className="size-3.5 shrink-0 text-muted-foreground" /><div role="meter" aria-label="Local microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(media.level * 100)} className="h-1 flex-1 overflow-hidden rounded-full bg-background"><div className="h-full rounded-full bg-primary" style={{ width: `${media.level * 100}%` }} /></div></div><p role="status" className="text-xs leading-5 text-muted-foreground">{media.requesting ? `Opening ${media.requesting}…` : call.channels.microphone ? "Mic preview on · not transcribing" : "Microphone off. Typing works anytime."}</p></div>
                </section>
              </div>
              {(media.error || error || screenError) && <div role="alert" className="flex shrink-0 items-start gap-2 rounded-lg border border-border bg-muted p-3 text-xs leading-5"><p className="flex-1">{media.error || error || screenError}</p>{media.error && <Button variant="ghost" size="icon" aria-label="Dismiss device notice" onClick={media.clearError}><X /></Button>}</div>}
            </div>
            {panel && <aside aria-label={panel === "transcript" ? "Call conversation" : "Call details"} className="call-panel flex min-h-0 shrink-0 flex-col border-l border-border bg-background"><div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3"><h2 className="text-sm font-medium">{panel === "transcript" ? "Conversation" : "Call details"}</h2><Button variant="ghost" size="icon" aria-label="Close call panel" onClick={() => setPanel(null)}><X /></Button></div>{panel === "transcript" ? <CallTranscript call={call} /> : <CallDetails call={call} media={media} />}</aside>}
          </div>

          <footer className="call-dock flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-6">
            <p className="hidden max-w-64 text-xs leading-5 text-muted-foreground lg:block">Device previews stay local.<br />AI voice and perception are not connected.</p>
            <div className="flex items-center gap-2">
              <CallControl label={call.channels.microphone ? "Mute microphone" : "Enable microphone preview"} icon={call.channels.microphone ? Mic : MicOff} active={call.channels.microphone} disabled={!!media.requesting} onClick={() => void media.toggle("microphone")} />
              <CallControl label={call.channels.camera ? "Turn camera off" : "Enable camera preview"} icon={call.channels.camera ? Video : VideoOff} active={call.channels.camera} disabled={!!media.requesting} onClick={() => void media.toggle("camera")} />
              <CallControl label={panel !== "transcript" ? "Open call keyboard" : call.channels.keyboard ? "Turn keyboard off" : "Turn keyboard on"} icon={Keyboard} active={call.channels.keyboard && panel === "transcript"} onClick={toggleKeyboard} />
              {busy && <CallControl label="Interrupt response" icon={Square} onClick={interrupt} />}
            </div>
            <Button variant="destructive" onClick={hangUp}><PhoneOff /><span>End call</span></Button>
          </footer>
        </>}
      </DialogContent>
    </Dialog>
  </TooltipProvider>
}

export default function CallHost() {
  const call = useCallWorkspace(state => state.call)
  return call ? <CallExperience key={call.id} call={call} /> : null
}
