import { useEffect } from 'react'
import { plannerApi } from '@/lib/api'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { useToast } from '@/hooks/use-toast'
import { useFeatureAccess } from '@/services/featureAccessService'

export function PlannerReminderWatcher() {
  const { user, hasPermission } = useJWTAuth()
  const { toast } = useToast()
  const { hasFeature } = useFeatureAccess()
  const canReadPlanner = ((hasPermission('canViewPlanner') || hasPermission('canManagePlanner')) && (hasFeature('planner') || hasFeature('rentals'))) || (hasFeature('rentals') && hasPermission('canViewRental'))

  useEffect(() => {
    if (!user?.id || !canReadPlanner) return
    let stopped = false
    const key = `planner_reminders_seen_${user.id}`
    const check = async () => {
      try {
        const data = await plannerApi.list()
        if (stopped) return
        const items = Array.isArray(data?.items) ? data.items : []
        let seen: string[] = []
        try { seen = JSON.parse(localStorage.getItem(key) || '[]') } catch {}
        const seenSet = new Set(seen)
        const due = items.filter((item: any) => !item.completed && item.reminderAt && new Date(item.reminderAt).getTime() <= Date.now() && !seenSet.has(`${item.id}:${item.reminderAt}`))
        const shown = due.slice(0, 3)
        shown.forEach((item: any) => toast({ title: 'Planner reminder', description: item.title }))
        if (shown.length) {
          try { localStorage.setItem(key, JSON.stringify([...seen, ...shown.map((item: any) => `${item.id}:${item.reminderAt}`)].slice(-500))) } catch {}
        }
      } catch {
        // Planner reminders retry on the next interval without interrupting the current page.
      }
    }
    void check()
    const timer = window.setInterval(() => { void check() }, 60_000)
    return () => { stopped = true; window.clearInterval(timer) }
  }, [user?.id, toast, canReadPlanner])

  return null
}
