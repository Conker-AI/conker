import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from 'zustand'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/design-system/primitives'
import { BaseLayout } from '@/components/layouts/base-layout'
import { AppSidebar } from '@/components/app-sidebar'
import { useSidebarConfig } from '@/hooks/use-sidebar-config'
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

export function GatewayWorkspace({ runtime, activity, authStore, conversationState, activityState, sourcePrivacy, control }: {
  control: GatewayControlClient
  runtime: GatewayRuntimeClient; activity: GatewayActivityClient; authStore: GatewayAuthStore
  conversationState: GatewayRuntimeWorkspaceState; activityState: GatewayActivityWorkspaceState
  sourcePrivacy: GatewaySourcePrivacyState
}) {
  const location = useLocation(), navigate = useNavigate(), [params] = useSearchParams()
  const { config } = useSidebarConfig()
  const [harnessBySession, setHarnessBySession] = useState<Record<string, boolean>>({})
  const savedPrivacy = useCallback((id: string, disabled: boolean) => setHarnessBySession(current => ({ ...current, [id]: disabled })), [])
  const memoryActive = location.pathname === '/memory', modelsActive = location.pathname === '/settings'
  const chatActive = ['/chat', '/chats', '/companion'].includes(location.pathname)
  const supported = memoryActive || modelsActive || chatActive || location.pathname === '/activity'
  const retainedTaskId = useStore(conversationState, value => value.taskIntent?.taskId)
  const dispatchBlocked = useStore(conversationState, value => !!value.operation)
  const activityActive = location.pathname === '/activity', session = params.get('session')
  useEffect(() => {
    if (chatActive && session && /^[A-Za-z0-9_-]{1,128}$/.test(session)) conversationState.setState({ selected: session })
  }, [chatActive, conversationState, session])
  const selectSession = useCallback((id: string | null) => navigate(id ? `/chat?session=${encodeURIComponent(id)}` : '/chat'), [navigate])
  return <BaseLayout variant="canvas" header={<GatewayHeader>{chatActive && session && <GatewayPrivacyControl key={session} client={control} sessionId={session} disabled={dispatchBlocked} onPrivacy={savedPrivacy} />}</GatewayHeader>} sidebar={<AppSidebar variant={config.variant} collapsible={config.collapsible} side={config.side} ownerName="Owner" inboxCount={0} accountFooter={<Button variant="ghost" className="w-full justify-start" onClick={async () => { if (await authStore.getState().logout()) window.location.reload() }}><LogOut />Sign out</Button>} />}>
    {memoryActive && <GatewayMemoryWorkspace client={control} />}
    {modelsActive && <div className="min-h-0 flex-1 overflow-y-auto"><GatewayModelsSettings client={control} /></div>}
    {!supported && <div className="space-y-3 p-6"><PageHeader title="This workspace is not connected yet" density="compact" /><p className="text-sm text-muted-foreground">The live gateway currently connects conversations, activity, memory inspection and model settings. Your preview workspace remains available on port 5173.</p><Button variant="outline" asChild><Link to="/chat">Open live conversations</Link></Button></div>}
    <div className={cn('min-h-0 flex-1 flex-col', chatActive ? 'flex' : 'hidden')} aria-hidden={!chatActive}><GatewayRuntimeWorkspace harnessBySession={harnessBySession} control={control} client={runtime} activityClient={activity} authStore={authStore} state={conversationState} sourcePrivacy={sourcePrivacy} embedded visible={chatActive} onSelectSession={selectSession} /></div>
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
