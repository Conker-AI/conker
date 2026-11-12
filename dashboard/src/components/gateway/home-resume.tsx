import { useEffect, useState } from 'react'
import { ArrowUpRight, CircleAlert, History, RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { IdentityMark, type IdentityKind } from '@/components/brand/identity-mark'
import { serviceIn } from '@/components/brand/service'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { GatewayTask } from '@/lib/gateway/activity'
import type { GatewayEditorDrafts } from '@/lib/gateway/editor-drafts'
import type { GatewayRuntimeClient } from '@/lib/gateway/runtime'
import { readOpenedChats } from '@/lib/recent-chats'
import { buildResume, RESUME_LIMIT, resumeAge, resumeChats, type ResumeEditorDraft, type ResumeInput, type ResumeItem, type ResumeMessageDraft } from './home-resume-model'

type Sources = Omit<ResumeInput, 'tasks'>
type Ready = { status: 'ready'; sources: Sources; partial: boolean; failed: boolean }
type State = { status: 'loading' } | Ready
type Props = { runtime: Pick<GatewayRuntimeClient, 'getSessionHistory' | 'drafts'>; editor: Pick<GatewayEditorDrafts, 'list' | 'publications'>; tasks: GatewayTask[]; refresh: number }

const marks: Record<ResumeItem['kind'], IdentityKind> = { 'tool-draft': 'tool', 'workflow-draft': 'workflow', 'message-draft': 'chat', chat: 'chat', task: 'task' }

/** Unpublished edits: the newest drafts, each with the newest revision ToolGate published from it. */
async function editorDrafts(editor: Props['editor'], signal: AbortSignal): Promise<{ drafts: ResumeEditorDraft[]; partial: boolean }> {
  const page = await editor.list(undefined, signal)
  const newest = [...page.items].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, RESUME_LIMIT + 2)
  const published = await Promise.allSettled(newest.map(item => editor.publications(item.id, signal)))
  return {
    drafts: newest.map((item, index) => {
      const result = published[index]
      const publishedRevision = result.status === 'rejected' ? undefined : result.value.length ? Math.max(...result.value.map(version => version.revision)) : null
      return { id: item.id, name: item.name, kind: item.kind, revision: item.revision, updatedAt: item.updated_at, publishedRevision }
    }),
    partial: published.some(result => result.status === 'rejected'),
  }
}

async function loadSources(runtime: Props['runtime'], editor: Props['editor'], signal: AbortSignal): Promise<Ready> {
  const opened = readOpenedChats()
  const [edits, history, fresh] = await Promise.allSettled([editorDrafts(editor, signal), runtime.getSessionHistory({ limit: 50, signal }), runtime.drafts.load('new', signal)])
  const chats = history.status === 'fulfilled' ? history.value.rows : []
  // Unsent messages are read only for the chats Home may offer; Pi has no list of drafts.
  const shown = resumeChats(chats, opened).map(item => item.chat.id)
  const saved = await Promise.allSettled(shown.map(id => runtime.drafts.load(id, signal)))
  const messageDrafts: ResumeMessageDraft[] = [fresh, ...saved].flatMap(result => result.status === 'fulfilled'
    ? [{ sessionId: result.value.sessionId, text: result.value.text, updatedAt: result.value.updatedAt }] : [])
  const sources = { editorDrafts: edits.status === 'fulfilled' ? edits.value.drafts : [], chats, opened, messageDrafts }
  return { status: 'ready', sources, failed: edits.status === 'rejected' && history.status === 'rejected' && fresh.status === 'rejected',
    partial: [edits, history, fresh, ...saved].some(result => result.status === 'rejected') || (edits.status === 'fulfilled' && edits.value.partial) }
}

function ResumeCard({ item }: { item: ResumeItem }) {
  return <li className="home-resume-item min-w-0"><Link to={item.href} className="flex h-full min-w-0 items-center gap-3 rounded-xl border bg-card px-3 py-3 text-card-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none">
    <IdentityMark brand={item.kind === 'tool-draft' ? serviceIn(item.title) : null} kind={marks[item.kind]} name={item.title} />
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium">{item.title}</span>
      <span className="block truncate text-xs text-muted-foreground">{item.label} · <span className="tabular-nums">{resumeAge(item.at)}</span></span>
    </span>
  </Link></li>
}

function SeeAll({ to, children }: { to: string; children: string }) {
  return <Link to={to} className="inline-flex min-h-6 shrink-0 items-center gap-1 rounded-sm text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">{children}<ArrowUpRight className="size-3.5" aria-hidden="true" /></Link>
}

function ResumeLoading() {
  return <div role="status" aria-label="Loading" aria-busy="true" className="home-resume">{[0, 1, 2].map(index => <Skeleton key={index} className="h-16 rounded-xl motion-reduce:animate-none" />)}</div>
}

/**
 * Home's "Jump back in": the owner's unfinished and recent work in one row, one click from where he
 * left it. Hidden when there is nothing; a source that did not load says so instead of looking empty.
 */
export function HomeJumpBackIn({ runtime, editor, tasks, refresh }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void loadSources(runtime, editor, controller.signal).then(next => { if (!controller.signal.aborted) setState(next) })
    return () => controller.abort()
  }, [runtime, editor, refresh, retry])
  const items = state.status === 'ready' ? buildResume({ ...state.sources, tasks }) : []
  if (state.status === 'ready' && !items.length && !state.partial) return null
  const tryAgain = () => { setState({ status: 'loading' }); setRetry(value => value + 1) }

  return <section aria-labelledby="home-resume" className="min-w-0 space-y-3">
    <div className="flex min-h-7 flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <h2 id="home-resume" className="flex min-w-0 items-center gap-2 text-sm font-normal text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0"><History aria-hidden="true" /><span className="truncate">Jump back in</span></h2>
      <div className="flex flex-wrap items-center gap-3"><SeeAll to="/chats">All chats</SeeAll><SeeAll to="/tools?view=drafts">All drafts</SeeAll></div>
    </div>
    {state.status === 'loading' ? <ResumeLoading /> : <>
      {!!items.length && <ul className="home-resume">{items.map(item => <ResumeCard key={item.key} item={item} />)}</ul>}
      {state.partial && <p role={items.length ? undefined : 'alert'} className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <CircleAlert className="size-4 shrink-0 text-destructive-foreground" aria-hidden="true" />{state.failed && !items.length ? 'Not loaded.' : 'Some items didn’t load.'}
        <Button type="button" size="xs" variant="outline" onClick={tryAgain}><RotateCcw />Try again</Button>
      </p>}
    </>}
  </section>
}
