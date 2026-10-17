import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { LayoutTemplate, X } from 'lucide-react'
import { TemplateFields } from '@/components/chat/template-fields'
import { builtinTemplates, missingRequired } from '@/lib/chat/prompt-templates'
import { chooseTemplate, changeTemplateValues, findTemplate, templateText, useTemplateEntry, useTemplateActive } from './template-store'

export function TemplatePicker({ draftKey, disabled }: { draftKey: string; disabled?: boolean }) {
  const active = useTemplateActive(draftKey)
  const entry = useTemplateEntry(draftKey)
  const template = entry ? findTemplate(entry.templateId) : null
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button type="button" size="sm" variant="ghost" disabled={disabled} aria-label={`Prompt template: ${template ? template.name : "none"}`}><LayoutTemplate className="size-4" />{template ? template.name : "Template"}</Button></DropdownMenuTrigger>
    <DropdownMenuContent align="start">
      {builtinTemplates.map(t => <DropdownMenuItem key={t.id} onSelect={() => chooseTemplate(draftKey, t.id)}><div><div>{t.name}</div><div className="text-xs text-muted-foreground">{t.description}</div></div></DropdownMenuItem>)}
      {active && <><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => chooseTemplate(draftKey, null)}>No template</DropdownMenuItem></>}
    </DropdownMenuContent>
  </DropdownMenu>
}

export function TemplateInput({ draftKey, disabled, onText, onSubmit }: { draftKey: string; disabled?: boolean; onText: (text: string) => void; onSubmit: () => void }) {
  const entry = useTemplateEntry(draftKey)
  if (!entry) return null
  const template = findTemplate(entry.templateId)
  if (!template) return null
  const missing = missingRequired(template, entry.values)
  return <div className="px-4 pt-3">
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground"><LayoutTemplate className="size-3" />{template.name}</span>
      <Button type="button" size="icon" variant="ghost" aria-label="Leave template" onClick={() => chooseTemplate(draftKey, null)}><X className="size-4" /></Button>
    </div>
    <TemplateFields template={template} values={entry.values} disabled={disabled} onSubmit={onSubmit} onChange={values => { changeTemplateValues(draftKey, values); onText(templateText(template, values)) }} />
    {missing.length > 0 && <p className="pb-1 text-xs text-muted-foreground">Fill in: {missing.join(", ")}</p>}
    <TemplateInitEffect templateId={entry.templateId} template={template} values={entry.values} onText={onText} />
  </div>
}

function TemplateInitEffect({ templateId, template, values, onText }: { templateId: string; template: Parameters<typeof templateText>[0]; values: Parameters<typeof templateText>[1]; onText: (text: string) => void }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onText(templateText(template, values)) }, [templateId])
  return null
}