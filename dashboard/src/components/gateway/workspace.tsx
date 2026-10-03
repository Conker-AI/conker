import type { ReactNode } from 'react'
import type { GatewayOwnerClient } from '@/lib/gateway/owner'
import type { GatewayProposalClient } from '@/lib/gateway/proposals'
import type { GatewayOwnerState } from './owner-state'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from 'zustand'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/design-system/primitives'
import { BaseLayout } from '@/components/layouts/base-layout'
import { GatewayChatSidebar } from './chat-sidebar'
import { GatewayPrivacyControl } from './privacy-control'
import { GatewayHeader } from './header'
import { WorkspaceChromeProvider } from '@/components/design-system/workspace-chrome'
import { UniversalSearchProvider } from './universal-search'
import type { GatewayControlClient } from '@/lib/gateway/control'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { GatewayActivityClient } from '@/lib/gateway/activity'
import type { GatewayRuntimeClient } from '@/lib/gateway/runtime'
import { cn } from '@/lib/utils'
import { GatewayRuntimeWorkspace } from './runtime-workspace'
import type { GatewayRuntimeWorkspaceState } from './runtime-state'
import type { GatewayActivityWorkspaceState } from './activity-state'
import type { GatewaySourcePrivacyState } from './source-privacy'
import { gatewayAgentSection, gatewaySystemSection, resolveGatewayRoute } from './navigation'

const GatewayToolDrafts = lazy(() => import('./tool-drafts').then(module => ({ default: module.GatewayToolDrafts })))
const GatewayToolsInventory = lazy(() => import('./tools-inventory').then(module => ({ default: module.GatewayToolsInventory })))
const GatewaySystemStatus = lazy(() => import('./system-status').then(module => ({ default: module.GatewaySystemStatus })))
const GatewayOwnerWorkspace = lazy(() => import('./owner-workspace').then(module => ({ default: module.GatewayOwnerWorkspace })))
const GatewayMemoryWorkspace = lazy(() => import('./memory-workspace').then(module => ({ default: module.GatewayMemoryWorkspace })))
const GatewayModelsSettings = lazy(() => import('./models-settings').then(module => ({ default: module.GatewayModelsSettings })))
const GatewaySetupProgress = lazy(() => import('./setup-progress').then(module => ({ default: module.GatewaySetupProgress })))
const GatewayActivityWorkspace = lazy(() => import('./activity-workspace').then(module => ({ default: module.GatewayActivityWorkspace })))
const GatewayAgentsWorkspace = lazy(() => import('./agents-workspace').then(module => ({ default: module.GatewayAgentsWorkspace })))
const GatewayTodayWorkspace = lazy(() => import('./today-workspace').then(module => ({ default: module.GatewayTodayWorkspace })))
const GatewayChatsWorkspace = lazy(() => import('./chats-workspace').then(module => ({ default: module.GatewayChatsWorkspace })))
const GatewayProjectsWorkspace = lazy(() => import('./projects-workspace').then(module => ({ default: module.GatewayProjectsWorkspace })))
const GatewayArtifactsWorkspace = lazy(() => import('./artifacts-workspace').then(module => ({ default: module.GatewayArtifactsWorkspace })))
const GatewayJobsWorkspace = lazy(() => import('./jobs-workspace').then(module => ({ default: module.GatewayJobsWorkspace })))
const GatewayCharacterWorkspace = lazy(() => import('./character-workspace').then(module => ({ default: module.GatewayCharacterWorkspace })))
const GatewayHostInventoryWorkspace = lazy(() => import('./host-inventory-workspace').then(module => ({ default: module.GatewayHostInventoryWorkspace })))
const GatewayTeamsWorkspace = lazy(() => import('./teams-workspace').then(module => ({ default: module.GatewayTeamsWorkspace })))
const GatewayFilesystemWorkspace = lazy(() => import('./filesystem-workspace').then(module => ({ default: module.GatewayFilesystemWorkspace })))
const GatewayTerminalWorkspace = lazy(() => import('./terminal-workspace').then(module => ({ default: module.GatewayTerminalWorkspace })))

const workspaceFallback = <div className="min-h-0 flex-1 space-y-6 p-4 sm:p-6 lg:p-8" role="status" aria-busy="true">
  <span className="sr-only">Opening workspace…</span>
  <Skeleton className="h-10 w-full" />
  <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]"><Skeleton className="h-64 w-full" /><Skeleton className="h-48 w-full" /></div>
</div>

