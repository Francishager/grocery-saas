import { getFirestoreDb, isFirebaseConfigured } from './firebase'
import { doc, setDoc, getDoc, onSnapshot, writeBatch, collection, getDocs, query, where, orderBy } from 'firebase/firestore'

// Widget data sync via Firestore — falls back to localStorage when offline/not configured
// Path: widgets/{userId}/sticky_notes (single doc with all notes)
// Path: widgets/{userId}/calc_history (single doc with history)

function getLSKey(userId: string, type: string): string {
  return `widget_${type}_${userId}`
}

export function loadWidgetData<T>(userId: string, type: string, fallbackLSKey: string): T | null {
  // Try localStorage first for instant load
  try {
    const raw = localStorage.getItem(fallbackLSKey)
    if (raw) return JSON.parse(raw)
  } catch {}
  return null
}

export async function loadWidgetDataFromFirestore<T>(userId: string, type: string): Promise<T | null> {
  if (!isFirebaseConfigured() || !userId) return null
  try {
    const db = getFirestoreDb()
    const ref = doc(db, 'widgets', userId, type, 'data')
    const snap = await getDoc(ref)
    if (snap.exists()) return snap.data() as T
  } catch (err) {
    console.error(`Firestore load ${type} error:`, err)
  }
  return null
}

export async function saveWidgetDataToFirestore(userId: string, type: string, data: Record<string, unknown>): Promise<void> {
  if (!isFirebaseConfigured() || !userId) return
  try {
    const db = getFirestoreDb()
    const ref = doc(db, 'widgets', userId, type, 'data')
    await setDoc(ref, { ...data, updatedAt: Date.now() }, { merge: true })
  } catch (err) {
    console.error(`Firestore save ${type} error:`, err)
  }
}

export function subscribeToWidgetData<T>(
  userId: string,
  type: string,
  callback: (data: T | null) => void
): (() => void) | null {
  if (!isFirebaseConfigured() || !userId) return null
  try {
    const db = getFirestoreDb()
    const ref = doc(db, 'widgets', userId, type, 'data')
    return onSnapshot(ref, (snap) => {
      if (snap.exists()) callback(snap.data() as T)
      else callback(null)
    }, (err) => {
      console.error(`Firestore subscribe ${type} error:`, err)
    })
  } catch (err) {
    console.error(`Firestore subscribe ${type} error:`, err)
    return null
  }
}

// Debounced save helper
export function createDebouncedSaver(userId: string, type: string, delay = 800) {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (data: Record<string, unknown>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      saveWidgetDataToFirestore(userId, type, data)
      timer = null
    }, delay)
  }
}
