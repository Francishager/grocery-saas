import { useState, useEffect, useRef, useCallback } from 'react'
import { Bell, Check, CheckCheck, AlertTriangle, Package, Clock, TrendingDown, FileText, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createPortal } from 'react-dom'
import { apiFetch } from '@/lib/api'
import { useOnlineStatus } from '@/db/hooks'
import { getLocalNotifications } from '@/db/hybrid'
import { db } from '@/db/index'
import { useNavigate } from 'react-router-dom'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { useFeatureAccess } from '@/services/featureAccessService'

interface NotificationItem {
  id: string
  title: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  isRead: boolean
  createdAt: string
  channel?: string
  link?: string
  source?: 'api' | 'local'
}

const TYPE_ICONS: Record<string, typeof Bell> = {
  info: Bell,
  success: Check,
  warning: AlertTriangle,
  error: AlertTriangle,
  low_stock: Package,
  out_of_stock: Package,
  overdue_rental: Clock,
  overdue_payable: TrendingDown,
  leave_request: FileText,
}

const TYPE_COLORS: Record<string, string> = {
  info: 'bg-blue-100 text-blue-600',
  success: 'bg-green-100 text-green-600',
  warning: 'bg-yellow-100 text-yellow-600',
  error: 'bg-red-100 text-red-600',
  low_stock: 'bg-orange-100 text-orange-600',
  out_of_stock: 'bg-red-100 text-red-600',
  overdue_rental: 'bg-purple-100 text-purple-600',
  overdue_payable: 'bg-amber-100 text-amber-600',
  leave_request: 'bg-indigo-100 text-indigo-600',
}

