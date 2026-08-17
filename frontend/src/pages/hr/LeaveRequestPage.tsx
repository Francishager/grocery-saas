import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { apiFetch } from '@/lib/api'
import { HRTable, HRColumn } from '@/components/hr/HRTable'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface LeaveType {
  id: string
  name: string
  code: string
  daysAllowedPerYear: number
}

interface EmployeeOption {
  id: string
  firstName: string
  lastName: string
  employeeNumber?: string
}

interface LeaveRequest {
  id: string
  employeeId: string
  employeeName: string
  leaveTypeId: string
  leaveTypeName: string
  startDate: string
  endDate: string
  reason: string
  status: string
  approvedBy?: string
  approvalNotes?: string
}

interface LeaveBalance {
  leaveTypeId: string
  leaveTypeName: string
  allowedDays: number
  usedDays: number
  availableDays: number
  carryoverDays: number
}

export default function LeaveRequestPage() {
  const { toast } = useToast()
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
  const [balances, setBalances] = useState<LeaveBalance[]>([])
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [loading, setLoading] = useState(true)
  const [openDialog, setOpenDialog] = useState(false)
  const [formData, setFormData] = useState({
    employeeId: '',
    leaveTypeId: '',
    startDate: '',
    endDate: '',
    reason: '',
  })

  const requestColumns: HRColumn[] = [
    {
      key: 'startDate',
      label: 'From Date',
      width: '12%',
      render: (v) => new Date(v).toLocaleDateString(),
    },
    {
      key: 'endDate',
      label: 'To Date',
      width: '12%',
      render: (v) => new Date(v).toLocaleDateString(),
    },
    { key: 'leaveTypeName', label: 'Leave Type', width: '15%' },
    { key: 'reason', label: 'Reason', width: '25%', render: (v) => v || '-' },
    {
      key: 'status',
      label: 'Status',
      width: '15%',
      render: (v) => {
        const variants: Record<string, any> = {
          draft: 'secondary',
          pending_l1: 'default',
          pending_l2: 'default',
          approved: 'default',
          rejected: 'destructive',
          cancelled: 'secondary',
        }
        return <Badge variant={variants[v] || 'secondary'}>{v}</Badge>
      },
    },
    {
      key: 'approvalNotes',
      label: 'Notes',
      width: '15%',
      render: (v) => v || '-',
    },
  ]

  const fetchRequests = async () => {
    try {
      setLoading(true)
      const res = await apiFetch('/api/hr/leave-requests')
      if (res.ok) {
        const data = await res.json()
        setRequests(data.requests || [])
      }
    } catch (error) {
      toast({ title: 'Error', description: (error as Error).message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const fetchLeaveTypes = async () => {
    try {
      const res = await apiFetch('/api/hr/leave-types')
      if (res.ok) {
        const data = await res.json()
        setLeaveTypes(data.data || [])
      }
    } catch (error) {
      console.error('Failed to fetch leave types:', error)
    }
  }

  const fetchEmployees = async () => {
    try {
      const res = await apiFetch('/api/hr/employees?take=500')
      if (res.ok) {
        const data = await res.json()
        const rows = Array.isArray(data.data) ? data.data : []
        setEmployees(rows)
        if (rows.length > 0 && !formData.employeeId) {
          setFormData((current) => ({ ...current, employeeId: rows[0].id }))
        }
      }
    } catch (error) {
      console.error('Failed to fetch employees:', error)
    }
  }

  const fetchBalances = async (selectedEmployeeId = formData.employeeId) => {
    try {
      if (!selectedEmployeeId) {
        setBalances([])
        return
      }
      const res = await apiFetch(`/api/hr/leave-balance/${selectedEmployeeId}`)
      if (res.ok) {
        const data = await res.json()
        setBalances(Array.isArray(data.data?.balances) ? data.data.balances : [])
      }
    } catch (error) {
      console.error('Failed to fetch balances:', error)
    }
  }

  const handleCreateRequest = async () => {
    if (!formData.employeeId || !formData.leaveTypeId || !formData.startDate || !formData.endDate) {
      toast({ title: 'Error', description: 'Please fill all required fields', variant: 'destructive' })
      return
    }

    try {
      const res = await apiFetch('/api/hr/leave-requests', {
        method: 'POST',
        body: JSON.stringify(formData),
      })

      if (res.ok) {
        toast({ title: 'Success', description: 'Leave request created' })
        setOpenDialog(false)
        setFormData((current) => ({ employeeId: current.employeeId, leaveTypeId: '', startDate: '', endDate: '', reason: '' }))
        fetchRequests()
        fetchBalances()
      } else {
        const error = await res.json()
        toast({ title: 'Error', description: error.message || 'Failed to create request', variant: 'destructive' })
      }
    } catch (error) {
      toast({ title: 'Error', description: (error as Error).message, variant: 'destructive' })
    }
  }

  const handleSubmit = async (requestId: string) => {
    try {
      const res = await apiFetch(`/api/hr/leave-requests/${requestId}/submit`, {
        method: 'POST',
      })

      if (res.ok) {
        toast({ title: 'Success', description: 'Request submitted for approval' })
        fetchRequests()
      }
    } catch (error) {
      toast({ title: 'Error', description: (error as Error).message, variant: 'destructive' })
    }
  }

  const handleCancel = async (requestId: string) => {
    if (!confirm('Cancel this leave request?')) return
    try {
      const res = await apiFetch(`/api/hr/leave-requests/${requestId}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: 'Cancelled by employee' }),
      })

      if (res.ok) {
        toast({ title: 'Success', description: 'Request cancelled' })
        fetchRequests()
      }
    } catch (error) {
      toast({ title: 'Error', description: (error as Error).message, variant: 'destructive' })
    }
  }

  useEffect(() => {
    fetchRequests()
    fetchLeaveTypes()
    fetchEmployees()
  }, [])

  useEffect(() => {
    fetchBalances(formData.employeeId)
  }, [formData.employeeId])

  return (
    <div className="space-y-4">
      {/* Leave Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {balances.map((balance) => (
          <Card key={balance.leaveTypeId}>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <h3 className="font-semibold text-sm text-gray-600">{balance.leaveTypeName}</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-gray-500">Allowed</div>
                    <div className="font-bold">{balance.allowedDays}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Used</div>
                    <div className="font-bold text-orange-600">{balance.usedDays}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Available</div>
                    <div className="font-bold text-green-600">{balance.availableDays}</div>
                  </div>
                  {balance.carryoverDays > 0 && (
                    <div>
                      <div className="text-gray-500">Carryover</div>
                      <div className="font-bold text-blue-600">{balance.carryoverDays}</div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Requests Table */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>My Leave Requests</CardTitle>
            <Button onClick={() => setOpenDialog(true)}>+ New Request</Button>
          </div>
        </CardHeader>
        <CardContent>
          <HRTable
            columns={requestColumns}
            data={requests}
            loading={loading}
            actions={[
              {
                label: 'Submit',
                onClick: (row) => handleSubmit(row.id),
                visible: (row) => row.status === 'draft',
                variant: 'default',
              },
              {
                label: 'Cancel',
                onClick: (row) => handleCancel(row.id),
                visible: (row) => !['rejected', 'cancelled', 'on_leave'].includes(row.status),
                variant: 'destructive',
              },
            ]}
          />
        </CardContent>
      </Card>

      {/* Create Request Dialog */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Leave Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Employee *</label>
              <select
                value={formData.employeeId}
                onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                className="w-full border rounded p-2 mt-1"
              >
                <option value="">Select employee</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {[employee.employeeNumber, employee.firstName, employee.lastName].filter(Boolean).join(' - ')}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">Leave Type *</label>
              <select
                value={formData.leaveTypeId}
                onChange={(e) => setFormData({ ...formData, leaveTypeId: e.target.value })}
                className="w-full border rounded p-2 mt-1"
              >
                <option value="">Select a leave type</option>
                {leaveTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name} ({type.daysAllowedPerYear} days/year)
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">From Date *</label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="w-full border rounded p-2 mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">To Date *</label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  className="w-full border rounded p-2 mt-1"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Reason</label>
              <textarea
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder="Optional reason for the leave"
                rows={3}
                className="w-full border rounded p-2 mt-1"
              />
            </div>

            <div className="flex gap-2 justify-end pt-4">
              <Button variant="outline" onClick={() => setOpenDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateRequest}>Create Request</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
