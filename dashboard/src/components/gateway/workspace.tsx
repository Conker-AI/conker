import { LocalFeaturesProvider, RetainedWorkspace, CompanionControls } from './local-features'
import SettingsPage from '@/app/settings/page'
import { EmbeddedWorkspace } from '@/contexts/embedded-workspace'
import type { ReactNode } from 'react'
import { GatewayToolDrafts } from "./tool-drafts"
import { GatewayToolsInventory } from './tools-inventory'
import { GatewaySystemStatus } from './system-status'
import { GatewayOwnerWorkspace } from './owner-workspace'
import type { GatewayOwnerClient } from '@/lib/gateway/owner'
import type { GatewayProposalClient } from '@/lib/gateway/proposals'
import type { GatewayOwnerState } from './owner-state'
import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from 'zustand'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/design-system/primitives'
import { BaseLayout } from '@/components/layouts/base-layout'
import { GatewayChatSidebar } from './chat-sidebar'
import { GatewayPrivacyControl } from './privacy-control'
import { GatewayHeader } from './header'
import { GatewayMemoryWorkspace } from './memory-workspace'
import { GatewayModelsSettings } from './models-settings'
import type { GatewayControlClient } from '@/lib/gateway/control'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { GatewayActivityClient } from '@/lib/gateway/activity'
import type { GatewayRuntimeClient } from '@/lib/gateway/runtime'
import { cn } from '@/lib/utils'
import { GatewayRuntimeWorkspace } from './runtime-workspace'
import { GatewayActivityWorkspace } from './activity-workspace'
import type { GatewayRuntimeWorkspaceState } from './runtime-state'
import type { GatewayActivityWorkspaceState } from './activity-state'
import type { GatewaySourcePrivacyState } from './source-privacy'

