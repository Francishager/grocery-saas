import { useEffect, useState } from 'react'
import { Building2, Users, CreditCard, TrendingUp, DollarSign, Activity } from 'lucide-react'
import { adminApi, type AdminMetrics, type Business, type Subscription } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

export default function AdminPage() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null)
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    loadAdminData()
  }, [])

  const loadAdminData = async () => {
    try {
      const [metricsData, businessesData, subscriptionsData] = await Promise.all([
        adminApi.getMetrics(),
        adminApi.getBusinesses(),
        adminApi.getSubscriptions(),
      ])
      setMetrics(metricsData)
      setBusinesses(businessesData)
      setSubscriptions(subscriptionsData)
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to load admin data',
        description: error.message,
      })
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Platform administration and analytics
        </p>
      </div>

      {/* KPI Cards */}
      {metrics && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Businesses</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.cards.totalBusinesses}</div>
              <p className="text-xs text-muted-foreground">
                +{metrics.cards.totalRegistered} this month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.cards.activeSubscriptions}</div>
              <p className="text-xs text-muted-foreground">
                {metrics.churnRate}% churn rate
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(metrics.cards.monthlyRevenue)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Uptime</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.uptimeHours}h</div>
              <p className="text-xs text-muted-foreground">
                Server uptime
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Registrations */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Registrations</CardTitle>
            <CardDescription>New businesses on the platform</CardDescription>
          </CardHeader>
          <CardContent>
            {metrics?.recent.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No recent registrations</p>
            ) : (
              <div className="space-y-3">
                {metrics?.recent.map((business, index) => (
                  <div key={index} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-medium">{business.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {business.tier} plan
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {business.created_at ? new Date(business.created_at).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Plan Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Plan Distribution</CardTitle>
            <CardDescription>Subscription breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            {metrics?.charts.plans.labels.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No subscription data</p>
            ) : (
              <div className="space-y-3">
                {metrics?.charts.plans.labels.map((plan, index) => (
                  <div key={plan} className="flex items-center justify-between rounded-lg border p-3">
                    <span className="font-medium capitalize">{plan}</span>
                    <span className="font-bold">{metrics.charts.plans.data[index]}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Businesses List */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>All Businesses</CardTitle>
            <CardDescription>Registered businesses on the platform</CardDescription>
          </CardHeader>
          <CardContent>
            {businesses.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No businesses registered</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-3 font-medium">Name</th>
                      <th className="pb-3 font-medium">ID</th>
                      <th className="pb-3 font-medium">Tier</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {businesses.slice(0, 10).map((business) => (
                      <tr key={business.id} className="border-b last:border-0">
                        <td className="py-3 font-medium">{business.name}</td>
                        <td className="py-3 text-muted-foreground">{business.business_id}</td>
                        <td className="py-3 capitalize">{business.subscription_tier || '—'}</td>
                        <td className="py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                              business.is_active
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {business.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {new Date(business.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
