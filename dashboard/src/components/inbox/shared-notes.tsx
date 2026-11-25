import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { gatewayConversationLink } from '@/components/gateway/navigation'
import type { SharedNote, SharedNotesClient } from '@/lib/gateway/shared-notes'
import { InboxCard } from './inbox-card'

/** Loads the client on first use (`control.shared`). */
export type SharedNotesInboxClient = () => Promise<Pick<SharedNotesClient, 'list' | 'dismiss'>>

/**
 * What the owner shared from another app, each in a chat of its own. These are the owner's own
 * captures, so they sit below what needs the owner and never count toward it. Open chat goes to the
 * text; Got it clears the line (the chat keeps the text until the owner forgets the chat). A failed
 * read shows nothing new.
 */
export function SharedNotes({ client, active }: { client: SharedNotesInboxClient; active: boolean }) {
  const navigate = useNavigate()
  const [items, setItems] = useState<SharedNote[]>([])
  const generation = useRef(0)
  const load = useCallback(async () => {
    const current = ++generation.current
    try {
      const notes = await (await client()).list()
      if (current === generation.current) setItems(notes)
    } catch {
      /* The rest of the Inbox still loads; the notes come back on the next read. */
    }
  }, [client])
  useEffect(() => {
    let live = true
    if (active)
      queueMicrotask(() => {
        if (live) void load()
      })
    return () => {
      live = false
    }
  }, [active, load])
  const clear = (note: SharedNote) => {
    setItems(current => current.filter(item => item.id !== note.id))
    void client()
      .then(loaded => loaded.dismiss(note.id))
      .catch(() => load())
  }
  if (!items.length) return null
  return (
    <section aria-labelledby="inbox-shared" className="flex flex-col gap-3">
      <h2 id="inbox-shared" className="text-sm font-medium text-muted-foreground">
        Shared by you
      </h2>
      {items.map(note => {
        const open = () => {
          clear(note)
          navigate(gatewayConversationLink(note.sessionId))
        }
        return (
          <InboxCard
            key={note.id}
            icon={<Share2 />}
            title={note.title}
            source={`Shared from another app · ${new Date(note.createdAt * 1000).toLocaleDateString()}`}
            summary="Kept in a chat of its own as someone else’s words. Open it to ask Conker about it."
            primary={
              <Button type="button" size="sm" onClick={open}>
                Open chat
              </Button>
            }
            actions={
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={open}>
                  Open chat
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => clear(note)}>
                  Got it
                </Button>
              </div>
            }
            facts={[
              ['From', 'You, from another app'],
              ['Saved', new Date(note.createdAt * 1000).toLocaleString()],
            ]}
            onLater={() => clear(note)}
            laterLabel="Got it"
          />
        )
      })}
    </section>
  )
}
