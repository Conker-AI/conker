import { useCallback, useEffect, useRef, useState } from 'react'
import type { GatewayOwnerClient, OwnerRequest } from '@/lib/gateway/owner'
import { APPROVAL_CHECK_MS, approvalProgress, type ApprovalProgress } from './approval-progress'

export type FollowedApproval = { request: OwnerRequest; since: number; progress: ApprovalProgress }
const open = (item: FollowedApproval) => item.progress === 'working' || item.progress === 'unknown'

/**
 * Follows each approval he gave on this page until its saved request says it ran (or can no
 * longer run). It only reads the request again, every couple of seconds while the page is in view
 * (ledger: reads may repeat, writes never do); a failed read just waits for the next one.
 */
export function useApprovalFollow(client: Pick<GatewayOwnerClient, 'getRequest'>, active: boolean) {
  const [followed, setFollowed] = useState<FollowedApproval[]>([])
  const latest = useRef(followed), reading = useRef(new Set<string>())
  useEffect(() => { latest.current = followed }, [followed])
  const update = useCallback((id: string, next: (item: FollowedApproval) => FollowedApproval) =>
    setFollowed(current => current.map(item => item.request.id === id ? next(item) : item)), [])
  /** A new approval: its line replaces the settled ones; ones still open stay. */
  const follow = useCallback((request: OwnerRequest) => {
    const since = Date.now()
    setFollowed(current => [...current.filter(item => open(item) && item.request.id !== request.id), { request, since, progress: approvalProgress(request, since, since) }])
  }, [])
  /** Another decision on the page: lines that already say how it went make room. */
  const clearSettled = useCallback(() => setFollowed(current => current.filter(open)), [])
  /** Unknown, then "Check": read again for another minute. */
  const check = useCallback((id: string) => update(id, item => ({ ...item, since: Date.now(), progress: 'working' })), [update])
  const waiting = active && followed.some(item => item.progress === 'working')
  useEffect(() => {
    if (!waiting) return
    const controller = new AbortController()
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      for (const item of latest.current) {
        const id = item.request.id
        if (item.progress !== 'working' || reading.current.has(id)) continue
        reading.current.add(id)
        client.getRequest(id, { signal: controller.signal })
          .then(request => { if (!controller.signal.aborted) update(id, value => value.progress === 'working' ? { ...value, request, progress: approvalProgress(request, Date.now(), value.since) } : value) })
          .catch(() => { if (!controller.signal.aborted) update(id, value => value.progress === 'working' ? { ...value, progress: approvalProgress(value.request, Date.now(), value.since) } : value) })
          .finally(() => reading.current.delete(id))
      }
    }
    const timer = window.setInterval(tick, APPROVAL_CHECK_MS)
    return () => { window.clearInterval(timer); controller.abort() }
  }, [client, update, waiting])
  return { followed, follow, clearSettled, check }
}
