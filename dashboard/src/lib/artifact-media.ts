/** Media is a reference, never an executable document or an automatic fetch. */
export function normalizeMediaUrl(value: string): string {
  const input = value.trim()
  if (!input) return ""
  if (input.length > 2048) throw new Error("Use a media URL up to 2,048 characters.")
  let url: URL
  try { url = new URL(input) } catch { throw new Error("Use a complete HTTPS media URL.") }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Use an HTTPS media URL without embedded credentials.")
  return url.href
}
