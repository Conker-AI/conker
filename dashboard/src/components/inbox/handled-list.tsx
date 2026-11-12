import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { AccessClient, HandledAction } from '@/lib/gateway/access'

const WHO: Record<HandledAction['decidedBy'], string> = {
  tool_default: 'Free by its own setting',
  agent: 'The agent’s setting',
  chat: 'This chat’s access switch',
  ai_reviewer: 'The AI check',
  owner_request: 'Your own request',
}

const OWN: Record<string, string> = {
  'conker.remember': 'Remembered something', 'conker.schedule': 'Made a cron job', 'conker.draft_tool': 'Drafted a tool',
  'conker.create_agent': 'Made an agent', 'conker.create_team': 'Made a team', 'conker.run_agent': 'Ran another agent', 'conker.recall': 'Searched memory',
}
// What Conker made at once is undone by archiving it where it lives (Handled items do not name it).
const UNDO: Record<string, { to: string; label: string }> = {
  'conker.create_agent': { to: '/agents', label: 'Archive it in Agents' }, 'conker.create_team': { to: '/agents?tab=teams', label: 'Archive it in Teams' },
}

function when(seconds: number, now: number) {
  const minutes = Math.max(1, Math.floor((now - seconds * 1000) / 60_000))
  return minutes < 60 ? `${minutes} min ago` : minutes < 1440 ? `${Math.floor(minutes / 60)} hr ago` : `${Math.floor(minutes / 1440)} days ago`
}

/** Inbox, Handled: what ran in the last week without asking you, and who decided. */
export function HandledList({ client, now }: { client: AccessClient; now: number }) {
  const [items, setItems] = useState<HandledAction[] | null>(null), [failed, setFailed] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    client.handled(controller.signal).then(value => { if (!controller.signal.aborted) setItems(value) }).catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => controller.abort()
  }, [client])
  if (failed) return <p className="text-sm text-muted-foreground">Handled actions didn’t load.</p>
  if (items === null) return <p role="status" className="text-sm text-muted-foreground">Loading…</p>
  if (!items.length) return <p className="text-sm text-muted-foreground">Nothing ran without asking you this week.</p>
  return <ul className="divide-y rounded-lg border">{items.map(item => <li key={item.id} className="space-y-0.5 p-3">
    <p className="text-sm"><span className="font-medium">{OWN[item.toolId] ?? item.toolId}</span> <span className="text-muted-foreground">· {when(item.createdAt, now)}</span></p>
    <p className="text-xs leading-5 text-muted-foreground">{WHO[item.decidedBy]}{item.reason && item.decidedBy !== 'tool_default' ? `: ${item.reason}` : ''}</p>
    <p className="flex flex-wrap gap-x-3 text-xs">
      {item.sessionId && <Link className="underline underline-offset-4" to={`/chat?session=${encodeURIComponent(item.sessionId)}`}>Open the chat</Link>}
      {UNDO[item.toolId] && <Link className="underline underline-offset-4" to={UNDO[item.toolId].to}>{UNDO[item.toolId].label}</Link>}
    </p>
  </li>)}</ul>
}
