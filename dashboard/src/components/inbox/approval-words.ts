import type { OwnerRequest } from '@/lib/gateway/owner'

/** One argument key in plain words. */
export const humanize = (value: string) => {
  const words = value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
/** One argument value in plain words. */
export function friendlyValue(value: unknown): string {
  if (value === null) return 'Not set'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.length ? value.map(friendlyValue).join('; ') : 'None'
  if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${humanize(key)}: ${friendlyValue(item)}`).join('; ') || 'None'
  return String(value)
}
/** The name he must type before a level-3 delete confirms: the first string argument among the fixed keys. */
export function deleteConfirmName(request: OwnerRequest): string {
  if (request.action.args) for (const key of ['name', 'title', 'path', 'file', 'target', 'id']) {
    const value = request.action.args[key]
    if (typeof value === 'string' && value.length >= 1 && value.length <= 80) return value
  }
  return 'delete'
}
