import type { ReactNode } from 'react'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BrowserSessions } from '@/components/gateway/browser-sessions'
import { GatewayProvidersSettings } from '@/components/gateway/providers-settings'
import type { GatewayAuthStore } from '@/lib/gateway/auth-store'
import type { GatewayControlClient } from '@/lib/gateway/control'
import { AccessDelegateBlock, AlwaysAskBlock, InboxButtonsBlock, ToolsUsableBlock } from './access-blocks'
import { HelperRoleBlock, IdeasBlock, JumpTo, PlaceLink, ProfileBlock, TalkingModelBlock } from './blocks-parts'
import { SideJobsBlock } from './side-jobs'

/** The settings with a screen of their own, by the `component` name in the registry. */
export function settingBlocks({ client, authStore, onSignOut }: { client: GatewayControlClient; authStore: GatewayAuthStore; onSignOut?: () => void }): Record<string, () => ReactNode> {
  return {
    profile: () => <ProfileBlock />,
    'inbox-buttons': () => <InboxButtonsBlock />,
    'talking-model': () => <TalkingModelBlock />,
    'thinking-model': () => <HelperRoleBlock role="thinking" offLabel="Off" />,
    'reviewer-model': () => <HelperRoleBlock role="reviewer" offLabel="Same as the talking model" />,
    ideas: () => <IdeasBlock />,
    'side-jobs': () => <SideJobsBlock />,
    providers: () => <GatewayProvidersSettings client={client} authStore={authStore} embedded />,
    'model-roles': () => <JumpTo target="models.providers">Edit roles under Providers and models</JumpTo>,
    'access-delegate': () => <AccessDelegateBlock />,
    'tools-usable': () => <ToolsUsableBlock />,
    'always-ask': () => <AlwaysAskBlock />,
    'browser-sessions': () => <BrowserSessions client={client} />,
    'sign-out': () => onSignOut ? <Button type="button" variant="outline" className="w-auto!" onClick={onSignOut}><LogOut />Sign out of this browser</Button> : null,
    'character-link': () => <PlaceLink to="/settings/companion">Open the companion's character</PlaceLink>,
    'agents-link': () => <PlaceLink to="/agents">Open Agents</PlaceLink>,
  }
}
