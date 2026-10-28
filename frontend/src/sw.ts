/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { sanitizeNotificationText, notificationLink } from './lib/notificationDisplay'

declare let self: ServiceWorkerGlobalScope

clientsClaim()
precacheAndRoute(self.__WB_MANIFEST || [])

registerRoute(
  ({ request, url }) => request.destination === 'script' && url.origin === self.location.origin && url.pathname.startsWith('/assets/'),
  new CacheFirst({
    cacheName: 'app-code',
    plugins: [
      new ExpirationPlugin({ maxEntries: 160, maxAgeSeconds: 60 * 60 * 24 * 30 }),
      new CacheableResponsePlugin({ statuses: [200] }),
    ],
  })
)

registerRoute(
  ({ request, url }) => request.destination === 'image' && url.origin === self.location.origin,
  new StaleWhileRevalidate({
    cacheName: 'app-images',
    plugins: [
      new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 }),
      new CacheableResponsePlugin({ statuses: [200] }),
    ],
  })
)

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting())
})

// Runtime caching for Google Fonts
registerRoute(
  /^https:\/\/fonts\.googleapis\.com\/.*/i,
  new CacheFirst({
    cacheName: 'google-fonts',
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 604800 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
)

// Standard Web Push is handled by the service worker without a third-party messaging SDK.
self.addEventListener('push', (event) => {
  let payload: Record<string, any> = {}
  try { payload = event.data?.json() || {} } catch { payload = {} }
  const title = sanitizeNotificationText(payload.title, 'JibuSales update')
  const body = sanitizeNotificationText(payload.body, 'Open JibuSales to view your update.')
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {}
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/img/jibusales_logo.png',
    badge: '/img/jibusales_logo.png',
    tag: sanitizeNotificationText(payload.tag, 'jibusales-update'),
    data,
    requireInteraction: false,
  }))
})

// Handle notification click — open/focus the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const urlToOpen = notificationLink(event.notification.data?.link || event.notification.data?.url) || '/tenant/dashboard'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen)
      }
    })
  )
})
