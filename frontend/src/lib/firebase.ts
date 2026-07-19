import { initializeApp } from 'firebase/app'
import { getMessaging, getToken, onMessage } from 'firebase/messaging'
import { getFirestore, doc, setDoc, getDoc, onSnapshot, collection, query, where, orderBy, getDocs, writeBatch } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
}

let app: ReturnType<typeof initializeApp> | null = null
let messaging: ReturnType<typeof getMessaging> | null = null
let db: ReturnType<typeof getFirestore> | null = null

function getFirebaseApp() {
  if (!app) app = initializeApp(firebaseConfig)
  return app
}

export function getFirestoreDb() {
  if (!db) db = getFirestore(getFirebaseApp())
  return db
}

export function getFirebaseMessaging() {
  if (!messaging) messaging = getMessaging(getFirebaseApp())
  return messaging
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  return await Notification.requestPermission()
}

export async function getFCMToken(): Promise<string | null> {
  try {
    const messaging = getFirebaseMessaging()
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || ''
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: await navigator.serviceWorker.ready,
    })
    return token
  } catch (err) {
    console.error('FCM getToken error:', err)
    return null
  }
}

export function onForegroundMessage(callback: (payload: any) => void) {
  const messaging = getFirebaseMessaging()
  return onMessage(messaging, callback)
}

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.messagingSenderId)
}
