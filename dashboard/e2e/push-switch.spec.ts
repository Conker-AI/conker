// "Notifications on this device" in Settings, Notifications, against the preview gateway. The dev
// server never installs the service worker, so the browser's push side is replaced before the app
// loads: a registration whose PushManager hands out one fake subscription, and a permission prompt
// that answers "allow". Nothing reaches a real push service.
import { expect, test } from '@playwright/test'
import { open } from './pages'

test('settings: notifications on this device turn on only when flipped, then off again', async ({ page }) => {
  await page.addInitScript(() => {
    const probe = { asked: 0, subscribed: 0 }
    Object.assign(window, { pushProbe: probe })
    let permission: NotificationPermission = 'default'
    let current: PushSubscription | null = null
    const endpoint = 'https://fcm.googleapis.com/fcm/send/e2e-device'
    const keys = { p256dh: 'B' + 'A'.repeat(86), auth: 'A'.repeat(22) }
    Object.defineProperty(Notification, 'permission', { configurable: true, get: () => permission })
    Notification.requestPermission = async () => {
      probe.asked++
      return (permission = 'granted')
    }
    const pushManager = {
      getSubscription: async () => current,
      subscribe: async (options: PushSubscriptionOptionsInit) => {
        probe.subscribed++
        current = {
          endpoint,
          options,
          toJSON: () => ({ endpoint, keys }),
          unsubscribe: async () => {
            current = null
            return true
          },
        } as unknown as PushSubscription
        return current
      },
    }
    navigator.serviceWorker.getRegistration = async () => ({ pushManager }) as unknown as ServiceWorkerRegistration
  })
  const errors = await open(page, '/settings?group=notifications')
  const row = page.locator('[id="setting-notifications.this_device"]')
  const toggle = row.getByRole('switch', { name: 'Notifications on this device' })
  await expect(row.getByRole('status')).toHaveText(/^Off\./)
  await expect(toggle).not.toBeChecked()
  // Opening Settings asks the browser for nothing.
  expect(await page.evaluate(() => (window as unknown as { pushProbe: { asked: number } }).pushProbe.asked)).toBe(0)

  await toggle.click()
  await expect(row.getByRole('status')).toHaveText(/^On\./)
  await expect(toggle).toBeChecked()
  expect(await page.evaluate(() => (window as unknown as { pushProbe: object }).pushProbe)).toEqual({ asked: 1, subscribed: 1 })

  await toggle.click()
  await expect(row.getByRole('status')).toHaveText(/^Off\./)
  await expect(toggle).not.toBeChecked()
  await expect(row.getByRole('alert')).toHaveCount(0)
  expect(errors).toEqual([])
})
