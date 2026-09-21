import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ARTIFACT_HTML_PERMISSIONS, ARTIFACT_HTML_SANDBOX, artifactHtmlDocument } from "@/lib/artifact-html"

function HtmlSession({ source }: { source: string }) {
  const [running, setRunning] = useState(false)
  const [failed, setFailed] = useState(false)
  if (!source.trim()) return <p className="text-sm text-muted-foreground">This HTML artifact is empty. Add HTML, inline CSS and JavaScript in Source, then choose Run preview.</p>
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-sm">{failed ? "The preview could not load. Stop it, check Source and try again." : running ? "HTML preview running" : "HTML preview stopped"}</p><Button variant="outline" onClick={() => { setFailed(false); setRunning(value => !value) }}>{running ? "Stop preview" : "Run preview"}</Button></div>
    <p className="text-xs leading-5 text-muted-foreground">Runs inline HTML, CSS and JavaScript inside a sandbox. External libraries, network resources, forms, popups and navigation outside the preview are blocked. No Conker data, tools or host bridge are exposed. Stop discards the app’s temporary state.</p>
    {running ? <iframe title="HTML artifact preview" sandbox={ARTIFACT_HTML_SANDBOX} allow={ARTIFACT_HTML_PERMISSIONS} referrerPolicy="no-referrer" srcDoc={artifactHtmlDocument(source)} onError={() => setFailed(true)} className="h-[60vh] min-h-64 w-full rounded-lg border bg-background" /> : <div className="flex min-h-40 items-center justify-center rounded-lg border bg-muted p-6 text-center text-sm text-muted-foreground">Nothing executes until you choose Run preview. Source edits and version changes stop the preview.</div>}
  </div>
}

/** Editing source invalidates consent and disposes the old iframe and its state. */
export function ArtifactHtmlPreview({ content }: { content: { text: string } }) {
  return <HtmlSession key={content.text} source={content.text} />
}
