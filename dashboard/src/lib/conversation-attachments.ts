/** Metadata only. File bytes and preview URLs never enter the client contract. */
export type ConversationAttachment = { id: string; name: string; size: number; type: string; lastModified: number }
export const MAX_ATTACHMENTS = 5
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const MAX_ATTACHMENT_TOTAL = 25 * 1024 * 1024

export function validateAttachments(value: ConversationAttachment[]): ConversationAttachment[] {
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS) throw new Error("Attach up to 5 files per message.")
  const ids = new Set<string>()
  let total = 0
  return value.map(item => {
    if (!item || typeof item.id !== "string" || !item.id || item.id.length > 100 || ids.has(item.id) || typeof item.name !== "string" || !item.name.trim() || item.name.length > 255 || typeof item.type !== "string" || item.type.length > 255 || !Number.isSafeInteger(item.size) || item.size < 0 || item.size > MAX_ATTACHMENT_BYTES || !Number.isFinite(item.lastModified) || item.lastModified < 0) throw new Error("Each attachment needs a valid name and must be 10 MB or smaller.")
    ids.add(item.id)
    total += item.size
    if (total > MAX_ATTACHMENT_TOTAL) throw new Error("Keep the total attachment size at 25 MB or less.")
    return { id: item.id, name: item.name, size: item.size, type: item.type, lastModified: item.lastModified }
  })
}

export function attachmentSize(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// Tab-lifetime local previews. Retain sent/queued files across route changes and forks.
const localFiles = new Map<string, { file: File; url?: string }>()
export function prepareAttachments(files: File[], existing: ConversationAttachment[]) {
  const additions = files.map(file => ({ id: crypto.randomUUID(), name: file.name, size: file.size, type: file.type, lastModified: file.lastModified }))
  const next = validateAttachments([...existing, ...additions])
  additions.forEach((item, index) => localFiles.set(item.id, { file: files[index] }))
  return next
}
export function attachmentPreview(attachment: ConversationAttachment): string | undefined {
  const local = localFiles.get(attachment.id)
  if (!local || !/^(image\/(png|jpeg|gif|webp|avif))$/.test(local.file.type)) return undefined
  return local.url ??= URL.createObjectURL(local.file)
}
export function discardLocalAttachment(id: string) {
  const local = localFiles.get(id)
  if (local?.url) URL.revokeObjectURL(local.url)
  localFiles.delete(id)
}

export function pruneLocalAttachments(referencedIds: Set<string>) {
  for (const id of localFiles.keys()) if (!referencedIds.has(id)) discardLocalAttachment(id)
}
