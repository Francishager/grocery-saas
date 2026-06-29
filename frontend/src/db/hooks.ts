import { useState, useEffect, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './index'
import {
  getSyncStatus,
  onSyncStatusChange,
  syncAll,
  getSyncStats,
  type SyncStatus,
} from './sync'

// Live queries — automatically re-render when IndexedDB data changes
export function useLocalProducts(search?: string) {
  return useLiveQuery(async () => {
    if (!search) return await db.products.toArray()
    const lower = search.toLowerCase()
    return await db.products
      .filter(p =>
        p.name.toLowerCase().includes(lower) ||
        (p.sku || '').toLowerCase().includes(lower) ||
        (p.barcode || '').toLowerCase().includes(lower)
      )
      .toArray()
  }, [search])
}

export function useLocalProduct(id: string) {
  return useLiveQuery(() => db.products.get(id), [id])
}

export function useLocalSales(limit = 100) {
  return useLiveQuery(
    () => db.sales.orderBy('createdAt').reverse().limit(limit).toArray(),
    [limit]
  )
}

export function useLocalCustomers(search?: string) {
  return useLiveQuery(async () => {
    if (!search) return await db.customers.toArray()
    const lower = search.toLowerCase()
    return await db.customers
      .filter(c => c.name.toLowerCase().includes(lower) || (c.phone || '').includes(search))
      .toArray()
  }, [search])
}

export function useLocalCategories(type?: string) {
  return useLiveQuery(async () => {
    if (!type) return await db.categories.toArray()
    return await db.categories.filter(c => c.categoryType === type).toArray()
  }, [type])
}

export function useLocalBranches() {
  return useLiveQuery(() => db.branches.toArray(), [])
}

// Sync status hook — tracks online/offline/syncing state
export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus())

  useEffect(() => {
    const unsub = onSyncStatusChange(setStatus)
    return unsub
  }, [])

  return status
}

// Sync stats — pending queue count + last pull time
export function useSyncStats() {
  const [stats, setStats] = useState({ pending: 0, lastPull: null as string | null })

  useEffect(() => {
    let active = true
    const update = async () => {
      const s = await getSyncStats()
      if (active) setStats(s)
    }
    update()
    const interval = setInterval(update, 5000)
    return () => { active = false; clearInterval(interval) }
  }, [])

  return stats
}

// Manual sync trigger
export function useSyncNow() {
  const [syncing, setSyncing] = useState(false)
  const trigger = useCallback(async () => {
    setSyncing(true)
    try { await syncAll() } finally { setSyncing(false) }
  }, [])
  return { syncing, syncNow: trigger }
}

// Online status
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}