function GatewayWorkspaceContent({ runtime, activity, authStore, conversationState, activityState, sourcePrivacy, control, owner, ownerState, proposals, badge }: {
  /** A short marker shown beside the name, e.g. that this is a preview with sample data. */
  badge?: ReactNode
  owner: GatewayOwnerClient; ownerState: GatewayOwnerState; proposals: GatewayProposalClient
  control: GatewayControlClient
  runtime: GatewayRuntimeClient; activity: GatewayActivityClient; authStore: GatewayAuthStore
  conversationState: GatewayRuntimeWorkspaceState; activityState: GatewayActivityWorkspaceState
  sourcePrivacy: GatewaySourcePrivacyState
}) {
  const location = useLocation(), navigate = useNavigate(), [params] = useSearchParams()
  const [harnessBySession, setHarnessBySession] = useState<Record<string, boolean>>({})
  const savedPrivacy = useCallback((id: string, disabled: boolean) => setHarnessBySession(current => ({ ...current, [id]: disabled })), [])
  const memoryActive = location.pathname === '/memory', modelsActive = location.pathname === '/settings'
  const chatActive = ['/chat', '/chats', '/companion'].includes(location.pathname)
  const inboxActive = location.pathname === '/inbox'
  const toolsActive = location.pathname === '/tools'
  const homeActive = location.pathname === '/'
  const systemActive = location.pathname === '/system' && (!params.get('tab') || params.get('tab') === 'overview')
  const supported = homeActive || toolsActive || systemActive || inboxActive || memoryActive || modelsActive || chatActive || location.pathname === '/activity'
  const retainedTaskId = useStore(conversationState, value => value.taskIntent?.taskId)
  const dispatchBlocked = useStore(conversationState, value => !!value.operation)
  const activityActive = location.pathname === '/activity', session = params.get('session')
  useEffect(() => {
    if (chatActive && session && /^[A-Za-z0-9_-]{1,128}$/.test(session)) conversationState.setState({ selected: session })
  }, [chatActive, conversationState, session])
  const selectSession = useCallback((id: string | null) => navigate(id ? `/chat?session=${encodeURIComponent(id)}` : '/chat'), [navigate])
  const signOut = async () => { if (await authStore.getState().logout()) window.location.reload() }
  // Chat pages carry their own quiet top bar; other pages keep the page header.
  return <BaseLayout variant="canvas" header={chatActive ? <></> : <GatewayHeader />} sidebar={<GatewayChatSidebar runtime={runtime} owner={owner} conversationState={conversationState} sourcePrivacy={sourcePrivacy} onSignOut={() => void signOut()} badge={badge} />}>
    {badge && <div className="flex shrink-0 items-center gap-2 border-b bg-muted px-4 py-2 text-xs text-muted-foreground md:hidden">{badge}<span>Sample data · no server connected</span></div>}
    {homeActive && <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="space-y-6">
        <section className="space-y-4 rounded-xl border bg-card p-5 sm:p-6">
          <PageHeader title="Your Conker workspace" description="Talk through an idea, review what needs you, or pick up ongoing work." density="compact" />
          <div className="flex flex-wrap gap-2"><Button asChild><Link to="/companion">Talk to Conker</Link></Button><Button variant="outline" asChild><Link to="/activity">View ongoing work</Link></Button></div>
        </section>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { to: '/inbox', title: 'Decisions', text: 'Review proposed actions and requests waiting for your approval.' },
            { to: '/memory', title: 'Memory', text: 'Inspect what Conker remembers and trace information to its sources.' },
            { to: '/tools', title: 'Tools', text: 'Explore available capabilities and manage your tool drafts.' },
            { to: '/settings?tab=models', title: 'Models', text: 'Choose the model that answers you and check provider availability.' },
          ].map(item => <Link key={item.to} to={item.to} className="space-y-2 rounded-xl border bg-card p-5 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"><h2 className="font-medium">{item.title}</h2><p className="text-sm leading-6 text-muted-foreground">{item.text}</p></Link>)}
        </div>
      </div>
    </div>}
    <div className={cn('min-h-0 flex-1', inboxActive ? 'block' : 'hidden')} aria-hidden={!inboxActive}><GatewayOwnerWorkspace client={owner} proposals={proposals} state={ownerState} active={inboxActive} /></div>
    {toolsActive && (params.get("draft") || params.get("view") === "drafts" ? <GatewayToolDrafts key={params.get("draft") ?? "list"} client={control.editorDrafts} /> : <GatewayToolsInventory client={control} />)}
    {systemActive && <GatewaySystemStatus client={control} />}
    {memoryActive && <GatewayMemoryWorkspace client={control} />}
    {modelsActive && <EmbeddedWorkspace.Provider value={true}><SettingsPage models={<GatewayModelsSettings client={control} />} /></EmbeddedWorkspace.Provider>}
    {!supported && <RetainedWorkspace />}
    {chatActive && <CompanionControls />}
    <div className={cn('min-h-0 flex-1 flex-col', chatActive ? 'flex' : 'hidden')} aria-hidden={!chatActive}><GatewayRuntimeWorkspace headerExtra={session ? <GatewayPrivacyControl key={`privacy:${session}`} client={control} sessionId={session} disabled={dispatchBlocked} onPrivacy={savedPrivacy} /> : null} harnessBySession={harnessBySession} control={control} client={runtime} activityClient={activity} authStore={authStore} state={conversationState} sourcePrivacy={sourcePrivacy} visible={chatActive} onSelectSession={selectSession} /></div>
    <div className={cn('min-h-0 flex-1', activityActive ? 'block' : 'hidden')} aria-hidden={!activityActive}><GatewayActivityWorkspace client={activity} runtime={runtime} state={activityState} sourcePrivacy={sourcePrivacy} active={activityActive} dispatchBlocked={dispatchBlocked} retainedTaskId={retainedTaskId} onWork={task => {
      if (conversationState.getState().operation) return
      activityState.setState({ notice: null })
      const prior = conversationState.getState().taskIntent
      const intent = prior ? { ...prior, open: true } : { taskId: task.id, sessionId: task.sessionId, open: true }
      conversationState.setState({ selected: intent.sessionId, taskIntent: intent })
      selectSession(intent.sessionId)
    }} /></div>
  </BaseLayout>
}

export function GatewayWorkspace(props: Parameters<typeof GatewayWorkspaceContent>[0]) {
  return <LocalFeaturesProvider><GatewayWorkspaceContent {...props} /></LocalFeaturesProvider>
}
