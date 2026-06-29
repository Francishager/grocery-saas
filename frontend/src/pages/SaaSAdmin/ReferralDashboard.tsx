import { useEffect, useState, useCallback } from 'react'
import { Gift, Users, TrendingUp, Award, Loader2, Building2, Copy } from 'lucide-react'
import { referralApi, type AdminReferralStats, type TopReferrer, type Referral } from '@/lib/api'
import { Button } from '@/components/ui/button'

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'text-slate-600 bg-slate-100' },
  invited: { label: 'Invited', color: 'text-blue-600 bg-blue-50' },
  signed_up: { label: 'Signed Up', color: 'text-indigo-600 bg-indigo-50' },
  subscribed: { label: 'Subscribed', color: 'text-purple-600 bg-purple-50' },
  completed: { label: 'Completed', color: 'text-green-600 bg-green-50' },
  expired: { label: 'Expired', color: 'text-red-500 bg-red-50' },
  cancelled: { label: 'Cancelled', color: 'text-red-500 bg-red-50' },
}

export default function ReferralDashboard() {
  const [stats, setStats] = useState<AdminReferralStats | null>(null)
  const [topReferrers, setTopReferrers] = useState<TopReferrer[]>([])
  const [recentReferrals, setRecentReferrals] = useState<Referral[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [allReferrals, setAllReferrals] = useState<Referral[]>([])
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  const loadStats = useCallback(async () => {
    try {
      const data = await referralApi.adminStats()
      setStats(data.stats)
      setTopReferrers(data.topReferrers)
      setRecentReferrals(data.recentReferrals)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  const loadAll = useCallback(async (p: number) => {
    try {
      const data = await referralApi.adminAll(p, 10)
      setAllReferrals(data.referrals)
      setTotalPages(data.pagination.pages)
      setTotal(data.pagination.total)
    } catch {
      // silent
    }
  }, [])

  useEffect(() => { loadStats() }, [loadStats])
  useEffect(() => { loadAll(page) }, [loadAll, page])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Gift className="h-7 w-7 text-primary" />
          Referral Program
        </h1>
        <p className="text-muted-foreground mt-1">Platform-wide referral analytics and management.</p>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: 'Total Codes', value: stats.totalCodes, icon: Gift, color: 'text-blue-600 bg-blue-50' },
            { label: 'Total Referrals', value: stats.totalReferrals, icon: Users, color: 'text-indigo-600 bg-indigo-50' },
            { label: 'Pending', value: stats.pendingReferrals, icon: TrendingUp, color: 'text-amber-600 bg-amber-50' },
            { label: 'Completed', value: stats.completedReferrals, icon: TrendingUp, color: 'text-green-600 bg-green-50' },
            { label: 'Conversion', value: `${stats.conversionRate}%`, icon: TrendingUp, color: 'text-purple-600 bg-purple-50' },
            { label: 'Rewards Claimed', value: stats.claimedRewards, icon: Award, color: 'text-rose-600 bg-rose-50' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.color}`}>
                <stat.icon className="h-5 w-5" />
              </div>
              <p className="mt-3 text-2xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Top Referrers */}
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="border-b p-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              Top Referrers
            </h2>
          </div>
          {topReferrers.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No referral data yet.</p>
          ) : (
            <div className="divide-y">
              {topReferrers.map((ref, idx) => (
                <div key={ref.tenant.id} className="flex items-center gap-4 p-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{ref.tenant.name}</p>
                    <p className="text-xs text-muted-foreground">{ref.tenant.email}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <div className="text-center">
                      <p className="font-semibold">{ref.totalReferrals}</p>
                      <p className="text-muted-foreground">Referrals</p>
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-green-600">{ref.completed}</p>
                      <p className="text-muted-foreground">Done</p>
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-amber-600">{ref.rewardsClaimed}</p>
                      <p className="text-muted-foreground">Claimed</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Referrals */}
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="border-b p-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Recent Activity
            </h2>
          </div>
          {recentReferrals.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No referral activity yet.</p>
          ) : (
            <div className="divide-y max-h-[400px] overflow-y-auto">
              {recentReferrals.map((ref) => {
                const status = statusConfig[ref.status] || statusConfig.pending
                return (
                  <div key={ref.id} className="flex items-center gap-3 p-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{ref.referredEmail}</p>
                      <p className="text-xs text-muted-foreground">
                        Referred by {ref.referrerTenant?.name || 'Unknown'}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.color}`}>
                      {status.label}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* All Referrals Table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="border-b p-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">All Referrals ({total})</h2>
        </div>
        {allReferrals.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No referrals found.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Referred Email</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Referrer</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Code</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Reward</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {allReferrals.map((ref) => {
                    const status = statusConfig[ref.status] || statusConfig.pending
                    return (
                      <tr key={ref.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{ref.referredEmail}</td>
                        <td className="px-4 py-3">{ref.referrerTenant?.name || '—'}</td>
                        <td className="px-4 py-3 font-mono text-xs">{ref.referralCode?.code || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.color}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {ref.rewardStatus === 'claimed' ? 'Claimed' : ref.rewardStatus === 'unclaimed' ? 'Pending' : '—'}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{new Date(ref.createdAt).toLocaleDateString()}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t p-4">
                <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
