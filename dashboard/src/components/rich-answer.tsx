import { createContext, createElement, lazy, Suspense, useContext, useMemo, useState, type ReactNode } from "react"
import Markdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import { common, createLowlight } from "lowlight"
import type { Element, RootContent } from "hast"
import { ChevronDown, ChevronUp, Download, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { fenceClosed, isAnswerUiLanguage } from "@/components/answer-ui/fence"
import { AnswerTable, CopyAction } from "@/components/answer-ui/table"
import type { ConversationCitation } from "@/lib/api/conversation-types"
import { citationId, codeFilename, downloadAnswerFile, safeAnswerUrl, tableRowsFromMarkdown } from "@/lib/rich-answer"
import "katex/dist/katex.min.css"
import "./rich-answer.css"

const lowlight = createLowlight(common)
// OpenUI loads only when an answer has an interactive part, so plain answers stay light.
const AnswerUiBlock = lazy(() => import("@/components/answer-ui/block"))
/** `streaming`: the text is a reply still being written, so an unclosed interactive part is still arriving. */
type RichAnswerProps = { text: string; citations?: ConversationCitation[]; onOpenSource?: (sourceId: string) => void; streaming?: boolean }
const AnswerContext = createContext<RichAnswerProps>({ text: "" })

function nodeText(node: RootContent | Element): string {
  return node.type === "text" ? node.value : "children" in node ? node.children.map(nodeText).join("") : ""
}

function highlightedNode(node: RootContent, index: number): ReactNode {
  if (node.type === "text") return node.value
  if (node.type !== "element") return null
  return createElement("span", { key: index, className: (node.properties.className as string[] | undefined)?.join(" ") }, node.children.map(highlightedNode))
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

function Citation({ id, children, citations, onOpenSource }: { id: string; children: ReactNode; citations: ConversationCitation[]; onOpenSource?: (id: string) => void }) {
  const source = citations.find(item => item.id === id)
  const href = safeAnswerUrl(source?.href)
  const [open, setOpen] = useState(false)
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger render={<button type="button" className="answer-citation" aria-label={source ? `Source: ${source.label}` : "Source unavailable"} />}>{children}</PopoverTrigger>
    <PopoverContent className="max-h-[min(24rem,var(--available-height))] max-w-[calc(100vw-2rem)] space-y-3 overflow-y-auto [overflow-wrap:anywhere]" align="start">
      <p className="text-sm font-medium">{source?.label || "Source unavailable"}</p>
      <p className="text-xs leading-5 text-muted-foreground">{source?.excerpt || (source ? "No excerpt was supplied for this source." : "This response refers to a source whose details were not supplied.")}</p>
      {source && <div className="flex flex-wrap gap-2">{onOpenSource && <Button size="sm" variant="outline" onClick={() => { setOpen(false); onOpenSource(id) }}>View source</Button>}{href && <Button size="sm" variant="ghost" render={<a href={href} target="_blank" rel="noopener noreferrer" />}>Open link<ExternalLink /></Button>}</div>}
    </PopoverContent>
  </Popover>
}

// Stable component identities keep a block's collapsed state and focus while tokens arrive.
const markdownComponents: Components = {
  h1: ({ children }) => <h2>{children}</h2>,
  pre: function AnswerCode({ node, children }) {
    const { text, streaming = false } = useContext(AnswerContext)
    const code = node?.children.find((child): child is Element => child.type === "element" && child.tagName === "code")
    if (!code) return <pre>{children}</pre>
    const classes = code.properties.className as string[] | undefined
    const language = classes?.find(item => item.startsWith("language-"))?.slice(9) || ""
    const source = nodeText(code).replace(/\n$/, "")
    if (isAnswerUiLanguage(language)) {
      // An open fence is still arriving (or was cut off); the block decides which from `streaming`.
      const complete = fenceClosed(text.slice(node?.position?.start.offset ?? 0, node?.position?.end.offset ?? text.length))
      return <Suspense fallback={<p role="status" className="my-4 text-sm text-muted-foreground">Preparing this part…</p>}><AnswerUiBlock source={source} complete={complete} streaming={streaming} answerText={text} /></Suspense>
    }
    return <CodeBlock code={source} language={language} />
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
