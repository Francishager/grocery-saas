import { useEffect, useState, useCallback } from 'react'
import { Gift, Copy, Share2, RefreshCw, Users, CheckCircle, Clock, TrendingUp, Award, Mail, Loader2, Send } from 'lucide-react'
import { referralApi, type MyReferralData, type ReferralReward } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: 'Pending', color: 'text-slate-500 bg-slate-100', icon: Clock },
  invited: { label: 'Invited', color: 'text-blue-600 bg-blue-50', icon: Mail },
  signed_up: { label: 'Signed Up', color: 'text-indigo-600 bg-indigo-50', icon: Users },
  subscribed: { label: 'Subscribed', color: 'text-purple-600 bg-purple-50', icon: TrendingUp },
  completed: { label: 'Completed', color: 'text-green-600 bg-green-50', icon: CheckCircle },
  expired: { label: 'Expired', color: 'text-red-500 bg-red-50', icon: Clock },
  cancelled: { label: 'Cancelled', color: 'text-red-500 bg-red-50', icon: Clock },
}

const rewardTypeLabels: Record<string, string> = {
  subscription_discount: 'Subscription Discount',
  free_months: 'Free Months',
  credit: 'Account Credit',
  feature_unlock: 'Feature Unlock',
}

export default function ReferralPage() {
  const [data, setData] = useState<MyReferralData | null>(null)
  const [rewards, setRewards] = useState<ReferralReward[]>([])
  const [loading, setLoading] = useState(true)
  const [referEmail, setReferEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const { toast } = useToast()

  const loadData = useCallback(async () => {
    try {
      const [codeData, rewardsData] = await Promise.all([
        referralApi.getMyCode(),
        referralApi.getRewards(),
      ])
      setData(codeData)
      setRewards(rewardsData.rewards)
    } catch {
      toast({ variant: 'destructive', title: 'Failed to load referral data' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { loadData() }, [loadData])

  const handleCopy = () => {
    if (!data?.code) return
    navigator.clipboard.writeText(data.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleShare = async () => {
    if (!data?.code) return
    const shareUrl = `${window.location.origin}/register?ref=${data.code}`
    const shareText = `Join jibuSales! Use my referral code ${data.code} to get started. ${shareUrl}`
    if (navigator.share) {
      try { await navigator.share({ title: 'Join jibuSales', text: shareText, url: shareUrl }) } catch {}
    } else {
      navigator.clipboard.writeText(shareText)
      toast({ title: 'Share link copied' })
    }
  }

  const handleRefer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!referEmail.trim()) return
    setSubmitting(true)
    try {
      await referralApi.refer(referEmail.trim())
      toast({ title: 'Referral sent', description: `Invitation sent to ${referEmail.trim()}` })
      setReferEmail('')
      await loadData()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Referral failed',
        description: err instanceof Error ? err.message : 'Could not send referral',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleRegenerate = async () => {
    setRegenerating(true)
    try {
      await referralApi.regenerateCode()
      await loadData()
      toast({ title: 'Referral code regenerated' })
    } catch {
      toast({ variant: 'destructive', title: 'Failed to regenerate code' })
    } finally {
      setRegenerating(false)
    }
  }

  const handleClaim = async (referralId: string) => {
    setClaimingId(referralId)
    try {
      await referralApi.claimReward(referralId)
      toast({ title: 'Reward claimed successfully' })
      await loadData()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Claim failed',
        description: err instanceof Error ? err.message : 'Could not claim reward',
      })
    } finally {
      setClaimingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const stats = data?.stats
  const shareUrl = `${window.location.origin}/register?ref=${data?.code || ''}`

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Gift className="h-7 w-7 text-primary" />
          Refer & Earn
        </h1>
        <p className="text-muted-foreground mt-1">Invite businesses to jibuSales and earn rewards for each successful referral.</p>
      </div>

      {/* Referral Code Card */}
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Label className="text-sm text-muted-foreground">Your Referral Code</Label>
            <div className="mt-1 flex items-center gap-3">
              <span className="text-2xl font-bold tracking-wider font-mono text-foreground">{data?.code}</span>
              <button onClick={handleCopy} className="flex h-9 w-9 items-center justify-center rounded-lg border hover:bg-muted transition" aria-label="Copy code">
                {copied ? <CheckCircle className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground break-all">Share link: {shareUrl}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share2 className="mr-2 h-4 w-4" /> Share
            </Button>
            <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={regenerating}>
              {regenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              New Code
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Total Referrals', value: stats.totalReferrals, icon: Users, color: 'text-blue-600 bg-blue-50' },
            { label: 'Signed Up', value: stats.signedUp, icon: TrendingUp, color: 'text-indigo-600 bg-indigo-50' },
            { label: 'Completed', value: stats.completed, icon: CheckCircle, color: 'text-green-600 bg-green-50' },
            { label: 'Rewards Claimed', value: stats.rewardsClaimed, icon: Award, color: 'text-amber-600 bg-amber-50' },
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
        {/* Refer a Business */}
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Invite a Business
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Enter the email of the business owner you want to refer.</p>
          <form onSubmit={handleRefer} className="mt-4 space-y-3">
            <div>
              <Input
                type="email"
                placeholder="owner@business.com"
                value={referEmail}
                onChange={(e) => setReferEmail(e.target.value)}
                required
                disabled={submitting}
              />
            </div>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</> : <><Send className="mr-2 h-4 w-4" /> Send Invitation</>}
            </Button>
          </form>
          <div className="mt-4 rounded-lg bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">
              <Award className="inline h-3.5 w-3.5 mr-1" />
              Reward: 10% subscription discount for each completed referral
            </p>
          </div>
        </div>

        {/* Claimed Rewards */}
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Award className="h-5 w-5 text-primary" />
            Claimed Rewards
          </h2>
          {rewards.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-4">No rewards claimed yet. Complete referrals to earn rewards.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {rewards.map((reward) => (
                <div key={reward.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{rewardTypeLabels[reward.type] || reward.type}</p>
                    <p className="text-xs text-muted-foreground">{reward.description || `For ${reward.referral?.referredEmail || 'referral'}`}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-green-600">{reward.value}{reward.type === 'subscription_discount' ? '%' : reward.type === 'free_months' ? ' mo' : ''}</p>
                    <p className="text-xs text-muted-foreground">{new Date(reward.claimedAt).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Referral History */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="border-b p-4">
          <h2 className="text-lg font-semibold">Referral History</h2>
        </div>
        {data?.referrals.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">No referrals yet. Start by inviting a business above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Reward</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data?.referrals.map((ref) => {
                  const status = statusConfig[ref.status] || statusConfig.pending
                  const StatusIcon = status.icon
                  return (
                    <tr key={ref.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{ref.referredEmail}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${status.color}`}>
                          <StatusIcon className="h-3 w-3" />
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs">
                          {rewardTypeLabels[ref.rewardType] || ref.rewardType}: {ref.rewardValue}{ref.rewardType === 'subscription_discount' ? '%' : ref.rewardType === 'free_months' ? ' mo' : ''}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{new Date(ref.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-right">
                        {ref.status === 'completed' && ref.rewardStatus === 'unclaimed' ? (
                          <Button
                            size="sm"
                            onClick={() => handleClaim(ref.id)}
                            disabled={claimingId === ref.id}
                          >
                            {claimingId === ref.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Claim'}
                          </Button>
                        ) : ref.rewardStatus === 'claimed' ? (
                          <span className="text-xs text-green-600 font-medium">Claimed</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