export function GatewayWorkspace({ runtime, activity, authStore, conversationState, activityState, sourcePrivacy, control, owner, ownerState, proposals, badge }: {
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
  const route = resolveGatewayRoute(location.pathname)
  const memoryActive = route === 'memory', modelsActive = route === 'settings'
  const homeActive = route === 'today', setupActive = route === 'setup', chatActive = route === 'chat', chatsActive = route === 'chats'
  const inboxActive = route === 'inbox', toolsActive = route === 'tools', agentsActive = route === 'agents'
  const companionSettingsActive = route === 'companion-settings', projectsActive = route === 'projects'
  const artifactsActive = route === 'artifacts', jobsActive = route === 'jobs', activityActive = route === 'activity'
  const systemActive = route === 'system', systemTab = gatewaySystemSection(location.search)
  const supported = route !== null
  const retainedTaskId = useStore(conversationState, value => value.taskIntent?.taskId)
  const dispatchBlocked = useStore(conversationState, value => !!value.operation)
  const session = params.get('session')
  useEffect(() => {
    if (chatActive && session && /^[A-Za-z0-9_-]{1,128}$/.test(session)) conversationState.setState({ selected: session })
  }, [chatActive, conversationState, session])
  const selectSession = useCallback((id: string | null) => navigate(id ? `/chat?session=${encodeURIComponent(id)}` : '/chat'), [navigate])
  const signOut = async () => { if (await authStore.getState().logout()) window.location.reload() }
  // Chat and Memory own their header so their controls stay with workspace state.
  return <UniversalSearchProvider><WorkspaceChromeProvider><BaseLayout variant="canvas" header={chatActive || memoryActive ? <></> : <GatewayHeader />} sidebar={<GatewayChatSidebar runtime={runtime} owner={owner} control={control} conversationState={conversationState} sourcePrivacy={sourcePrivacy} onSignOut={() => void signOut()} badge={badge} />}>
    <Suspense fallback={workspaceFallback}>
      {homeActive && <GatewayTodayWorkspace runtime={runtime} activity={activity} owner={owner} proposals={proposals} control={control} />}
      {chatsActive && <GatewayChatsWorkspace runtime={runtime} conversationState={conversationState} sourcePrivacy={sourcePrivacy} />}
      {setupActive && <GatewaySetupProgress client={control} />}
      {inboxActive && <div className="min-h-0 flex-1"><GatewayOwnerWorkspace client={owner} proposals={proposals} state={ownerState} active /></div>}
      {toolsActive && (params.get("draft") || params.get("view") === "drafts" ? <GatewayToolDrafts key={params.get("draft") ?? "list"} client={control.editorDrafts} /> : <GatewayToolsInventory client={control} />)}
      {systemActive && (systemTab === 'overview' ? <GatewaySystemStatus client={control} /> : systemTab === 'terminal' ? <GatewayTerminalWorkspace client={control.terminal} /> : systemTab === 'files' ? <GatewayFilesystemWorkspace client={control.filesystem} /> : <GatewayHostInventoryWorkspace client={control.hostInventory} section={systemTab as 'processes' | 'ports' | 'containers'} />)}
      {memoryActive && <GatewayMemoryWorkspace client={control} />}
      {modelsActive && <div className="min-h-0 flex-1 overflow-y-auto"><GatewayModelsSettings client={control} /></div>}
      {agentsActive && (location.pathname.replace(/\/+$/, '') === '/agents' && gatewayAgentSection(location.search) === 'teams' ? <GatewayTeamsWorkspace control={control} runtime={runtime} /> : <GatewayAgentsWorkspace client={control} />)}
      {companionSettingsActive && (params.get('tab') === 'harness' ? <GatewayAgentsWorkspace client={control} companion /> : <GatewayCharacterWorkspace client={control} />)}
      {projectsActive && <GatewayProjectsWorkspace control={control} runtime={runtime} activity={activity} />}
      {artifactsActive && <GatewayArtifactsWorkspace control={control} activity={activity} />}
      {jobsActive && <GatewayJobsWorkspace control={control} />}
    </Suspense>
    {!supported && <div className="space-y-3 p-6"><PageHeader title="This workspace is not connected yet" density="compact" /><p className="text-sm text-muted-foreground">The live gateway currently connects today, conversations, projects, artifacts, jobs, activity, approvals, agents, memory, tools, models and diagnostics.</p><Button variant="outline" asChild><Link to="/chat">Open live conversations</Link></Button></div>}
    <div className={cn('min-h-0 flex-1 flex-col', chatActive ? 'flex' : 'hidden')} aria-hidden={!chatActive}><GatewayRuntimeWorkspace headerExtra={session ? <GatewayPrivacyControl key={`privacy:${session}`} client={control} sessionId={session} disabled={dispatchBlocked} onPrivacy={savedPrivacy} /> : null} harnessBySession={harnessBySession} control={control} client={runtime} activityClient={activity} authStore={authStore} state={conversationState} sourcePrivacy={sourcePrivacy} visible={chatActive} onSelectSession={selectSession} /></div>
    {activityActive && <Suspense fallback={workspaceFallback}><div className="min-h-0 flex-1"><GatewayActivityWorkspace client={activity} runtime={runtime} state={activityState} sourcePrivacy={sourcePrivacy} active dispatchBlocked={dispatchBlocked} retainedTaskId={retainedTaskId} onWork={task => {
      if (conversationState.getState().operation) return
      activityState.setState({ notice: null })
      const prior = conversationState.getState().taskIntent
      const intent = prior ? { ...prior, open: true } : { taskId: task.id, sessionId: task.sessionId, open: true }
      conversationState.setState({ selected: intent.sessionId, taskIntent: intent })
      selectSession(intent.sessionId)
    }} /></div></Suspense>}
  </BaseLayout></WorkspaceChromeProvider></UniversalSearchProvider>
}
