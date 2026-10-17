import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { builtinTemplates, compilePrompt, emptyValues, missingRequired, type PromptTemplate, type TemplateValues } from '@/lib/chat/prompt-templates'

type Entry = { templateId: string; values: TemplateValues }
const store = createStore<{ entries: Record<string, Entry> }>(() => ({ entries: {} }))

export const findTemplate = (id: string): PromptTemplate | null => builtinTemplates.find(item => item.id === id) ?? null
/** The draft text for a template: empty until every required field is filled, so it cannot be sent early. */
export const templateText = (template: PromptTemplate, values: TemplateValues) => missingRequired(template, values).length ? '' : compilePrompt(template, values)
export function chooseTemplate(key: string, templateId: string | null) {
  store.setState(state => {
    if (templateId === null) { const entries = { ...state.entries }; delete entries[key]; return { entries } }
    const template = findTemplate(templateId)
    if (!template) return state
    return { entries: { ...state.entries, [key]: { templateId, values: emptyValues(template) } } }
  })
}
export function changeTemplateValues(key: string, values: TemplateValues) {
  store.setState(state => {
    const entry = state.entries[key]
    if (!entry) return state
    return { entries: { ...state.entries, [key]: { ...entry, values } } }
  })
}
export const useTemplateEntry = (key: string) => useStore(store, state => state.entries[key] ?? null)
export const useTemplateActive = (key: string) => useStore(store, state => key in state.entries)
