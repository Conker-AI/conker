import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SIDE_JOBS, sideJobChoice, withSideJob, type ModelRoleAssignment } from '@/lib/api/model-roles'
import { useModels } from './models'

/** The smaller background jobs: Auto (same as the main model), Off, or one model each. */
export function SideJobsBlock() {
  const { value, enabled, pending, save, error } = useModels()
  const saved = value?.configuration
  if (!saved) return <p role={error ? 'alert' : 'status'} className="text-sm text-muted-foreground">{error || 'Loading models…'}</p>
  const roles = saved.roleSettings.roles as Record<string, ModelRoleAssignment | undefined>
  const choices = SIDE_JOBS.map(job => sideJobChoice(roles[job.role]))
  const onAuto = choices.filter(choice => choice === '__auto__').length
  const off = choices.filter(choice => choice === '__off__').length
  const allAuto = SIDE_JOBS.every((job, index) => !job.auto || choices[index] === '__auto__')
  const resetAll = () => void save(SIDE_JOBS.filter(job => job.auto).reduce((next, job) => withSideJob(next, job.role, '__auto__'), saved))
  return <Collapsible defaultOpen={false}>
    <CollapsibleTrigger className="group/side flex min-h-12 w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="text-sm">{onAuto} on Auto · {off} off</span>
      <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-panel-open/side:rotate-180" aria-hidden />
    </CollapsibleTrigger>
    <CollapsibleContent>
      <div className="divide-y">
        {SIDE_JOBS.map((job, index) => {
          const current = roles[job.role]
          // A model chosen elsewhere (such as a local ranking model) stays visible as the current choice.
          const extra = current?.modelId && !enabled.some(model => model.id === current.modelId) ? saved.models.filter(model => model.id === current.modelId) : []
          const items = [...(job.auto ? [{ value: '__auto__', label: 'Auto · same as main model' }] : []), { value: '__off__', label: job.offLabel },
            ...[...enabled, ...extra].map(model => ({ value: model.id, label: model.name }))]
          return <div key={job.role} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1"><label htmlFor={`side-job-${job.role}`} className="text-sm font-medium">{job.title}</label><p className="text-xs text-muted-foreground">{job.description}</p></div>
            <Select value={choices[index]} disabled={pending} items={items} onValueChange={next => { if (next !== null && next !== choices[index]) void save(withSideJob(saved, job.role, String(next))) }}>
              <SelectTrigger id={`side-job-${job.role}`} className="w-full sm:w-56 sm:shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>{items.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        })}
      </div>
      <Button type="button" variant="ghost" size="sm" className="mt-1" disabled={pending || allAuto} onClick={resetAll}>Reset all to Auto</Button>
    </CollapsibleContent>
  </Collapsible>
}
