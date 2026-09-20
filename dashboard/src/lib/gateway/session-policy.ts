import type { GatewaySession } from './auth'

export function gatewaySessionDeadline(session: GatewaySession | null): number | null {
  if (!session?.authenticated || session.setupRequired || typeof session.unlockExpiresAt !== 'number' || !Number.isFinite(session.unlockExpiresAt) || !Number.isFinite(session.expiresAt)) return null
  return Math.min(session.expiresAt, session.unlockExpiresAt)
}
export function gatewaySessionUnlocked(session: GatewaySession | null, now = Date.now() / 1000): boolean {
  const deadline = gatewaySessionDeadline(session)
  return deadline !== null && deadline > now
}
