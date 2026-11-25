import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useStore } from 'zustand'
import { PageHeader } from '@/components/design-system'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { connectionStore } from '@/lib/connection-store'
import { gatewayError } from '@/lib/gateway/transport'
import type { SharedSaved } from '@/lib/gateway/shared-notes'
import { clearShared, loadShared, readShared, SHARE_LIMIT, sharedText, type ShareStorage } from '@/lib/share-capture'
import { shareStorage } from '@/pwa/share-target'
import { gatewayConversationLink } from './navigation'
import { GatewayPageFrame } from './page-frame'

type Client = { save(requestId: string, text: string): Promise<SharedSaved> }
type Failure = { unknown: boolean; message: string }
/** `storage` defaults to this tab's session storage. */
type Props = { client: Client; storage?: ShareStorage | null }

const requestId = () => `share_${crypto.randomUUID().replaceAll('-', '')}`
const count = (value: number) => value.toLocaleString('en-US')

/**
 * Text or a link shared from another app, saved to the Inbox with one tap: a chat of its own, marked
 * as someone else's words, so it never becomes something the owner said. The link is shown as text
 * and never opened. Nothing is shown as saved until the server says so.
 */
export function GatewayShareCapture({ client, storage = shareStorage() }: Props) {
  const location = useLocation(),
    navigate = useNavigate()
  const online = useStore(connectionStore, state => state.online)
  const [shared] = useState(() => {
    const item = loadShared(storage) ?? readShared(location.search)
    return item ? sharedText(item) : ''
  })
  const [text, setText] = useState(shared)
  const [identity, setIdentity] = useState(requestId)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [saved, setSaved] = useState<SharedSaved | null>(null)
  const over = text.length - SHARE_LIMIT
  const blank = !text.trim()

  async function save(event: FormEvent) {
    event.preventDefault()
    if (pending || blank || over > 0 || !online) return
    setPending(true)
    setFailure(null)
    // A retry of the same text keeps its id, so Pi saves it at most once.
    try {
      const result = await client.save(identity, text)
      clearShared(storage)
      setSaved(result)
    } catch (cause) {
      const error = gatewayError(cause)
      setFailure(error.kind === 'network' ? { unknown: true, message: 'Conker couldn’t confirm it was saved. Try again: it won’t be saved twice.' } : { unknown: false, message: `${error.message} Nothing was saved.` })
    } finally {
      setPending(false)
    }
  }
  const leave = () => {
    clearShared(storage)
    navigate('/overview')
  }

  if (!shared && !saved)
    return (
      <GatewayPageFrame>
        <PageHeader actionsOnly title="Shared text" />
        <Empty className="mx-auto max-w-xl">
          <EmptyHeader>
            <EmptyTitle>Nothing was shared</EmptyTitle>
            <EmptyDescription>To save something here, share text or a link from another app and pick Conker.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" render={<Link to="/overview" />}>
              Go to Home
            </Button>
          </EmptyContent>
        </Empty>
      </GatewayPageFrame>
    )

  return (
    <GatewayPageFrame>
      <div className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-4">
        <PageHeader actionsOnly title="Shared text" />
        {saved ? (
          <div className="flex flex-col gap-4">
            <p role="status" className="text-base font-medium">
              {saved.status === 'already_saved' ? 'That was already in your Inbox.' : 'Saved to your Inbox.'}
            </p>
            <p className="text-sm text-muted-foreground">It has a chat of its own, “{saved.title}”. Open it to ask Conker about it.</p>
            <p className="rounded-xl border px-4 py-3 text-sm break-words whitespace-pre-wrap">{text}</p>
            <div className="flex flex-wrap gap-2">
              <Button render={<Link to={gatewayConversationLink(saved.sessionId)} />}>Open</Button>
              <Button variant="outline" onClick={() => navigate('/overview')}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form className="flex flex-col gap-3" onSubmit={event => void save(event)}>
            <p className="text-sm text-muted-foreground">It goes to your Inbox as a chat of its own, kept as someone else’s words. Nothing is added to your memory.</p>
            <Label htmlFor="share-text">What you shared</Label>
            <Textarea
              id="share-text"
              value={text}
              rows={8}
              className="max-h-[45dvh] overflow-y-auto"
              readOnly={pending}
              aria-invalid={over > 0 || undefined}
              aria-describedby="share-text-help"
              onChange={event => {
                setText(event.target.value)
                if (failure) setIdentity(requestId())
                setFailure(null)
              }}
            />
            <p id="share-text-help" className={over > 0 ? 'text-sm text-destructive-foreground' : 'text-xs text-muted-foreground'}>
              {over > 0
                ? `Too long to save: the Inbox keeps up to ${count(SHARE_LIMIT)} characters. Shorten it by ${count(over)}.`
                : blank
                  ? 'Write something to save.'
                  : `${count(text.length)} of ${count(SHARE_LIMIT)} characters. Links are kept as text and not opened.`}
            </p>
            {!online && (
              <p role="status" className="text-sm text-muted-foreground">
                You’re offline. Your text stays here; save it when you’re back online.
              </p>
            )}
            {failure && (
              <p role="alert" className="text-sm text-destructive-foreground">
                {failure.message}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending || blank || over > 0 || !online}>
                {pending ? 'Saving…' : failure?.unknown ? 'Try again' : 'Save to Inbox'}
              </Button>
              <Button type="button" variant="outline" disabled={pending} onClick={leave}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </GatewayPageFrame>
  )
}
