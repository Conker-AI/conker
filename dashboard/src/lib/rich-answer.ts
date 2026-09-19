import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"

/** Generated links never get to execute a protocol or silently load remote media. */
export function safeAnswerUrl(value: string | undefined): string | undefined {
  if (!value || [...value].some(character => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)) return undefined
  if (value.startsWith("#")) return value
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return value
  try {
    const url = new URL(value)
    if (!["https:", "http:", "mailto:"].includes(url.protocol) || url.username || url.password) return undefined
    return value
  } catch { return undefined }
}

export function citationId(value: string | undefined): string | undefined {
  if (!value?.startsWith("citation:")) return undefined
  try { return decodeURIComponent(value.slice(9)) || undefined } catch { return undefined }
}

export function csvFromRows(rows: string[][]): string {
  return rows.map(row => row.map(value => {
    // Spreadsheet programs may evaluate quoted cells too. Neutralize before quoting.
    const firstContent = [...value].find(character => character.charCodeAt(0) > 32 && !/\s/u.test(character))
    const safe = (firstContent && "=+@-".includes(firstContent)) || /^[\t\r\n]/u.test(value) ? `'${value}` : value
    return `"${safe.replaceAll('"', '""')}"`
  }).join(",")).join("\r\n")
}

type TextNode = { type: string; value?: string; alt?: string; url?: string; children?: TextNode[]; position?: { start: { offset?: number } } }
const reader = unified().use(remarkParse).use(remarkGfm).use(remarkMath)

/** Read semantic cell contents before KaTeX creates parallel visual/MathML trees. */
export function tableRowsFromMarkdown(markdown: string, startOffset?: number): string[][] {
  const cellText = (node: TextNode): string => {
    if (node.type === "html") return ""
    if (node.type === "image") return node.alt || ""
    if (node.type === "break") return "\n"
    if (node.value !== undefined) return node.value
    return (node.children || []).map(cellText).join("")
  }
  const findTable = (node: TextNode): TextNode | undefined => {
    if (node.type === "table" && (startOffset === undefined || node.position?.start.offset === startOffset)) return node
    for (const child of node.children || []) { const found = findTable(child); if (found) return found }
  }
  const table = findTable(reader.parse(markdown) as TextNode)
  return (table?.children || []).map(row => (row.children || []).map(cellText))
}

/** Speech reads content, without markup delimiters, citation tokens or UI controls. */
export function readableAnswer(markdown: string): string {
  const visit = (node: TextNode): string => {
    if (node.type === "html" || node.type === "definition" || node.type === "footnoteDefinition" || node.type === "footnoteReference") return ""
    if (node.type === "image") return node.alt ? `Image: ${node.alt}` : ""
    if (node.type === "link" && citationId(node.url)) return ""
    if (node.value !== undefined) return node.value
    const separator = ["root", "list", "table", "tableRow"].includes(node.type) ? "\n" : ""
    const text = (node.children || []).map(visit).join(separator)
    return ["paragraph", "heading", "blockquote", "listItem", "tableRow"].includes(node.type) ? `${text}\n` : text
  }
  return visit(reader.parse(markdown) as TextNode).replace(/\n{3,}/g, "\n\n").trim()
}

const extensions: Record<string, string> = { javascript: "js", typescript: "ts", python: "py", bash: "sh", shell: "sh", json: "json", html: "html", css: "css", markdown: "md", sql: "sql", yaml: "yml", jsx: "jsx", tsx: "tsx", js: "js", ts: "ts", py: "py", text: "txt" }
export function codeFilename(language: string): string { return `code.${extensions[language.toLowerCase()] || "txt"}` }

/** Download inert source bytes; never execute or mount generated HTML/SVG. */
export function downloadAnswerFile(text: string, filename: string, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
