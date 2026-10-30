import { Children, cloneElement, createContext, Fragment, isValidElement, useContext, useEffect, type ReactNode } from 'react'

/**
 * The composer keeps the text box, Agent, Mode, voice typing and Send on its bar. Everything else
 * about the next message or this chat sits behind one More control, which names every value that
 * differs from its default so nothing changed is out of sight.
 */

/** The controls behind More, in the order they appear there. */
export const composerMoreIds = ['template', 'model', 'skills', 'think', 'access', 'incognito'] as const
export type ComposerMoreId = typeof composerMoreIds[number]
export type ComposerMoreValues = Partial<Record<ComposerMoreId, string>>

const moreControls = new WeakSet<object>()

/** Marks a control that the chat hands to the composer with its actions as one that belongs behind More. */
export function belongsBehindMore(component: object) { moreControls.add(component) }

/** Splits the composer's actions into what stays on the bar and what goes behind More, keeping order and keys. */
export function splitComposerActions(actions: ReactNode) {
  const bar: ReactNode[] = [], more: ReactNode[] = []
  const walk = (node: ReactNode, prefix: string) => Children.toArray(node).forEach(child => {
    if (!isValidElement<{ children?: ReactNode }>(child)) { bar.push(child); return }
    if (child.type === Fragment) { walk(child.props.children, `${prefix}${child.key}/`); return }
    const keyed = cloneElement(child, { key: `${prefix}${child.key}` })
    if (moreControls.has(child.type as object)) more.push(keyed)
    else bar.push(keyed)
  })
  walk(actions, '')
  return { bar, more }
}

type Report = (id: ComposerMoreId, value: string | null) => void
export const ComposerMoreContext = createContext<Report | null>(null)

/** Tells More what this control is set to; null is its default, which More does not name. No-op outside a composer. */
export function useComposerMoreValue(id: ComposerMoreId, value: string | null) {
  const report = useContext(ComposerMoreContext)
  useEffect(() => {
    if (!report) return
    report(id, value)
    return () => report(id, null)
  }, [report, id, value])
}

/** The values More names on its button, in the order of the controls behind it. */
export function moreSummary(values: ComposerMoreValues) {
  return composerMoreIds.flatMap(id => values[id] ? [values[id]] : [])
}

/** The next set of values after one control reports; the same object when nothing changed. */
export function withMoreValue(values: ComposerMoreValues, id: ComposerMoreId, value: string | null): ComposerMoreValues {
  const named = value || null
  if ((values[id] ?? null) === named) return values
  const next = { ...values }
  if (named) next[id] = named
  else delete next[id]
  return next
}
