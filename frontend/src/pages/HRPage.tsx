import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { apiFetch } from '@/lib/api'
import { Users, Plus, Calendar, Clock, DollarSign, Check, X } from 'lucide-react'
import { useOnlineStatus } from '@/db/hooks'
import { getLocalEmployees, getLocalLeaveRequests, getLocalPayroll } from '@/db/hybrid'

interface Employee {
  id: string
  firstName: string
  lastName: string
  email?: string
  phone?: string
  position?: string
  department?: string
  salary: number
  payFrequency: string
  hireDate: string
  status: string
  branch?: { id: string; name: string }
}

interface LeaveRequest {
  id: string
  leaveType: string
  startDate: string
  endDate: string
  days: number
  reason?: string
  status: string
  employee: { id: string; firstName: string; lastName: string }
}

interface PayrollRecord {
  id: string
  period: string
  grossSalary: number
  deductions: number
  netSalary: number
  bonus: number
  status: string
  paidAt?: string
  employee: { id: string; firstName: string; lastName: string; position?: string }
}

export default function HRPage() {
  const { toast } = useToast()
  const online = useOnlineStatus()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [payroll, setPayroll] = useState<PayrollRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showPayrollModal, setShowPayrollModal] = useState(false)

  // Form
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [position, setPosition] = useState('')
  const [department, setDepartment] = useState('')
  const [salary, setSalary] = useState(0)
  const [payFrequency, setPayFrequency] = useState('monthly')

  // Payroll form
  const [payrollPeriod, setPayrollPeriod] = useState('')
  const [payrollDeductions, setPayrollDeductions] = useState(0)
  const [payrollBonus, setPayrollBonus] = useState(0)

  const fetchEmployees = async () => {
    try {
      if (online) {
        const res = await apiFetch('/api/hr')
        if (res.ok) setEmployees(await res.json())
      } else {
        setEmployees(await getLocalEmployees() as any)
      }
    } catch (err) {
      try { setEmployees(await getLocalEmployees() as any) } catch {}
    }
    finally { setLoading(false) }
  }

  const fetchLeaves = async () => {
    try {
      if (online) {
        const res = await apiFetch('/api/hr/leave-requests')
        if (res.ok) setLeaveRequests(await res.json())
      } else {
        setLeaveRequests(await getLocalLeaveRequests() as any)
      }
    } catch (err) {
      try { setLeaveRequests(await getLocalLeaveRequests() as any) } catch {}
    }
  }

  const fetchPayroll = async () => {
    try {
      if (online) {
        const res = await apiFetch('/api/hr/payroll')
        if (res.ok) setPayroll(await res.json())
      } else {
        setPayroll(await getLocalPayroll() as any)
      }
    } catch (err) {
      try { setPayroll(await getLocalPayroll() as any) } catch {}
    }
  }

  useEffect(() => {
    fetchEmployees()
    fetchLeaves()
    fetchPayroll()
  }, [])

  const handleCreate = async () => {
    if (!firstName || !lastName) return toast({ variant: 'destructive', title: 'First and last name required' })
    try {
      const res = await apiFetch('/api/hr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, email, phone, position, department, salary, payFrequency }),
      })
      if (res.ok) {
        toast({ title: 'Employee added' })
        setShowModal(false)
        setFirstName(''); setLastName(''); setEmail(''); setPhone(''); setPosition(''); setDepartment(''); setSalary(0)
        fetchEmployees()
      } else {
        const data = await res.json()
        toast({ variant: 'destructive', title: data.error })
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Failed to add employee' })
    }
  }

  const handleRunPayroll = async () => {
    if (!payrollPeriod) return toast({ variant: 'destructive', title: 'Period required' })
    try {
      const res = await apiFetch('/api/hr/payroll/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period: payrollPeriod, deductions: payrollDeductions, bonus: payrollBonus }),
      })
      if (res.ok) {
        const data = await res.json()
        toast({ title: `Payroll run: ${data.count} employees` })
        setShowPayrollModal(false)
        setPayrollPeriod(''); setPayrollDeductions(0); setPayrollBonus(0)
        fetchPayroll()
      } else {
        const data = await res.json()
        toast({ variant: 'destructive', title: data.error })
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Failed to run payroll' })
    }
  }

  const handleApproveLeave = async (id: string, status: string) => {
    try {
      const res = await apiFetch(`/api/hr/leave-requests/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) {
        toast({ title: `Leave ${status}` })
        fetchLeaves()
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Failed to update leave' })
    }
  }

  const handlePayPayroll = async (id: string) => {
    try {
      const res = await apiFetch(`/api/hr/payroll/${id}/pay`, { method: 'PUT' })
      if (res.ok) {
        toast({ title: 'Payment recorded' })
        fetchPayroll()
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Failed to record payment' })
    }
  }

  const statusColor: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    terminated: 'bg-red-100 text-red-800',
    on_leave: 'bg-yellow-100 text-yellow-800',
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    paid: 'bg-green-100 text-green-800',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">HR Management</h1>
        <p className="text-muted-foreground">Employees, attendance, leave, and payroll</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Users className="h-4 w-4" /> Employees</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{employees.length}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Calendar className="h-4 w-4" /> Pending Leave</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{leaveRequests.filter(l => l.status === 'pending').length}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><DollarSign className="h-4 w-4" /> Monthly Payroll</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{employees.reduce((s, e) => s + e.salary, 0).toFixed(0)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Clock className="h-4 w-4" /> Active</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{employees.filter(e => e.status === 'active').length}</div></CardContent></Card>
      </div>

      <Tabs defaultValue="employees">
        <TabsList>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="leave">Leave Requests</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
        </TabsList>

        {/* Employees */}
        <TabsContent value="employees" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={showModal} onOpenChange={setShowModal}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Add Employee</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Employee</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><Label>First Name</Label><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
                    <div><Label>Last Name</Label><Input value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                    <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><Label>Position</Label><Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="e.g. Cashier" /></div>
                    <div><Label>Department</Label><Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Sales" /></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><Label>Salary</Label><Input type="number" value={salary} onChange={(e) => setSalary(Number(e.target.value))} /></div>
                    <div>
                      <Label>Pay Frequency</Label>
                      <Select value={payFrequency} onValueChange={setPayFrequency}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="biweekly">Bi-weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <DialogFooter><Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button><Button onClick={handleCreate}>Add</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="space-y-2">
            {employees.map((emp) => (
              <div key={emp.id} className="flex items-center justify-between rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-medium text-primary">
                    {emp.firstName[0]}{emp.lastName[0]}
                  </div>
                  <div>
                    <p className="font-medium">{emp.firstName} {emp.lastName}</p>
                    <p className="text-sm text-muted-foreground">{emp.position || '—'} • {emp.department || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-medium">{emp.salary.toFixed(0)}</p>
                    <p className="text-xs text-muted-foreground">{emp.payFrequency}</p>
                  </div>
                  <Badge className={statusColor[emp.status] || 'bg-gray-100'}>{emp.status}</Badge>
                </div>
              </div>
            ))}
            {employees.length === 0 && !loading && <div className="text-center py-8 text-muted-foreground">No employees yet</div>}
          </div>
        </TabsContent>

        {/* Leave Requests */}
        <TabsContent value="leave" className="space-y-4">
          <div className="space-y-2">
            {leaveRequests.map((leave) => (
              <div key={leave.id} className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="font-medium">{leave.employee.firstName} {leave.employee.lastName}</p>
                  <p className="text-sm text-muted-foreground">{leave.leaveType} • {leave.days} day(s) • {new Date(leave.startDate).toLocaleDateString()} → {new Date(leave.endDate).toLocaleDateString()}</p>
                  {leave.reason && <p className="text-sm text-muted-foreground mt-1">{leave.reason}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={statusColor[leave.status] || 'bg-gray-100'}>{leave.status}</Badge>
                  {leave.status === 'pending' && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => handleApproveLeave(leave.id, 'approved')}><Check className="h-4 w-4" /></Button>
                      <Button size="sm" variant="outline" onClick={() => handleApproveLeave(leave.id, 'rejected')}><X className="h-4 w-4" /></Button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {leaveRequests.length === 0 && <div className="text-center py-8 text-muted-foreground">No leave requests</div>}
          </div>
        </TabsContent>

        {/* Payroll */}
        <TabsContent value="payroll" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={showPayrollModal} onOpenChange={setShowPayrollModal}>
              <DialogTrigger asChild><Button><DollarSign className="h-4 w-4 mr-2" /> Run Payroll</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Run Payroll</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div><Label>Period</Label><Input value={payrollPeriod} onChange={(e) => setPayrollPeriod(e.target.value)} placeholder="e.g. 2025-01" /></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><Label>Deductions</Label><Input type="number" value={payrollDeductions} onChange={(e) => setPayrollDeductions(Number(e.target.value))} /></div>
                    <div><Label>Bonus</Label><Input type="number" value={payrollBonus} onChange={(e) => setPayrollBonus(Number(e.target.value))} /></div>
                  </div>
                </div>
                <DialogFooter><Button variant="outline" onClick={() => setShowPayrollModal(false)}>Cancel</Button><Button onClick={handleRunPayroll}>Run</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="space-y-2">
            {payroll.map((rec) => (
              <div key={rec.id} className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="font-medium">{rec.employee.firstName} {rec.employee.lastName}</p>
                  <p className="text-sm text-muted-foreground">Period: {rec.period} • {rec.employee.position || '—'}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-medium">{rec.netSalary.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">Gross: {rec.grossSalary.toFixed(0)} - Ded: {rec.deductions.toFixed(0)} + Bonus: {rec.bonus.toFixed(0)}</p>
                  </div>
                  <Badge className={statusColor[rec.status] || 'bg-gray-100'}>{rec.status}</Badge>
                  {rec.status === 'pending' && <Button size="sm" onClick={() => handlePayPayroll(rec.id)}>Pay</Button>}
                </div>
              </div>
            ))}
            {payroll.length === 0 && <div className="text-center py-8 text-muted-foreground">No payroll records. Run payroll to generate.</div>}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
