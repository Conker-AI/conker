import { useCallback, useEffect } from 'react'
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from 'zustand'
import { LogOut } from 'lucide-react'
import { CompanionPortrait } from '@/components/companion-portrait'
import { ModeToggle } from '@/components/mode-toggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { GatewayActivityClient } from '@/lib/gateway/activity'
import type { GatewayRuntimeClient } from '@/lib/gateway/runtime'
import { cn } from '@/lib/utils'
import { GatewayRuntimeWorkspace } from './runtime-workspace'
import { GatewayActivityWorkspace } from './activity-workspace'
import type { GatewayRuntimeWorkspaceState } from './runtime-state'
import type { GatewayActivityWorkspaceState } from './activity-state'
import type { GatewaySourcePrivacyState } from './source-privacy'

export function GatewayWorkspace({ runtime, activity, authStore, conversationState, activityState, sourcePrivacy }: {
  runtime: GatewayRuntimeClient; activity: GatewayActivityClient; authStore: GatewayAuthStore
  conversationState: GatewayRuntimeWorkspaceState; activityState: GatewayActivityWorkspaceState
  sourcePrivacy: GatewaySourcePrivacyState
}) {
  const location = useLocation(), navigate = useNavigate(), [params] = useSearchParams()
  const selected = useStore(conversationState, state => state.selected)
  const activityActive = location.pathname === '/activity', session = params.get('session')
  const tab = params.get('tab') === 'runs' ? 'runs' : params.get('tab') === 'events' ? 'events' : 'tasks'
  useEffect(() => {
    if (!activityActive && session && /^[A-Za-z0-9_-]{1,128}$/.test(session)) conversationState.setState({ selected: session })
  }, [activityActive, conversationState, session])
  useEffect(() => { if (location.pathname !== '/chats' && location.pathname !== '/activity') navigate('/chats', { replace: true }) }, [location.pathname, navigate])
  const selectSession = useCallback((id: string | null) => navigate(id ? `/chats?session=${encodeURIComponent(id)}` : '/chats'), [navigate])
  const navClass = (active: boolean) => cn('inline-flex min-h-(--control-height) shrink-0 items-center border-b-2 px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring', active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')
  return <div className="flex h-svh min-h-0 flex-col bg-background text-foreground">
    <header className="shrink-0 border-b"><div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6"><CompanionPortrait portrait="/conker.png" name="Conker" tone="graphite" /><span className="font-semibold">Conker</span><Badge variant="outline">Live gateway</Badge><div className="ml-auto flex items-center gap-2"><ModeToggle /><Button size="sm" variant="ghost" onClick={async () => { if (await authStore.getState().logout()) window.location.reload() }}><LogOut />Sign out</Button></div></div>
      <nav aria-label="Workspace" className="flex overflow-x-auto px-4 sm:px-6"><NavLink to={selected ? `/chats?session=${encodeURIComponent(selected)}` : '/chats'} className={navClass(!activityActive)}>Conversations</NavLink><NavLink to="/activity?tab=tasks" className={navClass(activityActive)}>Activity</NavLink></nav>
      {activityActive && <nav aria-label="Activity sections" className="flex overflow-x-auto border-t px-4 sm:px-6">{(['tasks', 'runs', 'events'] as const).map(value => <Link key={value} aria-current={tab === value ? 'page' : undefined} className={navClass(tab === value)} to={`/activity?tab=${value}`}>{value[0].toUpperCase() + value.slice(1)}</Link>)}</nav>}
    </header>
    <div className={cn('min-h-0 flex-1 flex-col', activityActive ? 'hidden' : 'flex')} aria-hidden={activityActive}><GatewayRuntimeWorkspace client={runtime} authStore={authStore} state={conversationState} sourcePrivacy={sourcePrivacy} embedded visible={!activityActive} onSelectSession={selectSession} /></div>
    <div className={cn('min-h-0 flex-1', activityActive ? 'block' : 'hidden')} aria-hidden={!activityActive}><GatewayActivityWorkspace client={activity} runtime={runtime} state={activityState} sourcePrivacy={sourcePrivacy} active={activityActive} /></div>
  </div>
}
