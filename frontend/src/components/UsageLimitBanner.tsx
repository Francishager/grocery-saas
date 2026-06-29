import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { apiFetch } from '@/lib/api'

interface UsageData {
  count: number
  limit: number
  percentage: number
}

interface UsageLimitBannerProps {
  resource: 'users' | 'products' | 'branches' | 'customers' | 'suppliers'
  label?: string
  currentCount?: number
}

export function UsageLimitBanner({ resource, label, currentCount }: UsageLimitBannerProps) {
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchLimits = async () => {
      try {
        const res = await apiFetch('/api/tenants/me/limits')
        if (res.ok) {
          const data = await res.json()
          if (data.usage?.[resource]) {
            setUsage(data.usage[resource])
          } else if (data.limits) {
            const limit = data.limits[`max${resource.charAt(0).toUpperCase() + resource.slice(1)}`]
            if (limit) {
              const count = currentCount ?? 0
              setUsage({ count, limit, percentage: Math.round((count / limit) * 100) })
            }
          }
        }
      } catch {}
      setLoading(false)
    }
    fetchLimits()
  }, [resource])

  if (loading || !usage) return null

  const pct = usage.percentage
  const displayLabel = label || resource.charAt(0).toUpperCase() + resource.slice(1)

  if (pct >= 100) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <span className="text-sm font-medium">{displayLabel} Usage: {usage.count} / {usage.limit}</span>
          </div>
          <span className="text-sm font-semibold text-red-700">{pct}%</span>
        </div>
        <div className="h-2 bg-white rounded-full overflow-hidden">
          <div className="h-full bg-red-500" style={{ width: '100%' }} />
        </div>
        <p className="mt-2 text-xs text-red-700">{displayLabel} limit reached. Contact your SaaS admin to increase the limit.</p>
      </div>
    )
  }

  if (pct >= 80) {
    return (
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <span className="text-sm font-medium">{displayLabel} Usage: {usage.count} / {usage.limit}</span>
          </div>
          <span className="text-sm font-semibold text-yellow-700">{pct}%</span>
        </div>
        <div className="h-2 bg-white rounded-full overflow-hidden">
          <div className="h-full bg-yellow-500 transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
        <p className="mt-2 text-xs text-yellow-700">Approaching {displayLabel.toLowerCase()} limit. You can create {usage.limit - usage.count} more.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{displayLabel} Usage: {usage.count} / {usage.limit}</span>
        <span className="text-sm font-semibold text-blue-700">{pct}%</span>
      </div>
      <div className="h-2 bg-white rounded-full overflow-hidden">
        <div className="h-full bg-blue-500 transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  )
}
