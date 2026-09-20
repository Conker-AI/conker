import { createContext, createElement, useContext, useMemo, useState, type ReactNode } from "react"
import Markdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import { common, createLowlight } from "lowlight"
import type { Element, RootContent } from "hast"
import { Check, ChevronDown, ChevronUp, Copy, Download, ExternalLink, Maximize2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogTrigger } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { OverlayBody, TaskDialogContent } from "@/components/design-system/overlays"
import type { ConversationCitation } from "@/lib/api/conversation-types"
import { citationId, codeFilename, csvFromRows, downloadAnswerFile, safeAnswerUrl, tableRowsFromMarkdown } from "@/lib/rich-answer"
import "katex/dist/katex.min.css"
import "./rich-answer.css"

const lowlight = createLowlight(common)
type RichAnswerProps = { text: string; citations?: ConversationCitation[]; onOpenSource?: (sourceId: string) => void }
const AnswerContext = createContext<RichAnswerProps>({ text: "" })

function nodeText(node: RootContent | Element): string {
  return node.type === "text" ? node.value : "children" in node ? node.children.map(nodeText).join("") : ""
}

function highlightedNode(node: RootContent, index: number): ReactNode {
  if (node.type === "text") return node.value
  if (node.type !== "element") return null
  return createElement("span", { key: index, className: (node.properties.className as string[] | undefined)?.join(" ") }, node.children.map(highlightedNode))
}

function CopyAction({ text, label = "Copy" }: { text: string; label?: string }) {
  const [result, setResult] = useState<{ text: string; success: boolean } | null>(null)
  const state = result?.text === text ? (result.success ? "copied" : "failed") : "idle"
  return <span className="inline-flex flex-wrap items-center gap-1">
    <Button type="button" size="sm" variant="ghost" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setResult({ text, success: true }) }
      catch { setResult({ text, success: false }) }
    }}>{state === "copied" ? <Check /> : <Copy />}{state === "copied" ? "Copied" : label}</Button>
    {state === "failed" && <span role="status" className="text-xs text-muted-foreground">Select the text to copy.</span>}
    <span className="sr-only" role="status">{state === "copied" ? "Copied to clipboard" : ""}</span>
  </span>
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [collapsed, setCollapsed] = useState(false)
  const highlighted = useMemo(() => {
    // Keep exceptionally large or unknown blocks cheap and readable during streaming.
    if (code.length > 40_000 || !lowlight.registered(language)) return code
    try { return lowlight.highlight(language, code).children.map(highlightedNode) }
    catch { return code }
  }, [code, language])
  return <section className="answer-block" aria-label={`${language || "Plain text"} code block`}>
    <div className="answer-block-toolbar">
      <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">{language || "Plain text"}</span>
      <div className="flex flex-wrap items-center justify-end gap-1">
        <CopyAction text={code} />
        <Button type="button" size="sm" variant="ghost" aria-label="Download code" title="Download code" onClick={() => downloadAnswerFile(code, codeFilename(language))}><Download /></Button>
        <Button type="button" size="sm" variant="ghost" aria-expanded={!collapsed} aria-label={collapsed ? "Expand code" : "Collapse code"} title={collapsed ? "Expand code" : "Collapse code"} onClick={() => setCollapsed(value => !value)}>{collapsed ? <ChevronDown /> : <ChevronUp />}</Button>
      </div>
    </div>
    {!collapsed && <pre tabIndex={0} aria-label={`${language || "Plain text"} code`}><code>{highlighted}</code></pre>}
  </section>
}

function AnswerTable({ children, rows, markdown }: { children: ReactNode; rows: string[][]; markdown: string }) {
  const csv = csvFromRows(rows)
  const [copyStatus, setCopyStatus] = useState("")
  const table = <table>{children}</table>
  return <section className="answer-block" aria-label="Response table">
    <div className="answer-block-toolbar">
      <span className="text-xs text-muted-foreground">Table</span>
      <div className="flex flex-wrap items-center justify-end gap-1">
        <CopyAction text={markdown} />
        <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" size="sm" variant="ghost" aria-label="Table export options"><Download /><ChevronDown /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => { void navigator.clipboard.writeText(csv).then(() => setCopyStatus("CSV copied"), () => setCopyStatus("Clipboard unavailable. Download CSV instead.")) }}>Copy as CSV</DropdownMenuItem><DropdownMenuItem onSelect={() => downloadAnswerFile(csv, "table.csv", "text/csv;charset=utf-8")}>Download CSV</DropdownMenuItem></DropdownMenuContent>
        </DropdownMenu>
        <Dialog><DialogTrigger asChild><Button type="button" size="sm" variant="ghost" aria-label="Expand table" title="Expand table"><Maximize2 /></Button></DialogTrigger>
          <TaskDialogContent size="wide" title="Response table" description="Scroll to inspect every column. CSV exports neutralize spreadsheet formulas."><OverlayBody><div className="rich-answer answer-table-scroll" tabIndex={0} aria-label="Expanded table">{table}</div><div className="mt-4 flex flex-wrap gap-2"><CopyAction text={markdown} label="Copy Markdown" /><CopyAction text={csv} label="Copy CSV" /><Button size="sm" variant="outline" onClick={() => downloadAnswerFile(csv, "table.csv", "text/csv;charset=utf-8")}><Download />Download CSV</Button></div></OverlayBody></TaskDialogContent>
        </Dialog>
      </div>
    </div>
    {copyStatus && <p role="status" className="px-3 text-xs text-muted-foreground">{copyStatus}</p>}
    <div className="answer-table-scroll" tabIndex={0} aria-label="Scrollable response table">{table}</div>
  </section>
}

