import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import type { AgentConfiguration, GatewayControlClient } from '@/lib/gateway/control'
import type { SkillMetadata } from '@/lib/gateway/skills'

const MAX_SKILLS = 3

/** Up to three skills this agent always carries, on top of the ones picked for a message. A skill never grants a tool. */
export function AgentSkills({ client, value, onChange, disabled }: { client: GatewayControlClient; value: AgentConfiguration; onChange: (value: AgentConfiguration) => void; disabled: boolean }) {
  const [skills, setSkills] = useState<SkillMetadata[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [round, setRound] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    client.skills.list(controller.signal).then(rows => { if (!controller.signal.aborted) { setSkills(rows); setFailed(false) } }).catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => controller.abort()
  }, [client, round])
  const chosen = value.skillIds ?? []
  // Pi leaves the key out when an agent has none, so a save of an empty list stays the same document.
  const set = (ids: string[]) => {
    const { skillIds, ...rest } = value
    void skillIds
    onChange(ids.length ? { ...rest, skillIds: ids } : rest)
  }
  const toggle = (id: string, on: boolean) => set(on ? [...chosen, id] : chosen.filter(item => item !== id))
  const enabled = (skills ?? []).filter(skill => skill.enabled)
  // A chosen skill that was removed or turned off stays listed: Pi skips it at the next chat and names it, and the owner can drop it here.
  const gone = chosen.filter(id => skills && !enabled.some(skill => skill.id === id))
  return <fieldset className="space-y-2" disabled={disabled}>
    <legend className="text-sm font-medium">Skills</legend>
    <p className="text-xs leading-5 text-muted-foreground">Up to {MAX_SKILLS} skills this agent always has in ordinary chats. A skill gives it know-how, never a tool or more access.</p>
    {failed && !skills ? <p role="alert" className="text-xs text-destructive-foreground">Skills didn’t load. <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setRound(current => current + 1)}>Try again</Button></p>
      : skills === null ? <p role="status" className="text-xs text-muted-foreground">Loading skills…</p>
        : !enabled.length && !gone.length ? <p className="text-xs text-muted-foreground">No enabled skills yet. Import a SKILL.md under Agents, then Skills.</p>
          : <ul className="divide-y rounded-lg border">
            {enabled.map(skill => {
              const on = chosen.includes(skill.id), full = !on && chosen.length >= MAX_SKILLS
              return <li key={skill.id} className="p-2.5"><Label className="flex items-start gap-3"><Checkbox checked={on} disabled={full} onCheckedChange={next => toggle(skill.id, next === true)} className="mt-0.5" />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm">{skill.name}</span>{skill.description && <span className="block text-xs leading-5 text-muted-foreground">{skill.description}</span>}</span></Label></li>
            })}
            {gone.map(id => <li key={id} className="flex items-center justify-between gap-3 p-2.5"><span className="min-w-0 text-sm"><span className="block truncate">{id}</span><span className="block text-xs text-muted-foreground">Removed or turned off. It is skipped until you turn it back on.</span></span>
              <Button type="button" size="sm" variant="outline" onClick={() => toggle(id, false)}>Remove</Button></li>)}
          </ul>}
    {chosen.length >= MAX_SKILLS && <p role="status" className="text-xs text-muted-foreground">That is the most an agent can carry. Untick one to pick another.</p>}
  </fieldset>
}
