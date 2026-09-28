import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleAlert, Focus, MessageSquareText, Mic, Pause, Phone, PhoneOff, Play, RefreshCw, Square, VolumeX } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { OverlayBody, TaskDialogContent } from '@/components/design-system'
import { createCallRequestId, type GatewayCall, type GatewayCallAvailability, type GatewayCallsClient } from '@/lib/gateway/calls'
import { gatewayError } from '@/lib/gateway/transport'
import { useGatewayCallAudio } from '@/hooks/use-gateway-call-audio'
import { cn } from '@/lib/utils'
import { OwnerAvatar } from './owner-avatar'
import { useOwnerProfile } from '@/lib/owner-profile'

type UncertainTurn = { requestId: string; kind: 'text' | 'audio'; text?: string; checked: boolean }

function clock(value: number) {
  return new Date(value * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function GatewayCallLauncher({ client, conversationId, disabled = false }: { client: GatewayCallsClient; conversationId: string; disabled?: boolean }) {
  const ownerProfile = useOwnerProfile()
  const [open, setOpen] = useState(false)
  const [call, setCall] = useState<GatewayCall | null>(null)
  const [availability, setAvailability] = useState<GatewayCallAvailability | null>(null)
  const [pending, setPending] = useState<'opening' | 'sending' | 'changing' | null>(null)
  const [draft, setDraft] = useState('')
  const [uncertain, setUncertain] = useState<UncertainTurn | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const operation = useRef(0)
  const transcript = useRef<HTMLDivElement>(null)
  const voice = useGatewayCallAudio(disabled || !!call?.endedAt || !!call?.paused || !!pending)

  useEffect(() => {
    if (open) requestAnimationFrame(() => { if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight })
  }, [call?.events.length, open])

  const openCall = async () => {
    const token = ++operation.current
    setOpen(true); setPending('opening'); setError(null); setNotice(null)
    try {
      const capabilityRequest = client.availability().catch(() => null)
      let value: GatewayCall
      try { value = await client.active(conversationId) }
      catch (cause) {
        if (gatewayError(cause).status !== 404) throw cause
        value = await client.start(createCallRequestId('start'), conversationId)
      }
      const capabilities = await capabilityRequest
      if (operation.current === token) { setCall(value); setAvailability(capabilities) }
    } catch (cause) {
      if (operation.current === token) setError(gatewayError(cause).message)
    } finally { if (operation.current === token) setPending(null) }
  }

  const refresh = async () => {
    if (!call) return void openCall()
    const token = ++operation.current
    setPending('opening'); setError(null); setNotice(null)
    try { const value = await client.get(call.id); if (operation.current === token) setCall(value) }
    catch (cause) { if (operation.current === token) setError(gatewayError(cause).message) }
    finally { if (operation.current === token) setPending(null) }
  }

  const send = async (saved = uncertain) => {
    if (!call || call.endedAt || call.paused || pending) return
    const text = saved?.text ?? draft.trim()
    if (!text || [...text].length > 4000) return
    const attempt = saved ?? { requestId: createCallRequestId('turn'), kind: 'text' as const, text, checked: false }
    const token = ++operation.current
    setPending('sending'); setError(null); setNotice(null); setUncertain(attempt)
    try {
      const result = await client.turn(call.id, attempt.requestId, text)
      if (operation.current === token) { setCall(result.call); setDraft(''); setUncertain(null); setNotice(result.replayed ? 'Loaded the saved result. Nothing was run twice.' : null) }
    } catch {
      if (operation.current === token) setError('The result is uncertain. Your text is kept; check the saved call before sending anything else.')
    } finally { if (operation.current === token) setPending(null) }
  }

  const sendVoice = async () => {
    const audio = voice.finish()
    if (!audio || !call || call.endedAt || call.paused || pending) return
    const attempt: UncertainTurn = { requestId: createCallRequestId('audio'), kind: 'audio', checked: false }
    const token = ++operation.current
    setPending('sending'); setError(null); setNotice(null); setUncertain(attempt)
    try {
      let current = call
      if (!current.channels.microphone) current = await client.update(current.id, current.revision, { channels: { microphone: true } })
      const result = await client.audioTurn(current.id, attempt.requestId, audio)
      if (operation.current === token) {
        setCall(result.call); setUncertain(null)
        setNotice(result.replayed ? 'Loaded the saved voice turn. Audio was not generated twice.' : result.audio ? null : 'Your words and the text reply were saved, but speech playback was unavailable.')
        if (result.audio) voice.play(result.audio.base64, result.audio.mime)
      }
    } catch {
      if (operation.current === token) setError('The voice result is uncertain. No recording was kept; check the saved call before recording another turn.')
    } finally { if (operation.current === token) setPending(null) }
  }

  const checkTurn = async () => {
    if (!call || !uncertain) return
    const token = ++operation.current
    setPending('opening'); setError(null); setNotice(null)
    try {
      const value = await client.get(call.id)
      if (operation.current !== token) return
      setCall(value)
      if (value.requests.some(item => item.requestId === uncertain.requestId)) {
        setDraft(''); setUncertain(null); setNotice('The saved request was found. Nothing was sent again.')
      } else {
        setUncertain({ ...uncertain, checked: true }); setError(uncertain.kind === 'audio' ? 'That voice request is not in the saved call. The recording was not retained, so record a new turn instead of replaying uncertain audio.' : 'That request is not in the saved call yet. You may retry the same request identity after reviewing this warning.')
      }
    } catch (cause) { if (operation.current === token) setError(gatewayError(cause).message) }
    finally { if (operation.current === token) setPending(null) }
  }

  const change = async (action: (value: GatewayCall) => Promise<GatewayCall>, message?: string) => {
    if (!call || pending) return
    const token = ++operation.current
    setPending('changing'); setError(null); setNotice(null)
    try {
      const value = await action(call)
      if (operation.current === token) { setCall(value); setNotice(message ?? null) }
    } catch (cause) {
      if (operation.current === token) setError(`${gatewayError(cause).message} Refresh the saved call before trying again.`)
    } finally { if (operation.current === token) setPending(null) }
  }

  const interrupt = () => {
    if (!call) return
    const token = ++operation.current
    setPending('changing'); setError(null); setNotice(null)
    client.interrupt(call.id, call.revision)
      .then(value => { if (operation.current === token) { setCall(value); setNotice('The response was interrupted. Any external effect already in flight cannot be recalled.') } })
      .catch(cause => { if (operation.current === token) setError(`${gatewayError(cause).message} Refresh the saved call before trying again.`) })
      .finally(() => { if (operation.current === token) setPending(null) })
  }
  const messages = useMemo(() => call?.events.filter(item => item.kind !== 'event') ?? [], [call])
  const busy = pending === 'sending' || call?.phase === 'thinking' || call?.phase === 'responding'
  const voiceInputReady = availability?.speechInput === 'configured' || availability?.speechInput === 'available'
  const voiceOutputReady = availability?.speechOutput === 'configured' || availability?.speechOutput === 'available'

  return <>
    <Button size="sm" variant="ghost" className="gap-1.5 px-2.5" aria-label="Call Conker" title="Call Conker" disabled={disabled} onClick={() => void openCall()}><Phone /><span className="hidden sm:inline">Call</span></Button>
    <Dialog open={open} onOpenChange={next => { setOpen(next); if (!next) { voice.cancel(); voice.stopPlayback() } }}>
      <TaskDialogContent size="wide" className="h-[min(46rem,calc(100dvh-2rem))] sm:max-w-3xl" title={call?.endedAt ? 'Call ended' : 'Call mode'} description="A focused voice or typed conversation. Audio is transient; the transcript is saved.">
        <OverlayBody className="flex min-h-0 flex-1 flex-col overflow-y-hidden p-0">
          <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
            <Badge variant={call?.endedAt ? 'outline' : call?.paused ? 'outline' : 'secondary'}>{call?.endedAt ? 'ended' : call?.paused ? 'paused' : busy ? 'thinking' : 'ready'}</Badge>
            <Badge variant="outline">{voiceInputReady ? voiceOutputReady ? 'Voice ready' : 'Voice input ready' : 'Voice needs setup'}</Badge>
            <Badge variant="outline" className="hidden sm:inline-flex">Video unavailable</Badge>
            <div className="ml-auto flex items-center gap-1.5" aria-label="Call participants: Conker and you">
              <span className="flex size-7 items-center justify-center rounded-full border bg-background" title="Conker"><img src="/conker.png" alt="" width="20" height="20" className="size-5 object-contain" /></span>
              <OwnerAvatar className="size-7" />
            </div>
            {call && <div className="ml-auto flex rounded-md border p-0.5" role="group" aria-label="Call style">
              {(['focus', 'character'] as const).map(mode => <Button key={mode} size="sm" variant={call.mode === mode ? 'secondary' : 'ghost'} className="h-7 px-2.5" aria-pressed={call.mode === mode} disabled={!!pending || !!call.endedAt} onClick={() => void change(value => client.update(value.id, value.revision, { mode }))}>{mode === 'focus' ? <Focus /> : <MessageSquareText />}{mode}</Button>)}
            </div>}
          </div>
          <div ref={transcript} className="min-h-0 flex-1 overflow-y-auto px-5 py-5" tabIndex={0} aria-label="Saved call transcript">
            {!call && pending === 'opening' && <p role="status" className="py-16 text-center text-sm text-muted-foreground">Opening the saved call…</p>}
            {!call && !pending && <div className="py-16 text-center"><p className="text-sm font-medium">Call mode is unavailable</p><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Check the server connection, then try again. No call was retried automatically.</p><Button className="mt-4" size="sm" variant="outline" onClick={() => void openCall()}><RefreshCw />Check active call</Button></div>}
            {call && messages.length === 0 && <div className="py-12 text-center"><div className="mx-auto flex w-fit items-start gap-6"><div><span className="flex size-16 items-center justify-center rounded-full border bg-background"><img src="/conker.png" alt="" width="44" height="44" className="size-11 object-contain" /></span><p className="mt-2 text-xs font-medium">Conker</p></div><div><OwnerAvatar className="size-16" /><p className="mt-2 max-w-24 truncate text-xs font-medium">{ownerProfile.name}</p></div></div><p className="mt-5 text-sm font-medium">A quieter place to think together</p><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">Type now, or use voice after speech is connected. Video calls are not connected to this gateway yet.</p><p className="mx-auto mt-2 max-w-md text-xs leading-5 text-muted-foreground">The transcript is saved; recordings and generated audio are not retained.</p></div>}
            <ol className="mx-auto max-w-2xl space-y-5">{call?.events.map(item => item.kind === 'event' ? <li key={item.id} className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" /><span>{item.text}</span><span className="h-px flex-1 bg-border" /></li> : <li key={item.id} className={cn('flex', item.kind === 'user' ? 'justify-end' : 'justify-start')}><div className={cn('max-w-[85%] rounded-lg px-4 py-3 text-sm leading-6', item.kind === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground')}><p className="whitespace-pre-wrap break-words">{item.text}</p><time className={cn('mt-1 block text-[11px]', item.kind === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{clock(item.at)}</time></div></li>)}</ol>
            {call?.eventsTruncated && <p className="mt-5 text-center text-xs text-muted-foreground">Earlier call events remain saved but are outside this bounded view.</p>}
          </div>
          {(error || voice.error || notice) && <div className={cn('flex items-start gap-2 border-t px-5 py-3 text-xs leading-5', error || voice.error ? 'text-destructive' : 'text-muted-foreground')} role={error || voice.error ? 'alert' : 'status'}>{(error || voice.error) && <CircleAlert className="mt-0.5 size-4 shrink-0" />}<p>{error ?? voice.error ?? notice}</p></div>}
          {uncertain && <div className="flex flex-wrap gap-2 border-t px-5 py-3"><Button size="sm" variant="outline" disabled={!!pending} onClick={() => void checkTurn()}><RefreshCw />Check saved call</Button>{uncertain.checked && uncertain.kind === 'text' && <Button size="sm" variant="outline" disabled={!!pending} onClick={() => void send(uncertain)}>Retry same request</Button>}</div>}
          {call && !call.endedAt && <form className="shrink-0 border-t p-4" onSubmit={event => { event.preventDefault(); void send(null) }}>
            <Label htmlFor="gateway-call-message" className="sr-only">Call message</Label>
            <Textarea id="gateway-call-message" rows={2} maxLength={4000} value={draft} disabled={!!pending || call.paused || !!uncertain || voice.recording} placeholder={call.paused ? 'Resume the call to continue…' : voice.recording ? 'Listening…' : 'Say what is on your mind…'} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(null) } }} className="max-h-32 min-h-20 resize-none" />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <p className="w-full text-xs text-muted-foreground sm:mr-auto sm:w-auto">{voice.recording ? `${voice.limitReached ? 'Limit reached' : 'Listening'} · ${voice.duration.toFixed(1)}s · audio stays transient` : `English · saved transcript · ${voiceInputReady ? 'transient voice' : 'voice needs speech setup'}`}</p>
              <div className="ml-auto flex items-center gap-2">
                {voice.playing && <Button type="button" size="icon" variant="outline" aria-label="Stop voice playback" title="Stop voice playback" onClick={voice.stopPlayback}><VolumeX /></Button>}
                {voice.recording ? <Button type="button" size="sm" variant="destructive" onClick={() => void sendVoice()}><span className="relative flex size-4 items-center justify-center"><span className="absolute rounded-full bg-destructive-foreground/30" style={{ width: `${8 + voice.level * 8}px`, height: `${8 + voice.level * 8}px` }} /><Square className="relative size-3" /></span>Send voice</Button> : <Button type="button" size="icon" variant="outline" aria-label="Record voice turn" title={voiceInputReady ? 'Record voice turn' : 'Speech input is not configured'} disabled={!voiceInputReady || !!pending || !!uncertain || call.paused} onClick={() => void voice.start()}><Mic /></Button>}
                {busy && <Button type="button" size="sm" variant="outline" onClick={interrupt}><Square />Interrupt</Button>}
                <Button type="submit" size="sm" disabled={!!pending || call.paused || !!uncertain || voice.recording || !draft.trim()}>Send</Button>
              </div>
            </div>
          </form>}
          {call && <footer className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
            {!call.endedAt && <Button size="sm" variant="outline" disabled={!!pending || !!uncertain} onClick={() => void change(value => client.update(value.id, value.revision, { paused: !value.paused }), call.paused ? 'Call resumed.' : 'Call paused.')} >{call.paused ? <Play /> : <Pause />}{call.paused ? 'Resume' : 'Pause'}</Button>}
            <Button size="sm" variant="outline" disabled={!!pending} onClick={() => void refresh()}><RefreshCw />Refresh</Button>
            {!call.endedAt ? <Button className="ml-auto" size="sm" variant="destructive" disabled={!!pending} onClick={() => void change(value => client.end(value.id, value.revision), 'Call ended.')}><PhoneOff />End call</Button> : <><Button className="ml-auto" size="sm" variant="outline" onClick={() => setOpen(false)}>Close</Button><Button size="sm" onClick={() => { setCall(null); setDraft(''); setUncertain(null); void openCall() }}><Phone />Call again</Button></>}
          </footer>}
        </OverlayBody>
      </TaskDialogContent>
    </Dialog>
  </>
}
