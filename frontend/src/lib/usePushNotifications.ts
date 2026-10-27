import { useEffect, useState, useCallback } from 'react'
import { apiFetch, getAuthToken } from './api'

export type PushPermissionState = 'default' | 'granted' | 'denied' | 'unsupported' | 'not-configured'

export interface PushNotification {
  id: string
  title: string
  body: string
  data?: Record<string, string>
  timestamp: number
}

const PUSH_DISABLED_KEY = 'jibusales_push_disabled'

function decodeVapidKey(key: string) {
  const padding = '='.repeat((4 - key.length % 4) % 4)
  const base64 = (key + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from(raw, char => char.charCodeAt(0))
}

function subscriptionUsesKey(subscription: PushSubscription, expectedKey: Uint8Array) {
  const currentKey = subscription.options.applicationServerKey
  if (!currentKey) return false
  const bytes = new Uint8Array(currentKey)
  return bytes.length === expectedKey.length && bytes.every((value, index) => value === expectedKey[index])
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<PushPermissionState>('default')
  const [token, setToken] = useState<string | null>(null)
  const [registered, setRegistered] = useState(false)
  const vapidPublicKey = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY || ''

  useEffect(() => {
    if (!('Notification' in window) || !('PushManager' in window) || !('serviceWorker' in navigator) || !window.isSecureContext) {
      setPermission('unsupported')
      return
    }
    if (!vapidPublicKey) {
      setPermission('not-configured')
      return
    }
    setPermission(Notification.permission as PushPermissionState)
  }, [vapidPublicKey])

  const getRegistration = useCallback(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Service workers are not supported in this browser')
    return navigator.serviceWorker.ready
  }, [])

  const requestPermission = useCallback(async () => {
    if (!vapidPublicKey) {
      setPermission('not-configured')
      return null
    }
    if (!('Notification' in window) || !('PushManager' in window) || !window.isSecureContext) {
      setPermission('unsupported')
      return null
    }
    const result = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
    setPermission(result as PushPermissionState)
    if (result !== 'granted') return null

    const registration = await getRegistration()
    let subscription = await registration.pushManager.getSubscription()
    const applicationServerKey = decodeVapidKey(vapidPublicKey)
    if (subscription && !subscriptionUsesKey(subscription, applicationServerKey)) {
      await subscription.unsubscribe()
      subscription = null
    }
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      })
    }
    setToken(subscription.endpoint)
    return subscription
  }, [vapidPublicKey, getRegistration])

  const registerToken = useCallback(async (userInitiated = false) => {
    const authToken = getAuthToken()
    if (!authToken) return false

    try {
      if (Notification.permission !== 'granted') {
        if (!userInitiated) return false
        const result = await requestPermission()
        if (!result) return false
      }
      const registration = await getRegistration()
      let subscription = await registration.pushManager.getSubscription()
      if (!subscription || !subscriptionUsesKey(subscription, decodeVapidKey(vapidPublicKey))) {
        if (!userInitiated && Notification.permission !== 'granted') return false
        subscription = await requestPermission()
        if (!subscription) return false
      }
      const subscriptionJson = subscription.toJSON()
      const res = await apiFetch('/api/push/register', {
        method: 'POST',
        body: JSON.stringify({ subscription: subscriptionJson }),
      })
      if (res.ok) {
        localStorage.removeItem(PUSH_DISABLED_KEY)
        setRegistered(true)
        setToken(subscription.endpoint)
        return true
      }
      if (res.status === 503) setPermission('not-configured')
      console.warn('Push token registration failed:', res.status)
      return false
    } catch (err) {
      // Silent fail — push not critical
      return false
    }
  }, [requestPermission, getRegistration])

  const unregisterToken = useCallback(async () => {
    localStorage.setItem(PUSH_DISABLED_KEY, '1')
    try {
      const registration = await getRegistration()
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await apiFetch('/api/push/unregister', {
          method: 'DELETE',
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        })
        await subscription.unsubscribe()
      }
    } catch {
      // Device-local opt-out still prevents automatic re-registration.
    } finally {
      setRegistered(false)
      setToken(null)
    }
  }, [getRegistration])

  const isDisabledOnDevice = useCallback(() => localStorage.getItem(PUSH_DISABLED_KEY) === '1', [])

  return {
    permission,
    token,
    registered,
    foregroundNotifications: [] as PushNotification[],
    requestPermission,
    registerToken,
    unregisterToken,
    isDisabledOnDevice,
  }
}
