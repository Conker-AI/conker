import { Link } from "react-router-dom"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { useCallWorkspace } from "@/lib/call-workspace"
import type { CallSession } from "@/lib/api/call-types"
import type { CallMedia } from "@/hooks/use-call-media"
import { callDuration } from "@/lib/call-time"

export function CallDetails({ call, media, onNavigate, participant }: { call: CallSession; media: CallMedia; onNavigate: () => void; participant: "companion" | "you" }) {
  const { configure, minimize } = useCallWorkspace()
  return <div className="min-h-0 flex-1 overflow-y-auto text-sm">
    {participant === "companion" && <section className="space-y-4 border-b border-border p-4">
      <h3 className="font-medium">Delivery</h3>
      <div className="space-y-2"><Label htmlFor="call-mode">Conversation mode</Label><Select value={call.mode} onValueChange={value => void configure({ mode: value as "focus" | "character" })}><SelectTrigger id="call-mode" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="focus">Focus</SelectItem><SelectItem value="character">Character</SelectItem></SelectContent></Select></div>
      <p className="text-xs leading-5 text-muted-foreground">{call.mode === "focus" ? "Direct answers with restrained, natural delivery." : "Your authored personality, speaking style and expression."} The same reasoning model and identity in either mode.</p>
    </section>}
    {participant === "you" && <section className="space-y-4 border-b border-border p-4">
      <h3 className="font-medium">Devices & language</h3>
      {([['microphone', 'audioinput', 'Microphone'], ['camera', 'videoinput', 'Camera']] as const).map(([kind, type, title]) => <div key={kind} className="space-y-2">
        <Label htmlFor={`call-${kind}`}>{title}</Label>
        <Select value={media.selected[kind]} onValueChange={value => media.choose(kind, value)} disabled={call.paused || !!media.requesting}><SelectTrigger id={`call-${kind}`} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="default">System default</SelectItem>{media.devices.filter(device => device.kind === type && device.deviceId && device.deviceId !== 'default').map((device, index) => <SelectItem key={device.deviceId} value={device.deviceId}>{device.label || `${title} ${index + 1}`}</SelectItem>)}</SelectContent></Select>
      </div>)}
      <p className="text-xs leading-5 text-muted-foreground">Camera and microphone previews stay on this device. Optional live captions use your browser's speech service and system default microphone; that service may process audio online. Conker does not record audio or send captions as messages.</p>
      <div className="space-y-2"><Label htmlFor="call-language">Spoken language</Label><Select value="en" disabled><SelectTrigger id="call-language" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="en">English</SelectItem></SelectContent></Select><p className="text-xs text-muted-foreground">Russian and Hebrew are planned.</p></div>
      {call.paused && <p className="text-xs text-muted-foreground">Call paused. Resume to change devices. Your previous mic and camera settings will return.</p>}
    </section>}
    {participant === "companion" && <><section className="space-y-4 border-b border-border p-4">
      <h3 className="font-medium">Voice & session</h3>
      <p className="text-xs leading-5 text-muted-foreground">Play reads the latest reply with your browser's voice. Word highlighting follows the speech engine's timing when available; engines without word events show text without simulated timings. The waveform indicates playback, not measured output volume. Character voice and real-time AI are not connected.</p>
      <dl className="space-y-2 text-xs"><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Character voice</dt><dd>Not connected</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Emotion & camera analysis</dt><dd>Not connected</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Usage & cost</dt><dd>Not metered</dd></div></dl>
      <Button variant="outline" size="sm" asChild><Link to="/settings/companion?tab=voice" onClick={() => { onNavigate(); minimize() }}>Edit character & voice</Link></Button>
    </section>
    <section className="space-y-4 border-b border-border p-4">
      <h3 className="font-medium">Incognito</h3>
      <dl className="space-y-3"><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Memory</dt><dd>{call.privacy.memory ? "Excluded" : "Conversation scope"}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Pi harness</dt><dd>{call.privacy.harness ? "Excluded" : "Conversation scope"}</dd></div></dl>
      <p className="text-xs text-muted-foreground">Change these with Incognito in the call header.</p>
      <p className="text-xs leading-5 text-muted-foreground">Inherited from this conversation, adjustable for this call. Preview preferences only; server enforcement is not connected. Text stays in this tab until reload.</p>
    </section>
    <section className="space-y-3 p-4"><h3 className="font-medium">Session timeline</h3><p className="text-xs leading-5 text-muted-foreground">Sent messages, pauses and mode changes. Speech highlighting is live and is not a saved recording.</p><ol className="space-y-3">{call.events.map(event => <li key={event.id} className="flex items-baseline gap-3 text-xs"><time className="shrink-0 tabular-nums text-muted-foreground">{callDuration(call.startedAt, event.at)}</time><span className="min-w-0 break-words leading-5">{event.kind === "user" ? "You · " : event.kind === "assistant" ? `${call.name} · Sample · ` : ""}{event.text}</span></li>)}</ol></section></>}
  </div>
}
