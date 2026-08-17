import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, Banknote, Briefcase, CalendarClock, Clock, FileText, TrendingUp, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'

interface DashboardData {
  stats: Record<string, number>
  charts: Record<string, Array<Record<string, any>>>
  insights: string[]
}

const statLabels: Array<{ key: string; label: string; icon: any }> = [
  { key: 'totalEmployees', label: 'Total Employees', icon: Users },
  { key: 'activeEmployees', label: 'Active Employees', icon: Users },
  { key: 'employeesPresentToday', label: 'Present Today', icon: Clock },
  { key: 'employeesAbsentToday', label: 'Absent Today', icon: Clock },
  { key: 'lateEmployees', label: 'Late Employees', icon: CalendarClock },
  { key: 'employeesOnShift', label: 'On Shift', icon: Activity },
  { key: 'monthlyPayroll', label: 'Monthly Payroll', icon: Banknote },
  { key: 'salaryPayable', label: 'Salary Payable', icon: Banknote },
  { key: 'salaryPaidThisMonth', label: 'Salary Paid This Month', icon: Banknote },
  { key: 'outstandingSalaryAdvances', label: 'Salary Advances', icon: TrendingUp },
  { key: 'payrollAwaitingApproval', label: 'Payroll Awaiting Approval', icon: Briefcase },
  { key: 'leaveRequestsAwaitingApproval', label: 'Leave Awaiting Approval', icon: FileText },
  { key: 'overtimeAwaitingApproval', label: 'Overtime Awaiting Approval', icon: Clock },
  { key: 'contractsExpiringSoon', label: 'Contracts Expiring Soon', icon: FileText },
  { key: 'employeesOnProbation', label: 'On Probation', icon: Users },
  { key: 'newHires', label: 'New Hires', icon: Users },
]

const quickLinks = [
  { label: 'Employees', route: '/tenant/hr/employees', icon: Users },
  { label: 'Departments', route: '/tenant/hr/departments', icon: Briefcase },
  { label: 'Positions', route: '/tenant/hr/positions', icon: Briefcase },
  { label: 'Attendance', route: '/tenant/hr/attendance', icon: Clock },
  { label: 'Leave', route: '/tenant/hr/leaves', icon: FileText },
  { label: 'Shifts', route: '/tenant/hr/shifts', icon: CalendarClock },
  { label: 'Contracts', route: '/tenant/hr/contracts', icon: FileText },
]

function formatNumber(key: string, value: number) {
  if (['monthlyPayroll', 'salaryPayable', 'salaryPaidThisMonth', 'outstandingSalaryAdvances'].includes(key)) {
    return Number(value || 0).toLocaleString()
  }
  if (key === 'employeeTurnover') return `${Number(value || 0).toFixed(1)}%`
  return Number(value || 0).toLocaleString()
}

function MiniBarChart({ data, valueKey = 'value' }: { data: Array<Record<string, any>>; valueKey?: string }) {
  const max = Math.max(1, ...data.map((row) => Number(row[valueKey] || 0)))
  return (
    <div className="space-y-2">
      {data.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">No data recorded yet</div>
      ) : data.map((row) => (
        <div key={row.label} className="grid grid-cols-[96px_1fr_72px] items-center gap-3 text-sm">
          <span className="truncate text-muted-foreground">{row.label}</span>
          <div className="h-2 rounded bg-slate-100">
            <div className="h-2 rounded bg-primary" style={{ width: `${Math.max(4, (Number(row[valueKey] || 0) / max) * 100)}%` }} />
          </div>
          <span className="text-right font-medium tabular-nums">{Number(row[valueKey] || 0).toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

export default function HRDashboardPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const loadDashboard = async () => {
    try {
      setLoading(true)
      const res = await apiFetch('/api/hr/dashboard')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || body.message || 'Failed to load HR dashboard')
      }
      setData(await res.json())
    } catch (error) {
      toast({ variant: 'destructive', title: 'Failed to load HR dashboard', description: (error as Error).message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  const stats = data?.stats || {}
  const departmentHeadcount = useMemo(() => data?.charts?.departmentHeadcount || [], [data])
  const payrollTrend = useMemo(() => data?.charts?.payrollTrend || [], [data])
  const headcount = useMemo(() => data?.charts?.headcount || [], [data])
  const attendanceTrend = useMemo(() => data?.charts?.attendanceTrend || [], [data])

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">HR Management</h1>
          <p className="text-sm text-muted-foreground">Live workforce, attendance, leave, and payroll overview.</p>
        </div>
        <Button variant="outline" onClick={loadDashboard} disabled={loading}>Refresh</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statLabels.map(({ key, label, icon: Icon }) => (
          <Card key={key}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">{label}</p>
                <p className="text-xl font-semibold tabular-nums">{loading ? '-' : formatNumber(key, Number(stats[key] || 0))}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Payroll Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <MiniBarChart data={payrollTrend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Headcount Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <MiniBarChart data={headcount} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Department Headcount</CardTitle>
          </CardHeader>
          <CardContent>
            <MiniBarChart data={departmentHeadcount} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Attendance Last 7 Days</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {attendanceTrend.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">No attendance recorded yet</div>
            ) : attendanceTrend.map((row) => (
              <div key={row.label} className="grid grid-cols-[72px_1fr_1fr] gap-2 text-sm">
                <span className="text-muted-foreground">{row.label}</span>
                <span className="rounded bg-green-50 px-2 py-1 text-green-700">Present {Number(row.present || 0)}</span>
                <span className="rounded bg-red-50 px-2 py-1 text-red-700">Absent {Number(row.absent || 0)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Management Insights</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.insights || []).map((insight) => (
              <div key={insight} className="rounded-md border bg-muted/30 px-3 py-2 text-sm">{insight}</div>
            ))}
            {!loading && (!data?.insights || data.insights.length === 0) && (
              <div className="py-4 text-sm text-muted-foreground">Insights will appear as HR records are added.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>HR Work Areas</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {quickLinks.map(({ label, route, icon: Icon }) => (
              <Button key={route} variant="outline" className="justify-start gap-2" onClick={() => navigate(route)}>
                <Icon className="h-4 w-4" />
                {label}
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
