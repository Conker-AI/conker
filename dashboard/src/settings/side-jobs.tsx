import { ChevronDown } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SIDE_JOBS, sideJobChoice, withSideJob } from "@/lib/api/model-roles"
import { useModels } from "./models"

export function SideJobsBlock() {
  const { value: models, save, pending } = useModels()

  if (!models?.configuration) {
    return <div className="text-sm text-muted-foreground">Loading models…</div>
  }

  const configuration = models.configuration
  const autoCount = SIDE_JOBS.filter(job => job.auto && sideJobChoice(configuration.roleSettings.roles[job.role as keyof typeof configuration.roleSettings.roles]) === '__auto__').length
  const offCount = SIDE_JOBS.filter(job => sideJobChoice(configuration.roleSettings.roles[job.role as keyof typeof configuration.roleSettings.roles]) === '__off__').length

  const handleChoiceChange = (role: string, choice: string) => {
    save(withSideJob(configuration, role, choice))
  }

  const resetAllToAuto = () => {
    let updated = configuration
    SIDE_JOBS.filter(job => job.auto).forEach(job => {
      updated = withSideJob(updated, job.role, '__auto__')
    })
    save(updated)
  }

  const allAutoJobsAreAuto = SIDE_JOBS.filter(job => job.auto).every(job => sideJobChoice(configuration.roleSettings.roles[job.role as keyof typeof configuration.roleSettings.roles]) === '__auto__')

  return (
    <Collapsible defaultOpen={false}>
      <CollapsibleTrigger>
        <button className="flex w-full items-center justify-between rounded-md border p-3 text-left">
          <span className="font-medium">Side jobs</span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{autoCount} on Auto · {offCount} off</span>
            <ChevronDown className="h-4 w-4 transition-transform duration-200 [&[data-state=open]]:rotate-180" />
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-0 divide-y">
        {SIDE_JOBS.map(job => {
          const currentChoice = sideJobChoice(configuration.roleSettings.roles[job.role as keyof typeof configuration.roleSettings.roles])
          const enabledModels = configuration.models.filter(model => model.enabled && configuration.providers.some(provider => provider.id === model.providerId && provider.enabled))
          
          return (
            <div key={job.role} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex-1">
                <div className="text-sm font-medium">{job.title}</div>
                <div className="text-xs text-muted-foreground">{job.description}</div>
              </div>
              <Select
                value={currentChoice}
                onValueChange={choice => choice && handleChoiceChange(job.role as string, choice)}
                disabled={pending}
              >
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {job.auto && (
                    <SelectItem value="__auto__">Auto · same as main model</SelectItem>
                  )}
                  <SelectItem value="__off__">{job.offLabel}</SelectItem>
                  {enabledModels.map(model => (
                    <SelectItem key={model.id} value={model.id || ''}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )
        })}
        <div className="pt-3">
          <button
            onClick={resetAllToAuto}
            disabled={pending || allAutoJobsAreAuto}
            className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Reset all to Auto
          </button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}