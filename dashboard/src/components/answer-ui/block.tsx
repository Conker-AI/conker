import "./no-devtools"
import { useMemo, useState } from "react"
import { Renderer, type ActionEvent, type OpenUIError } from "@openuidev/react-lang"
import { ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ErrorBoundary } from "@/components/resilience/error-boundary"
import { AnswerBlockContext, useAnswerReply } from "./context"
import { checkedLink } from "./links"
import { answerLibrary } from "./library"
import { PROBLEMS, blockProblem, type BlockProblem } from "./validate"
import "./answer-ui.css"

function Unavailable({ problem, source }: { problem: BlockProblem; source: string }) {
  const [open, setOpen] = useState(false)
  return <section className="answer-block" aria-label="Part of this answer that couldn't be shown">
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
      <div className="min-w-0"><p className="text-sm font-medium">Couldn't show this part</p><p className="text-xs leading-5 text-muted-foreground">{PROBLEMS[problem]} The rest of the answer is above and below.</p></div>
      <Button type="button" size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? <ChevronUp /> : <ChevronDown />}{open ? "Hide source" : "Show source"}</Button>
    </div>
    {open && <pre tabIndex={0} aria-label="Source of this part" className="border-t"><code>{source}</code></pre>}
  </section>
}

/** Opens a link only after the same check Markdown links pass; anything else is refused. */
function openLink(url: unknown) {
  const safe = checkedLink(url)
  if (safe) window.open(safe, "_blank", "noopener,noreferrer")
}

/**
 * One interactive part of an answer. It draws Conker's own components from OpenUI Lang; a tap only
 * sends a message or opens a checked link. No tool provider is given, so nothing it says can run.
 */
export default function AnswerUiBlock({ source, complete, streaming, answerText }: { source: string; complete: boolean; streaming: boolean; answerText: string }) {
  const reply = useAnswerReply(answerText)
  const problem = useMemo(() => blockProblem(source, { complete, streaming }), [source, complete, streaming])
  const [failed, setFailed] = useState<string | null>(null)
  const partial = streaming && !complete
  if (problem || failed === source) return <Unavailable problem={problem ?? "broken"} source={source} />
  const onAction = (event: ActionEvent) => {
    if (event.type === "open_url") openLink(event.params.url)
    else if (event.type === "continue_conversation" && reply.available && event.humanFriendlyMessage.trim()) reply.send(event.humanFriendlyMessage.trim())
  }
  const onError = (errors: OpenUIError[]) => { if (!partial && errors.some(error => error.severity !== "warning")) setFailed(source) }
  return <AnswerBlockContext.Provider value={{ reply, streaming: partial }}>
    <ErrorBoundary resetKeys={[source]} fallback={() => <Unavailable problem="broken" source={source} />}>
      <div className="answer-ui my-4 min-w-0" data-answer-ui={partial ? "streaming" : "ready"} aria-busy={partial || undefined}>
        <Renderer response={source} library={answerLibrary} isStreaming={partial} onAction={onAction} onError={onError} />
      </div>
    </ErrorBoundary>
  </AnswerBlockContext.Provider>
}
