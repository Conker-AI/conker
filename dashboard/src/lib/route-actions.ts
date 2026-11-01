import { Children, isValidElement, type ReactNode } from 'react'

/** Splits an action's children into its words and its icons, so a phone can show the icon and keep the words as its name. */
export function splitActionLabel(children: ReactNode): { label: string; icons: ReactNode[] } {
  const label: string[] = []
  const icons: ReactNode[] = []
  for (const child of Children.toArray(children)) {
    if (typeof child === 'string' || typeof child === 'number') label.push(String(child))
    else if (isValidElement(child)) icons.push(child)
  }
  return { label: label.join('').trim().replace(/\s+/g, ' '), icons }
}
