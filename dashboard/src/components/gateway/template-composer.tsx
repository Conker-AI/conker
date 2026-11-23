import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { LayoutTemplate, X } from 'lucide-react'
import { TemplateFields } from '@/components/chat/template-fields'
import { Link } from 'react-router-dom'
import { missingRequired } from '@/lib/chat/prompt-templates'
import type { PromptTemplatesClient } from '@/lib/gateway/prompt-templates'
import { chooseTemplate, changeTemplateValues, loadTemplates, templateText, useTemplateCatalogue, useTemplateEntry, useTemplateActive } from './template-store'
import { composerItem, useComposerValue } from '@/components/chat/composer-items'
import { cn } from '@/lib/utils'

export function TemplatePicker({ draftKey, disabled, client }: { draftKey: string; disabled?: boolean; client?: Pick<PromptTemplatesClient, 'list'> }) {
  const active = useTemplateActive(draftKey)
  const entry = useTemplateEntry(draftKey)
  const catalogue = useTemplateCatalogue()
  const template = entry?.template ?? null
  useComposerValue('template', template ? template.name : null)
  const label = template ? `Template: ${template.name}` : 'Template'
  return (
    <DropdownMenu
      onOpenChange={open => {
        if (open && client) void loadTemplates(client)
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant={template ? 'secondary' : 'ghost'}
            aria-pressed={Boolean(template)}
            className={cn('font-normal', !template && 'text-muted-foreground')}
            disabled={disabled}
            aria-label={`Prompt template: ${template ? template.name : 'none'}`}
            title={`Prompt template: ${template ? template.name : 'none'}`}
          />
        }
      >
        <LayoutTemplate className="size-4" />
        <span data-label className="sr-only">
          {label}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-72 max-w-[calc(100vw-2rem)]">
        {catalogue.items.map(t => (
          <DropdownMenuItem key={t.id} onClick={() => chooseTemplate(draftKey, t)}>
            <div>
              <div>{t.name}</div>
              {t.description && <div className="text-xs text-muted-foreground">{t.description}</div>}
            </div>
          </DropdownMenuItem>
        ))}
        {catalogue.status === 'loading' && !catalogue.items.length && (
          <p role="status" className="px-2 py-1.5 text-xs text-muted-foreground">
            Loading templates…
          </p>
        )}
        {catalogue.status === 'error' && (
          <div className="space-y-1 px-2 py-1.5">
            <p role="alert" className="text-xs text-destructive-foreground">
              {catalogue.error}
            </p>
            {client && (
              <Button type="button" size="sm" variant="outline" onClick={() => void loadTemplates(client)}>
                Try again
              </Button>
            )}
          </div>
        )}
        {catalogue.status === 'ready' && !catalogue.items.length && <p className="px-2 py-1.5 text-xs text-muted-foreground">No templates yet. Make one in Prompt templates.</p>}
        {active && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => chooseTemplate(draftKey, null)}>No template</DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link to="/agents?tab=templates" />}>Manage templates</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
composerItem(TemplatePicker, 'template')

export function TemplateInput({ draftKey, disabled, onText, onSubmit }: { draftKey: string; disabled?: boolean; onText: (text: string) => void; onSubmit: () => void }) {
  const entry = useTemplateEntry(draftKey)
  if (!entry) return null
  const template = entry.template
  const missing = missingRequired(template, entry.values)
  return (
    <div className="px-4 pt-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <LayoutTemplate className="size-3" />
          {template.name}
        </span>
        <Button type="button" size="icon" variant="ghost" aria-label="Leave template" onClick={() => chooseTemplate(draftKey, null)}>
          <X className="size-4" />
        </Button>
      </div>
      <TemplateFields
        template={template}
        values={entry.values}
        disabled={disabled}
        onSubmit={onSubmit}
        onChange={values => {
          changeTemplateValues(draftKey, values)
          onText(templateText(template, values))
        }}
      />
      {missing.length > 0 && <p className="pb-1 text-xs text-muted-foreground">Fill in: {missing.join(', ')}</p>}
      <TemplateInitEffect templateId={template.id} template={template} values={entry.values} onText={onText} />
    </div>
  )
}

function TemplateInitEffect({ templateId, template, values, onText }: { templateId: string; template: Parameters<typeof templateText>[0]; values: Parameters<typeof templateText>[1]; onText: (text: string) => void }) {
  useEffect(() => {
    onText(templateText(template, values))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId])
  return null
}
