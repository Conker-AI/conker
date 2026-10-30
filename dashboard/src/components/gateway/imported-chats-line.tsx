import { useEffect, useState } from 'react'
import { Archive, ChevronRight, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { GatewayImportsClient } from '@/lib/gateway/imports'

/** One slot under the Chats list for old chats from ChatGPT or Claude: how to bring them in, then where they are. */
export function ImportedChatsLine({ client }: { client: GatewayImportsClient }) {
  const [imported, setImported] = useState<number | null>(null)
  useEffect(() => { let active = true; client.chats({ limit: 1 }).then(page => { if (active) setImported(page.total) }).catch(() => undefined); return () => { active = false } }, [client])
  if (imported === null) return null
  return <Link to={imported ? '/chats?view=imported' : '/chats?view=import'} className="flex min-h-11 min-w-0 items-center gap-3 rounded-lg border px-4 py-3 outline-none hover:bg-accent focus-visible:bg-accent">
    {imported ? <Archive aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /> : <Upload aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
    <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{imported ? 'Imported chats' : 'Import from ChatGPT or Claude'}</span><span className="block truncate text-sm text-muted-foreground">{imported ? `${imported.toLocaleString()} ${imported === 1 ? 'chat' : 'chats'}, read-only` : 'Read-only copies of old chats'}</span></span>
    <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
  </Link>
}
