import type { ElementContent, RootContent } from 'hast'

type CodeNode = RootContent | ElementContent

/**
 * Highlighted code split into its lines, for line numbers. A colored span that runs over several
 * lines (a long comment or string) is copied onto each, so every line keeps its colors.
 */
export function codeLines(nodes: readonly CodeNode[]): CodeNode[][] {
  const lines: CodeNode[][] = [[]]
  const add = (parts: CodeNode[][]) =>
    parts.forEach((part, index) => {
      if (index) lines.push([])
      lines[lines.length - 1].push(...part)
    })
  for (const node of nodes) {
    if (node.type === 'text') add(node.value.split('\n').map(value => (value ? [{ type: 'text', value }] : [])))
    else if (node.type === 'element') add(codeLines(node.children).map(children => (children.length ? [{ ...node, children: children as ElementContent[] }] : [])))
  }
  return lines
}
