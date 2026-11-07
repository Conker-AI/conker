import { Children, cloneElement, createContext, Fragment, isValidElement, useContext, useEffect, type ComponentType, type ReactNode } from 'react'

/**
 * The composer keeps the text box, Agent, Mode, voice typing and Send on its bar. Every other
 * control about the next message or this chat is a registered composer item: it stands on the bar
 * while there is room and folds into the overflow menu when the bar gets narrow, always reporting
 * its value so a folded control's choice is still named.
 */

/** The composer items, in bar order after the mode and agent controls. */
export const composerItemIds = ['model', 'template', 'skills', 'output', 'think', 'access', 'incognito', 'media'] as const
export type ComposerItemId = typeof composerItemIds[number]
export type ComposerItemValues = Partial<Record<ComposerItemId, string>>

/** The toolbar width in px under which an item folds into the overflow menu; lower folds first. */
export const FOLD_BELOW: Record<Exclude<ComposerItemId, 'model'>, number> = {
  media: 760,
  incognito: 720,
  template: 680,
  skills: 640,
  think: 600,
  output: 560,
  access: 460,
}

const items = new WeakMap<object, ComposerItemId>()

/** Registers a component as a composer item, so the frame can sort and fold it. */
export function composerItem<P>(component: ComponentType<P>, id: ComposerItemId) {
  items.set(component, id)
}

/** Splits the composer's settings and actions children: registered items sorted by id, the rest keeps order and keys. */
export function splitComposerItems(settings: ReactNode, actions: ReactNode) {
  const found: { id: ComposerItemId; node: ReactNode }[] = [], rest: ReactNode[] = []
  const walk = (node: ReactNode, prefix: string) => Children.toArray(node).forEach(child => {
    if (!isValidElement<{ children?: ReactNode }>(child)) { rest.push(child); return }
    if (child.type === Fragment) { walk(child.props.children, `${prefix}${child.key}/`); return }
    const keyed = cloneElement(child, { key: `${prefix}${child.key}` })
    const id = items.get(child.type as object)
    if (id) found.push({ id, node: keyed })
    else rest.push(keyed)
  })
  walk(settings, 's/')
  walk(actions, 'a/')
  const byId = (a: { id: ComposerItemId }, b: { id: ComposerItemId }) => composerItemIds.indexOf(a.id) - composerItemIds.indexOf(b.id)
  return { items: found.sort(byId), actions: rest }
}

type Report = (id: ComposerItemId, value: string | null) => void
export const ComposerItemContext = createContext<Report | null>(null)

/** Tells the composer what this control is set to; null is its default, which is not named. No-op outside a composer. */
export function useComposerValue(id: ComposerItemId, value: string | null) {
  const report = useContext(ComposerItemContext)
  useEffect(() => {
    if (!report) return
    report(id, value)
    return () => report(id, null)
  }, [report, id, value])
}

/** The values the composer names on its overflow button and above the bar, in control order. */
export function itemSummary(values: ComposerItemValues) {
  return composerItemIds.flatMap(id => values[id] ? [values[id]] : [])
}

/** The next set of values after one control reports; the same object when nothing changed. */
export function withItemValue(values: ComposerItemValues, id: ComposerItemId, value: string | null): ComposerItemValues {
  const named = value || null
  if ((values[id] ?? null) === named) return values
  const next = { ...values }
  if (named) next[id] = named
  else delete next[id]
  return next
}
