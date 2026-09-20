import { FileText, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { attachmentPreview, attachmentSize, type ConversationAttachment } from "@/lib/conversation-attachments"

export function ConversationAttachments({ attachments, onRemove, draft = false }: { attachments?: ConversationAttachment[]; onRemove?: (id: string) => void; draft?: boolean }) {
  if (!attachments?.length) return null
  return <div className="space-y-2 py-2">
    <ul aria-label="Attachments" className={`flex flex-wrap gap-2${draft ? " max-h-32 overflow-y-auto" : ""}`}>
      {attachments.map(file => {
        const preview = attachmentPreview(file)
        return <li key={file.id} className="flex min-w-0 max-w-full items-center gap-2 rounded-lg border bg-muted p-2">
          {preview ? <img src={preview} alt={`Preview of ${file.name}`} className="size-12 shrink-0 rounded-md object-contain" /> : <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />}
          <div className="min-w-0"><p className="max-w-56 truncate text-xs font-medium" title={file.name}>{file.name}</p><p className="text-xs text-muted-foreground">{attachmentSize(file.size)} · Local file</p></div>
          {onRemove && <Button type="button" size="icon" variant="ghost" className="size-8 shrink-0" aria-label={`Remove attachment ${file.name}`} onClick={() => onRemove(file.id)}><X /></Button>}
        </li>
      })}
    </ul>
    <p className="text-xs text-muted-foreground">Local preview · contents are not uploaded or read by a model. Files reset on reload.</p>
  </div>
}
