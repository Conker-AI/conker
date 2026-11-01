/** A readable id for a new tool draft: the name as a slug plus a short random suffix. */
export function toolDraftId(name: string, suffix: string): string {
  if (!/^[a-z0-9]{4,12}$/.test(suffix)) {
    throw new RangeError('Draft id suffix must be 4-12 lowercase letters or digits.')
  }
  let slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
    .replace(/-$/, '')
  if (!slug) slug = 'tool'
  else if (!/^[a-z]/.test(slug)) slug = `tool-${slug}`
  return `${slug}-${suffix}`
}
