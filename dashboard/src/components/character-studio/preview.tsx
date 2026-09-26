import { usePageSection } from '@/hooks/use-page-navigation'
import { useState } from 'react'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { StudioSection } from './fields'
import { CharacterMedia } from './media'
import { activityNames, type CharacterActivity, type CharacterDraft, type CharacterMode } from '@/lib/api/character'

export function CharacterPreview({ profile }: { profile: CharacterDraft }) {
  const section = usePageSection()
  const [mode, setMode] = useState<CharacterMode>(profile.studio.modes.default)
  const [activity, setActivity] = useState<CharacterActivity>('idle')
  const [expression, setExpression] = useState('neutral')
  const appearance = profile.studio.appearance
  const activeExpression = appearance.expressions.find(item => item.id === expression)
  const assetId = activeExpression?.assetId || appearance.activities[activity]
  const asset = appearance.assets.find(item => item.id === assetId)
  const motion = profile.studio.modes[mode].motion
  return <aside className="min-w-0 space-y-4 rounded-xl border bg-muted p-5" aria-label="Character preview">
    <StudioSection title={section === 'voice' ? 'Reference playback' : 'Artwork preview'} description={section === 'voice' ? 'Listen to the recording you attached.' : 'Check the artwork used for each activity and expression.'}>
      <div className="flex justify-center py-4"><CharacterMedia profile={profile} activity={activity} expressionId={expression} motion={motion} className="size-48" /></div>
      {section !== 'voice' && <>
        <div className="space-y-2"><Label htmlFor="preview-mode">Mode</Label><Select value={mode} onValueChange={value => setMode(value as CharacterMode)}><SelectTrigger id="preview-mode" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="focus">Focus</SelectItem><SelectItem value="character">Character</SelectItem></SelectContent></Select></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label htmlFor="preview-activity">Activity</Label><Select value={activity} onValueChange={value => setActivity(value as CharacterActivity)}><SelectTrigger id="preview-activity" className="w-full capitalize"><SelectValue /></SelectTrigger><SelectContent>{activityNames.map(value => <SelectItem key={value} value={value} className="capitalize">{value}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label htmlFor="preview-expression">Expression</Label><Select value={activeExpression ? expression : 'neutral'} onValueChange={setExpression}><SelectTrigger id="preview-expression" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="neutral">Neutral</SelectItem>{appearance.expressions.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <div className="space-y-2 border-t pt-4"><p className="text-sm font-medium break-words">{asset ? asset.name : 'Main portrait'}</p><p className="text-xs leading-5 text-muted-foreground">{asset ? (asset.kind === 'video' ? 'Motion artwork. A still portrait is used when motion is disabled or reduced.' : 'Assigned image.') : 'No separate artwork assigned to this state. Add and assign an image or clip in Appearance to change it.'}</p><p className="text-xs text-muted-foreground">Motion is {motion ? 'enabled' : 'disabled'} in {mode === 'focus' ? 'Focus' : 'Character'} mode.</p></div>
      </>}
      {section === 'voice' && profile.studio.voice.reference && <div className="space-y-3 border-t pt-4"><p className="text-sm break-words">{profile.studio.voice.reference.name}</p><audio key={profile.studio.voice.reference.src} controls preload="metadata" src={profile.studio.voice.reference.src} aria-label="Play character voice reference" className="w-full min-w-0" onPlay={() => setActivity('speaking')} onPause={() => setActivity('idle')} onEnded={() => setActivity('idle')} /><p className="text-xs leading-5 text-muted-foreground">Original recording. Voice generation is not connected.</p></div>}
    </StudioSection>
  </aside>
}
