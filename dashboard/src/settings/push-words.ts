/** The words of "Notifications on this device" (push-device.tsx). */
export type PushView = 'checking' | 'on' | 'off' | 'blocked' | 'insecure' | 'unsupported' | 'unknown'

/** The line under the switch says what is true now; every state has its own words. */
export const PUSH_WORDS: Record<PushView, string> = {
  checking: 'Checking this device…',
  on: 'On. Conker can reach this device when something needs you, outside quiet hours and within your daily limit.',
  off: 'Off. You see what needs you only while Conker is open.',
  blocked: 'Blocked by the browser. Allow notifications for this site in the browser’s settings, then come back.',
  insecure: 'Needs HTTPS that this browser trusts. Open Conker at its own HTTPS address, then try again.',
  unsupported: 'This browser can’t get notifications. On an iPhone or iPad, add Conker to the Home Screen and open it from there.',
  unknown: 'Can’t check right now: your Conker server didn’t answer.',
}
export const NOT_ALLOWED = 'Notifications weren’t allowed, so nothing changed.'
export const LIMIT = 'Notifications are already on for 10 devices. Sign out everywhere (Account) to turn them all off, then turn this one on.'
export const SERVER_OFF = 'Notifications are unavailable on your Conker server right now. Nothing changed.'
export const BROWSER_FAILED = 'This browser couldn’t set up notifications. Nothing changed; try again.'
export const OFF_UNCONFIRMED = 'Off on this device. Your Conker server didn’t confirm; it drops this device the next time it tries to reach it.'