function Citation({ id, children, citations, onOpenSource }: { id: string; children: ReactNode; citations: ConversationCitation[]; onOpenSource?: (id: string) => void }) {
  const source = citations.find(item => item.id === id)
  const href = safeAnswerUrl(source?.href)
  const [open, setOpen] = useState(false)
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><button type="button" className="answer-citation" aria-label={source ? `Source: ${source.label}` : "Source unavailable"}>{children}</button></PopoverTrigger>
    <PopoverContent className="max-h-[min(24rem,var(--radix-popover-content-available-height))] max-w-[calc(100vw-2rem)] space-y-3 overflow-y-auto [overflow-wrap:anywhere]" align="start">
      <p className="text-sm font-medium">{source?.label || "Source unavailable"}</p>
      <p className="text-xs leading-5 text-muted-foreground">{source?.excerpt || (source ? "No excerpt was supplied for this source." : "This response refers to a source whose details were not supplied.")}</p>
      {source && <div className="flex flex-wrap gap-2">{onOpenSource && <Button size="sm" variant="outline" onClick={() => { setOpen(false); onOpenSource(id) }}>View source</Button>}{href && <Button size="sm" variant="ghost" asChild><a href={href} target="_blank" rel="noopener noreferrer">Open link<ExternalLink /></a></Button>}</div>}
    </PopoverContent>
  </Popover>
}

// Stable component identities keep a block's collapsed state and focus while tokens arrive.
const markdownComponents: Components = {
  h1: ({ children }) => <h2>{children}</h2>,
  pre: function AnswerCode({ node, children }) {
    const code = node?.children.find((child): child is Element => child.type === "element" && child.tagName === "code")
    if (!code) return <pre>{children}</pre>
    const classes = code.properties.className as string[] | undefined
    const language = classes?.find(item => item.startsWith("language-"))?.slice(9) || ""
    return <CodeBlock code={nodeText(code).replace(/\n$/, "")} language={language} />
  },
  table: function MarkdownTable({ node, children }) {
    const { text } = useContext(AnswerContext)
    const rows = useMemo(() => tableRowsFromMarkdown(text, node?.position?.start.offset), [text, node?.position?.start.offset])
    return <AnswerTable rows={rows} markdown={text.slice(node?.position?.start.offset ?? 0, node?.position?.end.offset ?? text.length)}>{children}</AnswerTable>
  },
  a: function AnswerLink({ href, children }) {
    const { citations = [], onOpenSource } = useContext(AnswerContext)
    const id = citationId(href)
    if (id) return <Citation id={id} citations={citations} onOpenSource={onOpenSource}>{children}</Citation>
    const safe = safeAnswerUrl(href)
    return safe ? <a href={safe} target={safe.startsWith("#") || safe.startsWith("/") ? undefined : "_blank"} rel="noopener noreferrer">{children}</a> : <span title="Unavailable or unsupported link">{children}</span>
  },
  img: ({ src, alt }) => {
    const safe = typeof src === "string" ? safeAnswerUrl(src) : undefined
    return <span className="text-sm text-muted-foreground">Image: {alt || "Untitled"}{safe && <> · <a href={safe} target="_blank" rel="noopener noreferrer">Open image</a></>}</span>
  },
}

export function RichAnswer(props: RichAnswerProps) {
  return <AnswerContext.Provider value={props}><div dir="auto" className="rich-answer">
    <Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { trust: false, strict: "ignore", throwOnError: false, errorColor: "var(--muted-foreground)", maxExpand: 100, maxSize: 20 }]]} skipHtml
      urlTransform={value => citationId(value) ? value : safeAnswerUrl(value) || ""}
      components={markdownComponents}>{props.text}</Markdown>
  </div></AnswerContext.Provider>
}
