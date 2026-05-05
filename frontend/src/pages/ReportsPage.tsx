import { useEffect, useState } from 'react'
import { TrendingUp, Users, Package, Calendar } from 'lucide-react'
import { reportsApi, type TopProduct, type StaffLeaderboard, type DailyReport, type MonthlyReport } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

export default function ReportsPage() {
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [staffLeaderboard, setStaffLeaderboard] = useState<StaffLeaderboard[]>([])
  const [dailyReports, setDailyReports] = useState<DailyReport[]>([])
  const [monthlyReports, setMonthlyReports] = useState<MonthlyReport[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    loadReports()
  }, [])

  const loadReports = async () => {
    try {
      const [products, staff, daily, monthly] = await Promise.all([
        reportsApi.getProducts(),
        reportsApi.getStaff(),
        reportsApi.getDaily(),
        reportsApi.getMonthly(),
      ])
      setTopProducts(products)
      setStaffLeaderboard(staff)
      setDailyReports(daily.slice(-7)) // Last 7 days
      setMonthlyReports(monthly.slice(-6)) // Last 6 months
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to load reports',
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
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground">
          Business analytics and performance metrics
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Products */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              <CardTitle>Top Products</CardTitle>
            </div>
            <CardDescription>Best performing products by profit</CardDescription>
          </CardHeader>
          <CardContent>
            {topProducts.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No data yet</p>
            ) : (
              <div className="space-y-3">
                {topProducts.map((product, index) => (
                  <div key={index} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-medium">{product.product}</p>
                      <p className="text-sm text-muted-foreground">
                        {product.quantity} sold
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-green-600">
                        {formatCurrency(product.profit)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatCurrency(product.revenue)} revenue
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Staff Leaderboard */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <CardTitle>Staff Leaderboard</CardTitle>
            </div>
            <CardDescription>Top performing staff members</CardDescription>
          </CardHeader>
          <CardContent>
            {staffLeaderboard.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No data yet</p>
            ) : (
              <div className="space-y-3">
                {staffLeaderboard.map((staff, index) => (
                  <div key={index} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium">{staff.staff}</p>
                        <p className="text-sm text-muted-foreground">
                          {staff.sales_count} sales
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-green-600">
                        {formatCurrency(staff.profit)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatCurrency(staff.total_revenue)} revenue
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Daily Reports */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <CardTitle>Daily Summary</CardTitle>
            </div>
            <CardDescription>Last 7 days performance</CardDescription>
          </CardHeader>
          <CardContent>
            {dailyReports.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No data yet</p>
            ) : (
              <div className="space-y-2">
                {dailyReports.map((day) => (
                  <div key={day.date} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                    <span className="text-muted-foreground">{day.date}</span>
                    <div className="flex gap-4">
                      <span>Gross: {formatCurrency(day.gross)}</span>
                      <span className="text-green-600">Profit: {formatCurrency(day.profit)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monthly Reports */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <CardTitle>Monthly Summary</CardTitle>
            </div>
            <CardDescription>Last 6 months performance</CardDescription>
          </CardHeader>
          <CardContent>
            {monthlyReports.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No data yet</p>
            ) : (
              <div className="space-y-2">
                {monthlyReports.map((month) => (
                  <div key={month.month} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                    <span className="text-muted-foreground">{month.month}</span>
                    <div className="flex gap-4">
                      <span>Gross: {formatCurrency(month.gross)}</span>
                      <span className="text-green-600">Profit: {formatCurrency(month.profit)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
