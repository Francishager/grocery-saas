import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, DollarSign, Package, AlertTriangle, ShoppingCart } from 'lucide-react'
import { dashboardApi, type DashboardKpis, type InventoryItem } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

export default function DashboardPage() {
  const [kpis, setKpis] = useState<DashboardKpis | null>(null)
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    try {
      const data = await dashboardApi.getKpis()
      setKpis(data)
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to load dashboard',
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

  if (!kpis) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Could not load dashboard data</p>
      </div>
    )
  }

  const k = kpis || {}

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your business performance
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(k.revenue || 0)}</div>
            {k.revenueChange != null && (
              <p className={`text-xs ${k.revenueChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {k.revenueChange >= 0 ? <TrendingUp className="inline h-3 w-3" /> : <TrendingDown className="inline h-3 w-3" />} {Math.abs(k.revenueChange)}% vs last month
          </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sales</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{k.salesCount ?? 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Payables</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(k.purchases || 0)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Customers</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{k.customerCount ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Low Stock Alert */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            <CardTitle>Low Stock Alert</CardTitle>
          </div>
          <CardDescription>
            {k.lowStockCount ?? 0} items need restocking
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(k.lowStockCount ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">All items are well stocked</p>
          ) : (
            <p className="text-sm text-muted-foreground">{k.lowStockCount} products are running low</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
