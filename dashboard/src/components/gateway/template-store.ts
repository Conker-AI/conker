import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { compilePrompt, emptyValues, missingRequired, type PromptTemplate, type TemplateValues } from '@/lib/chat/prompt-templates'
import { toPromptTemplate, type PromptTemplatesClient } from '@/lib/gateway/prompt-templates'
import { promptMessage } from '@/lib/gateway/prompt-errors'

/** A template chosen for one draft. It keeps its own copy, so editing or deleting the template elsewhere never changes a form in progress. */
type Entry = { template: PromptTemplate; values: TemplateValues }
const store = createStore<{ entries: Record<string, Entry> }>(() => ({ entries: {} }))

/** The owner's templates as Pi lists them, shared by the composer picker, the wand and the Prompt templates screen. */
type Catalogue = { status: 'idle' | 'loading' | 'ready' | 'error'; items: readonly PromptTemplate[]; error: string | null }
const catalogue = createStore<Catalogue>(() => ({ status: 'idle', items: [], error: null }))
let generation = 0

/** Reads the list from Pi. A newer read wins; the list on screen stays while a refresh runs. */
export async function loadTemplates(client: Pick<PromptTemplatesClient, 'list'>): Promise<void> {
  const mine = ++generation
  catalogue.setState(state => ({ ...state, status: state.status === 'ready' ? 'ready' : 'loading', error: null }))
  try {
    const page = await client.list()
    if (mine === generation) catalogue.setState({ status: 'ready', items: page.items.map(toPromptTemplate), error: null })
  } catch (error) {
    if (mine === generation) catalogue.setState(state => ({ ...state, status: 'error', error: promptMessage(error) }))
  }
}
/** The screen saved or deleted something: the picker and the wand see the new list at once. */
export function replaceTemplates(items: readonly PromptTemplate[]) {
  generation++
  catalogue.setState({ status: 'ready', items, error: null })
}
export const useTemplateCatalogue = () => useStore(catalogue, state => state)

/**
 * The draft text for a template: empty until every required field is filled, so it cannot be sent early.
 * With Settings > Prompts > Required fields must be filled off (`required` false), it is the text of
 * whatever is filled in, and an empty required field no longer holds the message back.
 */
export const templateText = (template: PromptTemplate, values: TemplateValues, required = true) => (required && missingRequired(template, values).length ? '' : compilePrompt(template, values))
export function chooseTemplate(key: string, template: PromptTemplate | null) {
  store.setState(state => {
    if (template === null) {
      const entries = { ...state.entries }
      delete entries[key]
      return { entries }
    }
    return { entries: { ...state.entries, [key]: { template, values: emptyValues(template) } } }
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