function timeAgo(date: string | Date): string {
  const d = new Date(date)
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60000)
  const hr = Math.floor(diff / 3600000)
  const day = Math.floor(diff / 86400000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  if (hr < 24) return `${hr}h ago`
  if (day < 7) return `${day}d ago`
  return d.toLocaleDateString()
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const online = useOnlineStatus()
  const navigate = useNavigate()
  const { user } = useJWTAuth()
  const { hasFeature } = useFeatureAccess()
  const bellRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const previousUnreadCountRef = useRef(0)
  const permissionPromptedRef = useRef(false)
  const isOwner = user?.role === 'owner' || user?.role === 'saas_admin'
  const canUseBrowserNotifications = hasFeature('communication.notifications')

  // Fetch API notifications
  const fetchApiNotifications = useCallback(async (): Promise<NotificationItem[]> => {
    try {
      const res = await apiFetch('/api/notifications')
      if (!res.ok) return []
      const data = await res.json()
      const arr = Array.isArray(data) ? data : (data.notifications || [])
      return arr.map((n: any) => ({
        id: n.id,
        title: n.title || '',
        message: n.message || '',
        type: (n.type || 'info') as any,
        isRead: n.isRead ?? false,
        createdAt: n.createdAt || new Date().toISOString(),
        channel: n.channel,
        source: 'api' as const,
      }))
    } catch {
      return []
    }
  }, [])

  // Fetch local IndexedDB notifications
  const fetchLocalNotifications = useCallback(async (): Promise<NotificationItem[]> => {
    try {
      const local = await getLocalNotifications()
      return local.map((n: any) => ({
        id: n.id,
        title: n.title || '',
        message: n.message || '',
        type: (n.type || 'info') as any,
        isRead: n.isRead ?? false,
        createdAt: n.createdAt || new Date().toISOString(),
        channel: n.channel,
        source: 'local' as const,
      }))
    } catch {
      return []
    }
  }, [])

  // Generate job-based notifications from local data (low-stock, overdue rentals, etc.)
  const generateJobNotifications = useCallback(async (): Promise<NotificationItem[]> => {
    const jobs: NotificationItem[] = []
    try {
      const [products, rentals, leaveRequests, purchases] = await Promise.all([
        db.products.toArray(),
        db.rentals.toArray(),
        db.leaveRequests.toArray(),
        db.purchases.toArray(),
      ])

      // Low-stock products
      for (const p of products) {
        const minStock = (p as any).minStock || 10
        if (p.quantity > 0 && p.quantity <= minStock) {
          jobs.push({
            id: `job_low_${p.id}`,
            title: 'Low Stock Alert',
            message: `${p.name} has only ${p.quantity} units left (min: ${minStock})`,
            type: 'low_stock',
            isRead: false,
            createdAt: new Date().toISOString(),
            link: '/tenant/inventory',
            source: 'local',
          })
        }
      }

      // Out-of-stock products
      for (const p of products) {
        if (p.quantity <= 0) {
          jobs.push({
            id: `job_out_${p.id}`,
            title: 'Out of Stock',
            message: `${p.name} is completely out of stock`,
            type: 'out_of_stock',
            isRead: false,
            createdAt: new Date().toISOString(),
            link: '/tenant/inventory',
            source: 'local',
          })
        }
      }

      // Overdue rentals
      const now = new Date()
      for (const r of rentals) {
        if (r.status === 'active' || r.status === 'rented') {
          const returnDate = (r as any).expectedReturnDate || (r as any).returnDate
          if (returnDate && new Date(returnDate) < now) {
            jobs.push({
              id: `job_rental_${r.id}`,
              title: 'Overdue Rental',
              message: `Rental ${(r as any).rentalNo || r.id} is overdue for return`,
              type: 'overdue_rental',
              isRead: false,
              createdAt: new Date().toISOString(),
              link: '/tenant/rentals',
              source: 'local',
            })
          }
        }
      }

      // Pending leave requests
      for (const lr of leaveRequests) {
        if ((lr as any).status === 'pending') {
          jobs.push({
            id: `job_leave_${lr.id}`,
            title: 'Pending Leave Request',
            message: `Leave request from ${(lr as any).employeeName || 'an employee'} awaiting approval`,
            type: 'leave_request',
            isRead: false,
            createdAt: (lr as any).createdAt || new Date().toISOString(),
            link: '/tenant/hr',
            source: 'local',
          })
        }
      }

      // Overdue payables
      for (const p of purchases) {
        if ((p as any).paymentStatus === 'unpaid' || ((p as any).balance > 0 && (p as any).dueDate)) {
          const dueDate = (p as any).dueDate
          if (dueDate && new Date(dueDate) < now) {
            jobs.push({
              id: `job_payable_${p.id}`,
              title: 'Overdue Payable',
              message: `Purchase ${(p as any).refNo || p.id} from ${(p as any).supplier?.name || 'supplier'} is overdue`,
              type: 'overdue_payable',
              isRead: false,
              createdAt: new Date().toISOString(),
              link: '/tenant/payables',
              source: 'local',
            })
          }
        }
      }
    } catch {
      // ignore
    }
    return jobs
  }, [])

  const addDailyReminderIfNeeded = useCallback((base: NotificationItem[]) => {
    if (typeof window === 'undefined') return base

    const now = new Date()
    const isReminderWindow = now.getHours() === 23 && now.getMinutes() >= 55
    if (!isReminderWindow) return base

    const storageKey = user?.id ? `jibu_daily_reminder_${user.id}` : 'jibu_daily_reminder_guest'
    const todayKey = now.toISOString().slice(0, 10)
    const lastShown = window.localStorage.getItem(storageKey)
    if (lastShown === todayKey) return base

    window.localStorage.setItem(storageKey, todayKey)
    const reminder: NotificationItem = {
      id: `daily_reminder_${todayKey}`,
      title: 'Daily Reminder',
      message: 'Wrap up the day and review any pending manufacturing or operational tasks before midnight.',
      type: 'info',
      isRead: false,
      createdAt: now.toISOString(),
      link: '/tenant/dashboard',
      source: 'local',
    }

    return [reminder, ...base.filter((n) => n.id !== reminder.id)]
  }, [user?.id])

  // Load all notifications
  const loadNotifications = useCallback(async () => {
    setLoading(true)
    try {
      let apiNotifs: NotificationItem[] = []
      let localNotifs: NotificationItem[] = []

      if (online) {
        const [api, local] = await Promise.all([fetchApiNotifications(), fetchLocalNotifications()])
        apiNotifs = api
        localNotifs = local
      } else {
        localNotifs = await fetchLocalNotifications()
      }

      // Generate job notifications from local data
      const jobNotifs = await generateJobNotifications()

      // Merge: API notifications + job notifications, dedup by id
      // Job notifications override local stored ones with same id pattern
      const mergedMap = new Map<string, NotificationItem>()

      // Add API notifications first
      for (const n of apiNotifs) {
        mergedMap.set(n.id, n)
      }

      // Add job notifications (these are always fresh)
      for (const n of jobNotifs) {
        if (!mergedMap.has(n.id)) {
          mergedMap.set(n.id, n)
        }
      }

      // Add remaining local notifications
      for (const n of localNotifs) {
        if (!mergedMap.has(n.id)) {
          mergedMap.set(n.id, n)
        }
      }

      const merged = Array.from(mergedMap.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      const withReminder = addDailyReminderIfNeeded(merged)

      setNotifications(withReminder)
      setUnreadCount(withReminder.filter((n) => !n.isRead).length)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [online, fetchApiNotifications, fetchLocalNotifications, generateJobNotifications, addDailyReminderIfNeeded])

  // Initial load + polling
  useEffect(() => {
    loadNotifications()
    const interval = setInterval(loadNotifications, 60000) // poll every 60s
    return () => clearInterval(interval)
  }, [loadNotifications])

  useEffect(() => {
    if (unreadCount > previousUnreadCountRef.current && unreadCount > 0) {
      playNotificationSound()
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        const latest = notifications.find((n) => !n.isRead)
        if (latest) {
          try {
            new Notification(latest.title, { body: latest.message, tag: latest.id })
          } catch {}
        }
      }
    }
    previousUnreadCountRef.current = unreadCount
  }, [notifications, unreadCount])

  const playNotificationSound = useCallback(() => {
    if (typeof window === 'undefined') return
    try {
      const AudioContextImpl = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioContextImpl) return
      const context = new AudioContextImpl()
      const oscillator = context.createOscillator()
      const gainNode = context.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(880, context.currentTime)
      oscillator.frequency.exponentialRampToValueAtTime(1320, context.currentTime + 0.12)
      gainNode.gain.setValueAtTime(0.08, context.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18)
      oscillator.connect(gainNode)
      gainNode.connect(context.destination)
      oscillator.start()
      oscillator.stop(context.currentTime + 0.2)
      setTimeout(() => context.close().catch(() => {}), 250)
    } catch {}
  }, [])

  const requestBrowserPermission = useCallback(() => {
    if (!isOwner || !canUseBrowserNotifications || permissionPromptedRef.current) return
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission === 'granted' || Notification.permission === 'denied') return
    permissionPromptedRef.current = true
    window.Notification.requestPermission().catch(() => {})
  }, [canUseBrowserNotifications, isOwner])

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        panelRef.current?.contains(e.target as Node) ||
        bellRef.current?.contains(e.target as Node)
      ) return
      setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Mark single as read
  const handleMarkRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n))
    setUnreadCount(prev => Math.max(0, prev - 1))

    // Update local DB
    try { await db.notifications.update(id, { isRead: true }) } catch {}

    // Push to API if online and it's an API notification
    if (online && !id.startsWith('job_')) {
      try { await apiFetch(`/api/notifications/${id}/read`, { method: 'PUT' }) } catch {}
    }
  }

  // Mark all as read
  const handleMarkAllRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
    setUnreadCount(0)

    // Update local DB
    try {
      const unread = notifications.filter(n => !n.isRead)
      for (const n of unread) {
        await db.notifications.update(n.id, { isRead: true }).catch(() => {})
      }
    } catch {}

    // Push to API if online
    if (online) {
      try { await apiFetch('/api/notifications/read-all', { method: 'PUT' }) } catch {}
    }
  }

  // Handle notification click — navigate if link
  const handleNotificationClick = (n: NotificationItem) => {
    if (!n.isRead) handleMarkRead(n.id)
    if (n.link) {
      navigate(n.link)
      setOpen(false)
    }
  }

  const maxVisible = 8
  const visible = notifications.slice(0, maxVisible)

  return (
    <div ref={bellRef} className="relative">
      <button
        type="button"
        onClick={() => {
          requestBrowserPermission()
          setOpen(!open)
        }}
        className="relative p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold text-white bg-red-500 rounded-full ring-2 ring-card">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          className="fixed right-0 top-14 z-[60] w-[380px] max-w-[calc(100vw-1rem)] bg-card border border-border rounded-xl shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Notifications</h3>
              {unreadCount > 0 && (
                <span className="text-xs font-medium text-white bg-red-500 rounded-full px-2 py-0.5">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 text-muted-foreground hover:text-foreground rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[480px] overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              </div>
            ) : visible.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Bell className="h-10 w-10 mb-2 opacity-40" />
                <p className="text-sm">No notifications</p>
                <p className="text-xs mt-1">You're all caught up!</p>
              </div>
            ) : (
              visible.map((n) => {
                const Icon = TYPE_ICONS[n.type] || Bell
                const colorClass = TYPE_COLORS[n.type] || TYPE_COLORS.info
                return (
                  <div
                    key={n.id}
                    className={cn(
                      'flex items-start gap-3 p-3 border-b border-border/50 hover:bg-muted/50 cursor-pointer transition-colors',
                      !n.isRead && 'bg-primary/5'
                    )}
                    onClick={() => handleNotificationClick(n)}
                  >
                    {/* Icon */}
                    <div className={cn('p-2 rounded-full shrink-0', colorClass)}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{n.title}</p>
                        {!n.isRead && (
                          <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-[11px] text-muted-foreground/70">{timeAgo(n.createdAt)}</p>
                        {n.source === 'local' && !n.id.startsWith('job_') && (
                          <span className="text-[10px] text-muted-foreground/50 bg-muted px-1.5 rounded">offline</span>
                        )}
                        {n.id.startsWith('job_') && (
                          <span className="text-[10px] text-muted-foreground/50 bg-muted px-1.5 rounded">auto</span>
                        )}
                      </div>
                    </div>

                    {/* Mark read button */}
                    {!n.isRead && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleMarkRead(n.id)
                        }}
                        className="p-1 text-muted-foreground hover:text-green-600 shrink-0"
                        title="Mark as read"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* Footer */}
          {notifications.length > maxVisible && (
            <div className="px-4 py-3 border-t border-border">
              <button
                type="button"
                onClick={() => { navigate('/tenant/communication'); setOpen(false) }}
                className="w-full text-sm text-primary hover:underline text-center"
              >
                View all notifications ({notifications.length})
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}

export default NotificationBell
