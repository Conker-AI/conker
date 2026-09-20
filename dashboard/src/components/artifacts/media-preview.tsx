import { useState } from "react"
import { Image, Music2, Video } from "lucide-react"
import { Button } from "@/components/ui/button"
import { normalizeMediaUrl } from "@/lib/artifact-media"

type MediaContent = { mediaType: "image" | "audio" | "video"; url: string; description: string }

function MediaReference({ content }: { content: MediaContent }) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const url = normalizeMediaUrl(content.url)
  const Icon = content.mediaType === "image" ? Image : content.mediaType === "audio" ? Music2 : Video
  if (!url) return <p className="text-sm text-muted-foreground">Add an HTTPS media URL and a description in Source. Nothing loads until you choose Load media.</p>
  const host = new URL(url).host
  return <figure className="space-y-4">
    {content.description && <figcaption className="whitespace-pre-wrap break-words text-sm leading-6">{content.description}</figcaption>}
    {!loaded || failed ? <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border bg-muted p-6 text-center">
      <Icon className="size-6 text-muted-foreground" aria-hidden="true" />
      <p className="max-w-lg break-words text-sm">{failed ? "This media could not be loaded." : `${content.mediaType[0].toUpperCase()}${content.mediaType.slice(1)} from ${host}`}</p>
      <p className="max-w-lg text-xs leading-5 text-muted-foreground">{failed ? "The source may be unavailable, the format unsupported, or the host may block cross-origin playback. Check its URL in Source, or retry." : "Loading contacts this host. This is an external reference; Conker has not uploaded or generated the media."}</p>
      <Button type="button" variant="outline" onClick={() => { setFailed(false); setAttempt(value => value + 1); setLoaded(true) }}>{failed ? "Retry media" : "Load media"}</Button>
    </div> : <div key={attempt} className="overflow-hidden rounded-lg border bg-muted p-2">
      {content.mediaType === "image" ? <img src={url} alt={content.description || "Artifact image"} crossOrigin="anonymous" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="mx-auto max-h-[60vh] max-w-full object-contain" />
        : content.mediaType === "audio" ? <audio src={url} crossOrigin="anonymous" controls preload="metadata" aria-label={content.description || "Artifact audio"} onError={() => setFailed(true)} className="w-full" />
          : <video src={url} crossOrigin="anonymous" controls playsInline preload="metadata" aria-label={content.description || "Artifact video"} onError={() => setFailed(true)} className="mx-auto max-h-[60vh] w-full object-contain" />}
    </div>}
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"><span className="min-w-0 break-all">External {content.mediaType} · {host}</span>{loaded && <Button type="button" variant="ghost" size="sm" onClick={() => { setLoaded(false); setFailed(false) }}>Unload media</Button>}</div>
  </figure>
}

/** A version/source switch unmounts playback and requires a fresh explicit load. */
export function ArtifactMediaPreview({ content }: { content: MediaContent }) {
  return <MediaReference key={JSON.stringify(content)} content={content} />
}
