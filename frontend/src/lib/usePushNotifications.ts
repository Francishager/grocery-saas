import { useEffect, useState, useCallback, useRef } from 'react'
import { apiFetch } from './api'
import { requestNotificationPermission, getFCMToken, onForegroundMessage, isFirebaseConfigured } from './firebase'
import { sanitizeNotificationText } from './notificationDisplay'
import { getAuthToken } from './api'

export type PushPermissionState = 'default' | 'granted' | 'denied' | 'unsupported' | 'not-configured'

export interface PushNotification {
  id: string
  title: string
  body: string
  data?: Record<string, string>
  timestamp: number
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<PushPermissionState>('default')
  const [token, setToken] = useState<string | null>(null)
  const [registered, setRegistered] = useState(false)
  const [foregroundNotifications, setForegroundNotifications] = useState<PushNotification[]>([])
  const unregisterRef = useRef<(() => void) | null>(null)

  // Check initial state
  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setPermission('not-configured')
      return
    }
    if (!('Notification' in window)) {
      setPermission('unsupported')
      return
    }
    setPermission(Notification.permission as PushPermissionState)
  }, [])

  // Listen for foreground messages
  useEffect(() => {
    if (permission !== 'granted') return
    const unsub = onForegroundMessage((payload) => {
      const notif: PushNotification = {
        id: payload.data?.notificationId || payload.messageId || `${Date.now()}-${Math.random()}`,
        title: sanitizeNotificationText(payload.notification?.title || payload.data?.title, 'Notification'),
        body: sanitizeNotificationText(payload.notification?.body || payload.data?.body),
        data: payload.data,
        timestamp: Date.now(),
      }
      setForegroundNotifications((prev) => [notif, ...prev].slice(0, 20))
      window.dispatchEvent(new CustomEvent('jibusales:notification', {
        detail: {
          id: notif.id, title: notif.title, message: notif.body,
          type: payload.data?.type || 'info', metadata: payload.data,
          link: payload.data?.link || payload.data?.url,
        },
      }))
    })
    unregisterRef.current = unsub
    return () => {
      if (unregisterRef.current) unregisterRef.current()
    }
  }, [permission])

  const requestPermission = useCallback(async () => {
    if (!isFirebaseConfigured()) {
      setPermission('not-configured')
      return null
    }
    const result = await requestNotificationPermission()
    setPermission(result as PushPermissionState)
    if (result !== 'granted') return null

    const fcmToken = await getFCMToken()
    if (!fcmToken) return null
    setToken(fcmToken)
    return fcmToken
  }, [])

  const registerToken = useCallback(async () => {
    const authToken = getAuthToken()
    if (!authToken) return false

    let fcmToken = token
    if (!fcmToken) {
      const result = await requestPermission()
      if (!result) return false
      fcmToken = result
    }

    try {
      const res = await apiFetch('/api/push/register', {
        method: 'POST',
        body: JSON.stringify({ token: fcmToken, platform: 'web' }),
      })
      if (res.ok) {
        setRegistered(true)
        setToken(fcmToken)
        return true
      }
      console.warn('Push token registration failed:', res.status)
      return false
    } catch (err) {
      // Silent fail — push not critical
      return false
    }
  }, [token, requestPermission])

  const unregisterToken = useCallback(async () => {
    if (!token) return
    try {
      await apiFetch('/api/push/unregister', {
        method: 'DELETE',
        body: JSON.stringify({ token }),
      })
      setRegistered(false)
      setToken(null)
    } catch (err) {
      // Silent fail
    }
  }, [token])

  const dismissNotification = useCallback((id: string) => {
    setForegroundNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [])

  const clearNotifications = useCallback(() => {
    setForegroundNotifications([])
  }, [])

  return {
    permission,
    token,
    registered,
    foregroundNotifications,
    requestPermission,
    registerToken,
    unregisterToken,
    dismissNotification,
    clearNotifications,
  }
}
